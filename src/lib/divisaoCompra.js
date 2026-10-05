// Compra "dividida": um mesmo pedido/cobrança (ex.: Mercado Livre) que cai em várias categorias.
// Cada parte é uma linha normal de `compras` (mesma data, cartão, pessoa e parcelas; categoria e valor próprios),
// ligadas por `grupo_id`. Assim todas as telas (categorias, orçamento, parcelas, fatura) seguem funcionando.
// Contas em centavos inteiros: a soma das partes tem que bater exatamente com o total.

export const emCentavos = (v) => Math.round(Number(v) * 100)
export const deCentavos = (c) => c / 100

export const somaPartes = (itens) => deCentavos(itens.reduce((s, i) => s + (emCentavos(i.valor) || 0), 0))
// Quanto falta (positivo) ou sobra (negativo) para as partes fecharem o total.
export const restante = (total, itens) => deCentavos(emCentavos(total) - itens.reduce((s, i) => s + (emCentavos(i.valor) || 0), 0))

// Devolve a lista de problemas (vazia = pode salvar).
export function validarDivisao(total, itens, categorias = []) {
  const erros = []
  if (!(emCentavos(total) > 0)) erros.push('Informe o valor total da compra.')
  if (itens.length < 2) erros.push('Divida em pelo menos duas partes.')
  itens.forEach((i, n) => {
    if (!(emCentavos(i.valor) > 0)) erros.push(`Parte ${n + 1}: informe o valor.`)
    const cat = categorias.find((c) => c.nome === i.categoria)
    if (!cat || !i.subcategoria || !(cat.subcategorias || []).includes(i.subcategoria)) erros.push(`Parte ${n + 1}: escolha a categoria e a subcategoria.`)
  })
  const falta = restante(total, itens)
  if (emCentavos(falta) !== 0) erros.push(falta > 0 ? `Faltam R$ ${falta.toFixed(2).replace('.', ',')} para fechar o total.` : `As partes passam do total em R$ ${Math.abs(falta).toFixed(2).replace('.', ',')}.`)
  return erros
}

const camposPartes = (i) => ({
  categoria: i.categoria, subcategoria: i.subcategoria, valor_total: deCentavos(emCentavos(i.valor)),
  identificacao: i.identificacao && i.identificacao.trim() ? i.identificacao.trim() : null,
})

// base: campos comuns (data_compra, descricao, pessoa, cartao_id, parcelas, obs, pago, data_pagamento...).
// existentes: linhas que já existem no banco (edição); itens com `id` atualizam, sem `id` entram, os que sumiram saem.
// grupoId: null quando a coluna grupo_id ainda não existe no banco (as partes ficam soltas, mas corretas).
export function planoDeDivisao({ base, itens, existentes = [], grupoId }) {
  const comGrupo = grupoId ? { grupo_id: grupoId } : {}
  const manter = new Set(itens.filter((i) => i.id).map((i) => i.id))
  return {
    atualizar: itens.filter((i) => i.id).map((i) => ({ id: i.id, dados: { ...base, ...camposPartes(i), ...comGrupo } })),
    inserir: itens.filter((i) => !i.id).map((i) => ({ ...base, ...camposPartes(i), ...comGrupo })),
    remover: existentes.filter((e) => !manter.has(e.id)).map((e) => e.id),
  }
}

// Desfaz a divisão: a primeira parte vira a compra inteira e as outras saem.
export function planoDeUniao({ base, total, categoria, subcategoria, identificacao, existentes }) {
  const [primeira, ...resto] = existentes
  return {
    atualizar: [{ id: primeira.id, dados: { ...base, categoria, subcategoria, valor_total: deCentavos(emCentavos(total)), identificacao: identificacao?.trim() || null, grupo_id: null } }],
    inserir: [],
    remover: resto.map((c) => c.id),
  }
}

export const partesDoGrupo = (compras, grupoId) => (grupoId ? compras.filter((c) => c.grupo_id === grupoId) : [])

// Para casar com fatura/notificação, o grupo vale como UMA compra (a soma das partes).
// Mantém o id da primeira parte, para "Vincular" apontar para uma compra que existe.
export function comprasComGruposSomados(compras) {
  const grupos = new Map()
  const resultado = []
  for (const c of compras) {
    if (!c.grupo_id) { resultado.push(c); continue }
    const g = grupos.get(c.grupo_id)
    if (!g) {
      const somada = { ...c, partes: 1 }
      grupos.set(c.grupo_id, somada)
      resultado.push(somada)
    } else {
      g.valor_total = deCentavos(emCentavos(g.valor_total) + emCentavos(c.valor_total))
      g.partes += 1
    }
  }
  return resultado
}
