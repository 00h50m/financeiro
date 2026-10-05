// DIVIDIDOS: parte de uma compra ou conta fixa que é de outra pessoa (ex.: Mãe paga parte do convênio).
// Modelo (em docs/conceitos-financeiros.md):
//  - A fatura do cartão e o valor da conta continuam CHEIOS: o dinheiro que sai da conta é o valor todo.
//  - Teto e categorias contam só a parte da pessoa que usa o app (valor líquido).
//  - A parte dos outros fica "a receber" até ser marcada como recebida; só então entra como receita do mês
//    (divisoes_repasses), então a sobra nunca conta com dinheiro que ainda não chegou.
// Funções puras. `d` = { divisoes, divisoesRepasses, compras, fixos, cartoes }.
import { fixosAtivos, gerarParcelas, tituloCompra } from './utils'

const arred = (n) => Math.round(n * 100) / 100

// Parte total (R$) de um item. `base` = valor total da compra, ou valor mensal da conta fixa.
// Nunca passa do valor do item. Percentual vai de 0 a 100.
export function parteTotal(divisao, base) {
  const v = Number(divisao?.valor) || 0
  const b = Number(base) || 0
  const bruta = divisao?.modo === 'percentual' ? (b * Math.min(Math.max(v, 0), 100)) / 100 : v
  return arred(Math.max(0, Math.min(bruta, b)))
}

// Parte esperada de cada parcela de uma compra: proporcional ao valor da parcela; a última fecha a conta.
export function parcelasDaParte(compra, divisao, cartoes) {
  const parcelas = gerarParcelas(compra, cartoes)
  const total = parteTotal(divisao, Number(compra.valor_total))
  const valorTotal = Number(compra.valor_total) || 0
  let acumulado = 0
  return parcelas.map((p, i) => {
    const esperado = i === parcelas.length - 1 ? arred(total - acumulado) : arred(valorTotal > 0 ? (p.valor * total) / valorTotal : 0)
    acumulado = arred(acumulado + esperado)
    return { mes: p.mes, num: p.num, total: p.total, esperado, valorParcela: p.valor }
  })
}

const compraDe = (d, divisao) => (d.compras || []).find((c) => c.id === divisao.ref_id)
const fixoDe = (d, divisao) => (d.fixos || []).find((f) => f.id === divisao.ref_id)

export const descricaoDoItem = (d, divisao) => {
  if (divisao.tipo === 'fixo') return fixoDe(d, divisao)?.nome || 'Conta fixa removida'
  const c = compraDe(d, divisao)
  return c ? tituloCompra(c) : 'Compra removida'
}

// Quanto da divisão é esperado em um mês (0 se o item não cai nesse mês).
export function esperadoDoMes(d, divisao, mes) {
  if (divisao.tipo === 'fixo') {
    const f = fixoDe(d, divisao)
    if (!f || !fixosAtivos([f], mes).length) return 0
    return parteTotal(divisao, Number(f.valor))
  }
  const c = compraDe(d, divisao)
  if (!c) return 0
  return parcelasDaParte(c, divisao, d.cartoes || []).find((p) => p.mes === mes)?.esperado || 0
}

const repasseDe = (d, divisaoId, mes) => (d.divisoesRepasses || []).find((r) => r.divisao_id === divisaoId && r.mes === mes)

// Linhas do mês: o que cada pessoa deve e se já foi recebido.
export function repassesDoMes(d, mes) {
  return (d.divisoes || [])
    .map((div) => {
      const esperado = esperadoDoMes(d, div, mes)
      const reg = repasseDe(d, div.id, mes)
      if (!esperado && !reg) return null
      return {
        divisao: div, mes, pessoa: div.pessoa, tipo: div.tipo, descricao: descricaoDoItem(d, div),
        esperado, recebido: !!reg, valorRecebido: reg ? Number(reg.valor_recebido) : 0, recebidoEm: reg?.recebido_em || null,
      }
    })
    .filter(Boolean)
    .sort((a, b) => a.pessoa.localeCompare(b.pessoa) || a.descricao.localeCompare(b.descricao))
}

export function resumoRepasses(d, mes) {
  const itens = repassesDoMes(d, mes)
  const soma = (f) => arred(itens.reduce((s, i) => s + f(i), 0))
  return {
    itens,
    esperado: soma((i) => i.esperado),
    recebido: soma((i) => i.valorRecebido),
    aReceber: soma((i) => (i.recebido ? 0 : i.esperado)),
  }
}

// Tudo que ainda falta receber, por pessoa, em todos os meses (competência já começada ou não).
export function saldoPorPessoa(d, meses) {
  const mapa = {}
  for (const mes of meses) {
    for (const i of repassesDoMes(d, mes)) {
      if (i.recebido) continue
      mapa[i.pessoa] = arred((mapa[i.pessoa] || 0) + i.esperado)
    }
  }
  return mapa
}

// ---------- Valores líquidos (só a parte de quem usa o app) para categorias e teto ----------

// Compras com o valor reduzido pela parte dos outros. Sem divisões devolve a MESMA lista.
export function comprasLiquidas(d) {
  const divs = (d.divisoes || []).filter((x) => x.tipo === 'compra')
  if (!divs.length) return d.compras
  const partes = new Map()
  for (const div of divs) {
    const c = compraDe(d, div)
    if (!c) continue
    const ja = partes.get(c.id) || 0
    partes.set(c.id, arred(ja + Math.min(parteTotal(div, Number(c.valor_total)), Number(c.valor_total) - ja)))
  }
  return d.compras.map((c) => (partes.has(c.id) ? { ...c, valor_total: arred(Number(c.valor_total) - partes.get(c.id)) } : c))
}

// Contas fixas com o valor mensal reduzido pela parte dos outros. Sem divisões devolve a MESMA lista.
export function fixosLiquidos(d) {
  const divs = (d.divisoes || []).filter((x) => x.tipo === 'fixo')
  if (!divs.length) return d.fixos
  const partes = new Map()
  for (const div of divs) {
    const f = fixoDe(d, div)
    if (!f) continue
    const ja = partes.get(f.id) || 0
    partes.set(f.id, arred(ja + Math.min(parteTotal(div, Number(f.valor)), Number(f.valor) - ja)))
  }
  return d.fixos.map((f) => (partes.has(f.id) ? { ...f, valor: arred(Number(f.valor) - partes.get(f.id)) } : f))
}

// Parte dos outros esperada no mês (para fechar a conta das categorias no fechamento).
export const parteDosOutrosNoMes = (d, mes) => arred((d.divisoes || []).reduce((s, div) => s + esperadoDoMes(d, div, mes), 0))
