import { chaveEstabelecimento, indexarAliases, similaridadeEstabelecimento } from './estabelecimento.js'
import { construirRegrasDoHistorico, sugerirCategoria, sugerirPorNome, categoriaValida } from './categorizacao.js'
import { pontuar } from './reconciliacao.js'
import { normBasico, normNome, round2 } from './normalizacao.js'
import { sugerirIdentificacao } from './nomesAmigaveis.js'
import { comprasComGruposSomados } from './divisaoCompra.js'
import { itensDaFatura } from './financeiro.js'
import { mesDaFatura } from './utils.js'

// Inteligência da importação de fatura (CSV): reconhecer o que já está lançado, sugerir categoria e nome.
// Tudo puro e testável; a tela só mostra o resultado.

const TOLERANCIA_VALOR = 0.02
// Rede de segurança: mesmo que cada linha pareça casada, "tudo lançado" só vale se os TOTAIS também fecham.
const TOLERANCIA_TOTAL = 0.1
const diasEntre = (a, b) => Math.abs(Date.parse(String(a).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(b).slice(0, 10) + 'T12:00:00Z')) / 86400000

// modo: 'parcela' = a coluna valor do CSV é o valor de UMA parcela (padrão de fatura de cartão);
//       'total'   = a coluna valor é o valor total da compra parcelada.
export function valorParcelaLinha(l, modo) {
  const v = Number(l.valor)
  const n = Number(l.parcela_total) || 1
  return n > 1 && modo === 'total' ? v / n : v
}
export function valorTotalLinha(l, modo) {
  const v = Number(l.valor)
  const n = Number(l.parcela_total) || 1
  return n > 1 && modo === 'parcela' ? round2(v * n) : v
}

// "Nubank Roxinho" -> cartão "Nubank" (só quando um único cartão combina; nunca escolhe entre vários).
export function resolverCartaoPorNome(nome, cartoes) {
  const n = normBasico(nome)
  if (!n) return null
  const exato = cartoes.filter((c) => normBasico(c.nome) === n)
  if (exato.length === 1) return exato[0]
  const parecidos = cartoes.filter((c) => { const cn = normBasico(c.nome); return cn && (n.includes(cn) || cn.includes(n)) })
  return parecidos.length === 1 ? parecidos[0] : null
}

// Para cada linha: com qual compra já lançada ela provavelmente coincide?
//   exata        mesmo cartão, mesmo nome, mesmo valor, até 1 dia de diferença
//   parecida     parecida o bastante (nome parecido e/ou alguns dias de diferença, ex.: veio do Telegram)
//   parcelamento linha de parcela em andamento cujo parcelamento já está em Compras
// Cada compra existente só "absorve" UMA linha: duas linhas iguais no arquivo e uma compra lançada
// = uma já lançada e uma nova (antes, as duas eram marcadas como já lançadas).
export function analisarLinhas(linhas, { compras: comprasLancadas = [], aliases = [] } = {}, modo = 'parcela') {
  // Compra dividida em categorias vale como UMA compra (soma das partes): a fatura traz a cobrança inteira.
  const compras = comprasComGruposSomados(comprasLancadas)
  const indice = indexarAliases(aliases)
  const usadas = new Set()
  const infos = linhas.map((l) => ({
    chave: chaveEstabelecimento(l.descricao, indice).chave,
    n: Number(l.parcela_total) || 1,
    k: Number(l.parcela_atual) || 1,
  }))
  const resultado = linhas.map(() => null)

  // 1ª passada: o que casa com valor igual (exata / parecida / parcelamento)
  linhas.forEach((l, idx) => {
    const { chave, n, k } = infos[idx]
    const livres = compras.filter((c) => !usadas.has(c.id))
    if (k > 1 && l.cartao_id) {
      const valorParcela = valorParcelaLinha(l, modo)
      const achada = livres.find((c) =>
        Number(c.parcelas) === n && c.cartao_id === l.cartao_id &&
        (normNome(c.descricao) === normNome(l.descricao) || chaveEstabelecimento(c.descricao, indice).chave === chave) &&
        Math.abs(Number(c.valor_total) / Number(c.parcelas) - valorParcela) < TOLERANCIA_VALOR)
      if (achada) { usadas.add(achada.id); resultado[idx] = { tipo: 'parcelamento', compra: achada, score: 1 } }
      return
    }
    const ev = {
      valor: valorTotalLinha(l, modo), data_evento: l.data, parcelas: n,
      cartao_id: l.cartao_id || null, estabelecimento_chave: chave,
    }
    let melhor = null
    for (const c of livres) {
      const p = pontuar(ev, c, indice)
      if (p && p.score >= 0.5 && (!melhor || p.score > melhor.score)) melhor = p
    }
    if (melhor) {
      usadas.add(melhor.compra.id)
      resultado[idx] = { tipo: melhor.exato ? 'exata' : 'parecida', compra: melhor.compra, score: melhor.score }
    }
  })

  // 2ª passada: o que sobrou procura a MESMA compra com valor diferente (ex.: juros/IOF, valor digitado errado).
  // Só depois da 1ª, para uma linha nova não "roubar" a compra que pertence a outra linha de valor igual.
  linhas.forEach((l, idx) => {
    if (resultado[idx] || !l.cartao_id) return
    const { chave, n, k } = infos[idx]
    const valorLinha = k > 1 ? valorParcelaLinha(l, modo) : valorTotalLinha(l, modo)
    const candidatas = compras
      .filter((c) => !usadas.has(c.id) && c.cartao_id === l.cartao_id && similaridadeEstabelecimento(chave, chaveEstabelecimento(c.descricao, indice).chave) >= 0.8)
      .filter((c) => (k > 1 || n > 1 ? Number(c.parcelas) === n : (Number(c.parcelas) || 1) === 1 && diasEntre(l.data, c.data_compra) <= 3))
      .map((c) => ({ c, d: Math.abs((k > 1 ? Number(c.valor_total) / Number(c.parcelas) : Number(c.valor_total)) - valorLinha) }))
      .sort((a, b) => a.d - b.d)
    if (!candidatas.length) return
    usadas.add(candidatas[0].c.id)
    resultado[idx] = { tipo: 'valor_diferente', compra: candidatas[0].c, score: 0.6 }
  })

  return linhas.map((_, idx) => ({ chave: infos[idx].chave, correspondencia: resultado[idx] }))
}

// Regras de categoria prontas para uso (calcula o histórico uma vez por arquivo, não por linha).
export const prepararRegras = ({ regras = [], compras = [], aliases = [] }) => ({
  banco: regras,
  historico: construirRegrasDoHistorico(compras, indexarAliases(aliases)),
})

// Categoria sugerida para a linha: regra aprendida (tabela) > histórico de compras > nome do lugar.
// Devolve null se não souber (nunca chuta).
export function sugerirCategoriaLinha(chave, { categorias = [], preparadas = { banco: [], historico: [] } } = {}) {
  const r = sugerirCategoria({ chave, regras: preparadas.banco, categorias }) || sugerirCategoria({ chave, regras: preparadas.historico, categorias })
  if (r) return { categoria: r.categoria, subcategoria: r.subcategoria, fonte: 'historico' }
  const n = sugerirPorNome({ chave, categorias })
  return n ? { categoria: n.categoria, subcategoria: n.subcategoria, fonte: 'nome' } : null
}

// O que impede a linha de ser importada (lista vazia = pronta).
export function problemasDaLinha(l, categorias, mesFatura, { normalizarData }) {
  const erros = []
  const atual = Number(l.parcela_atual) || 1
  const total = Number(l.parcela_total) || 1
  if (!normalizarData(l.data) || normalizarData(l.data) !== l.data) erros.push('data inválida')
  if (atual < 1 || atual > total) erros.push('parcela inválida')
  if (!l.descricao) erros.push('sem descrição')
  if (l.valor === '' || isNaN(Number(l.valor))) erros.push('valor inválido')
  if (!l.categoria || !categorias.some((c) => c.nome === l.categoria)) erros.push('falta a categoria')
  else if (!l.subcategoria || !categoriaValida(categorias, l.categoria, l.subcategoria)) erros.push('falta a subcategoria')
  if (!l.pessoa) erros.push('falta a pessoa')
  if (!l.cartao_id) erros.push('falta o cartão')
  if (atual > 1 && !mesFatura) erros.push('falta o mês da fatura')
  return erros
}

// Resumo do arquivo para o aviso do topo.
export function resumirAnalise(linhas) {
  const ja = (l) => l.correspondencia && ['exata', 'parecida', 'parcelamento', 'valor_diferente'].includes(l.correspondencia.tipo)
  const total = linhas.length
  const jaLancadas = linhas.filter(ja).length
  return {
    total,
    jaLancadas,
    exatas: linhas.filter((l) => l.correspondencia?.tipo === 'exata').length,
    parecidas: linhas.filter((l) => l.correspondencia?.tipo === 'parecida').length,
    valoresDiferentes: linhas.filter((l) => l.correspondencia?.tipo === 'valor_diferente').length,
    parcelamentos: linhas.filter((l) => l.correspondencia?.tipo === 'parcelamento').length,
    novas: total - jaLancadas,
    repetidasNoArquivo: linhas.filter((l) => l.duplicataCsv).length,
    // quase tudo já está em Compras: provavelmente o mesmo arquivo (ou outro do mesmo período) já foi importado
    pareceJaImportado: total >= 3 && jaLancadas / total >= 0.7,
  }
}

// Sugestão de nome para a coluna Identificação.
export const sugerirNomeLinha = (descricao, { compras = [], aliases = [] } = {}) =>
  sugerirIdentificacao({ descricao, compras, indiceAliases: indexarAliases(aliases) })

const dif = (a, b) => Math.round((a - b) * 100) / 100

// Conferência de UMA fatura (cartão + mês) entre o CSV e o que está lançado. Responde "o que falta lançar?":
//   faltaLancar     está no CSV e não está no Finapp
//   sobrandoNoFinapp está lançado neste cartão e mês e não aparece no CSV (lançado a mais, de outro mês, nome muito diferente...)
//   valorDiferente   parece a mesma compra nos dois lados, mas com valores diferentes
//   contaFixa        linha do CSV que já é uma conta fixa paga neste cartão
// `linhas` já vêm de analisarLinhas (com `correspondencia`). Valores são sempre os da PARCELA que cai no mês.
export function conferirFatura({ linhas, compras, cartoes, fixos = [], cartaoId, mes, aliases = [] }, modo = 'parcela') {
  const indice = indexarAliases(aliases)
  const doCartao = linhas.filter((l) => l.cartao_id === cartaoId && l.valor !== '' && !Number.isNaN(Number(l.valor)))
  const { itens, fixos: fixosNoCartao } = itensDaFatura(comprasComGruposSomados(compras), cartoes, cartaoId, mes, fixos)
  const idsCasados = new Set(doCartao.map((l) => l.correspondencia?.compra?.id).filter(Boolean))

  let faltaLancar = doCartao.filter((l) => !l.correspondencia)
  let sobrando = itens.filter((i) => !idsCasados.has(i.compra.id))
  const chaveDe = (d) => chaveEstabelecimento(d, indice).chave

  // linhas do CSV que são uma conta fixa deste cartão (mesmo lugar e valor): não faltam, já existem como fixo
  const contaFixa = []
  const fixosLivres = [...fixosNoCartao]
  faltaLancar = faltaLancar.filter((l) => {
    const i = fixosLivres.findIndex((f) => Math.abs(f.valor - valorParcelaLinha(l, modo)) < TOLERANCIA_VALOR && similaridadeEstabelecimento(chaveDe(l.descricao), chaveDe(f.nome)) >= 0.8)
    if (i < 0) return true
    contaFixa.push({ linha: l, fixo: fixosLivres[i] })
    fixosLivres.splice(i, 1)
    return false
  })

  // mesma compra com valor diferente: já veio pareada da análise (tipo 'valor_diferente')
  const valorDiferente = []
  for (const l of doCartao.filter((x) => x.correspondencia?.tipo === 'valor_diferente')) {
    const compra = l.correspondencia.compra
    const item = itens.find((i) => i.compra.id === compra.id)
    const csv = valorParcelaLinha(l, modo)
    const app = item ? item.valor : (Number(compra.parcelas) > 1 ? Number(compra.valor_total) / Number(compra.parcelas) : Number(compra.valor_total))
    valorDiferente.push({ linha: l, item: item || { compra, valor: app, parcela: 1, de: Number(compra.parcelas) || 1 }, csv, app, diferenca: dif(csv, app) })
  }

  // linha reconhecida como já lançada, mas a compra NÃO cai nesta fatura (outro mês, outro cartão ou data
  // que o fechamento joga para outra fatura): sem isso o painel diria "tudo lançado" com a fatura faltando.
  const foraDoMes = doCartao
    .filter((l) => l.correspondencia?.compra && l.correspondencia.tipo !== 'valor_diferente' && !itens.some((i) => i.compra.id === l.correspondencia.compra.id))
    .map((l) => {
      const compra = l.correspondencia.compra
      const cartaoDaCompra = cartoes.find((c) => c.id === compra.cartao_id)
      return { linha: l, compra, valor: valorParcelaLinha(l, modo), mesDaCompra: mesDaFatura(compra, cartaoDaCompra), outroCartao: compra.cartao_id !== cartaoId, cartaoNome: cartaoDaCompra?.nome || null }
    })

  const soma = (xs, f) => dif(xs.reduce((t, x) => t + f(x), 0), 0)
  const totalCsv = soma(doCartao, (l) => valorParcelaLinha(l, modo))
  const sobrandoTotal = soma(sobrando, (i) => i.valor) + soma(fixosLivres, (f) => f.valor)
  const totalFinapp = soma(itens, (i) => i.valor) + soma(fixosNoCartao, (f) => f.valor)
  return {
    cartaoId, mes,
    totalCsv,
    totalFinapp,
    faltaLancar: faltaLancar.map((l) => ({ linha: l, valor: valorParcelaLinha(l, modo) })),
    sobrandoNoFinapp: [
      ...sobrando.map((i) => ({ compra: i.compra, parcela: i.parcela, de: i.de, valor: i.valor })),
      ...fixosLivres.map((f) => ({ fixo: f, valor: f.valor })),
    ],
    valorDiferente,
    contaFixa,
    foraDoMes,
    totais: {
      fora: soma(foraDoMes, (f) => f.valor),
      falta: soma(faltaLancar, (l) => valorParcelaLinha(l, modo)),
      sobra: sobrandoTotal,
      valores: soma(valorDiferente, (v) => v.diferenca),
    },
    bate: faltaLancar.length === 0 && sobrando.length === 0 && fixosLivres.length === 0 && valorDiferente.length === 0 && foraDoMes.length === 0
      && Math.abs(totalCsv - totalFinapp) <= TOLERANCIA_TOTAL,
  }
}

