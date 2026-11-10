// DIVIDIDOS: parte de uma compra ou conta fixa que é de outra pessoa (ex.: Mãe paga parte do convênio).
// Modelo (em docs/conceitos-financeiros.md):
//  - A fatura do cartão e o valor da conta continuam CHEIOS: o dinheiro que sai da conta é o valor todo.
//  - Teto e categorias contam só a parte da pessoa que usa o app (valor líquido).
//  - A parte dos outros fica "a receber" até ser marcada como recebida; só então entra como receita do mês
//    (divisoes_repasses), então a sobra nunca conta com dinheiro que ainda não chegou.
// Funções puras. `d` = { divisoes, divisoesRepasses, compras, fixos, cartoes }.
import { fixosAtivos, gerarParcelas, tituloCompra, nowYM } from './utils.js'

const arred = (n) => Math.round(n * 100) / 100

// Parte total (R$) de um item. `base` = valor total da compra, ou valor mensal da conta fixa.
// Nunca passa do valor do item. Percentual vai de 0 a 100.
export function parteTotal(divisao, base) {
  const v = Number(divisao?.valor) || 0
  const b = Number(base) || 0
  const bruta = divisao?.modo === 'percentual' ? (b * Math.min(Math.max(v, 0), 100)) / 100 : v
  return arred(Math.max(0, Math.min(bruta, b)))
}

// Parcelas (números) em que a divisão vale: de `parcela_de` até `parcela_ate` (vazio = desde a 1ª / até a última).
export function parcelasDaDivisao(divisao, totalParcelas) {
  const n = Math.max(1, Number(totalParcelas) || 1)
  const de = Math.min(n, Math.max(1, Number(divisao?.parcela_de) || 1))
  const ate = Math.min(n, Math.max(de, Number(divisao?.parcela_ate) || n))
  return { de, ate, todas: de === 1 && ate === n, qtd: ate - de + 1 }
}

// Parte esperada de cada parcela de uma compra: proporcional ao valor da parcela; a última parcela dela fecha a conta.
// Com `parcela_de/ate`, só as parcelas desse intervalo têm parte (as outras ficam em 0): o valor em reais é dividido entre elas
// e a porcentagem vale para cada uma. Sem intervalo é exatamente o comportamento de antes (todas as parcelas).
export function parcelasDaParte(compra, divisao, cartoes) {
  const parcelas = gerarParcelas(compra, cartoes)
  const { de, ate } = parcelasDaDivisao(divisao, parcelas.length)
  const dentro = parcelas.filter((p) => p.num >= de && p.num <= ate)
  const valorDentro = arred(dentro.reduce((t, p) => t + p.valor, 0))
  const total = parteTotal(divisao, valorDentro)
  let acumulado = 0
  return parcelas.map((p) => {
    if (p.num < de || p.num > ate) return { mes: p.mes, num: p.num, total: p.total, esperado: 0, valorParcela: p.valor }
    const esperado = p.num === ate ? arred(total - acumulado) : arred(valorDentro > 0 ? (p.valor * total) / valorDentro : 0)
    acumulado = arred(acumulado + esperado)
    return { mes: p.mes, num: p.num, total: p.total, esperado, valorParcela: p.valor }
  })
}

// Parte total (R$) de uma divisão de COMPRA somando as parcelas dela (respeita o intervalo de parcelas).
export const parteDaCompra = (compra, divisao, cartoes) => arred(parcelasDaParte(compra, divisao, cartoes).reduce((t, p) => t + p.esperado, 0))

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

// Qual parcela da compra cai no mês ({ num, total }), ou null (conta fixa, compra à vista ou mês fora do parcelamento).
export function parcelaDoMes(d, divisao, mes) {
  if (divisao.tipo !== 'compra') return null
  const c = compraDe(d, divisao)
  if (!c || !(Number(c.parcelas) > 1)) return null
  const p = parcelasDaParte(c, divisao, d.cartoes || []).find((x) => x.mes === mes)
  return p ? { num: p.num, total: p.total } : null
}

// Linhas do mês: o que cada pessoa deve e se já foi recebido.
export function repassesDoMes(d, mes) {
  return (d.divisoes || [])
    .map((div) => {
      const esperado = esperadoDoMes(d, div, mes)
      const reg = repasseDe(d, div.id, mes)
      if (!esperado && !reg) return null
      return {
        divisao: div, mes, pessoa: div.pessoa, tipo: div.tipo, descricao: descricaoDoItem(d, div), parcela: parcelaDoMes(d, div, mes),
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

// Tudo que ainda falta receber, por pessoa. Compra: todas as parcelas em aberto (as já cobradas e as que ainda vão cair).
// Conta fixa (todo mês, sem fim): só conta do mês em que a divisão foi criada até o mês atual. Os meses de antes de começar a dividir
// não eram devidos, e os meses que ainda não chegaram ainda não são devidos (antes, uma conta fixa somava 3 anos de meses).
export function saldoPorPessoa(d, meses, hoje = nowYM()) {
  const mapa = {}
  for (const mes of meses) {
    for (const i of repassesDoMes(d, mes)) {
      if (i.recebido) continue
      if (i.tipo === 'fixo') {
        const desde = String(i.divisao.criada_em || '').slice(0, 7)
        if (mes > hoje || (desde && mes < desde)) continue
      }
      mapa[i.pessoa] = arred((mapa[i.pessoa] || 0) + i.esperado)
    }
  }
  return mapa
}

// ---------- Valores líquidos (só a parte de quem usa o app) para categorias e teto ----------

// Compras com o valor reduzido pela parte dos outros. Sem divisões devolve a MESMA lista.
// Divisão de só algumas parcelas: além do valor total líquido, a compra leva `_valoresParcelas` (valor líquido de cada parcela),
// que gerarParcelas usa para o gasto cair no mês certo. Sem divisão parcial nada muda (mesma conta de antes).
export function comprasLiquidas(d) {
  const divs = (d.divisoes || []).filter((x) => x.tipo === 'compra')
  if (!divs.length) return d.compras
  const partes = new Map()
  const parciais = new Map() // compra.id -> true se alguma divisão vale só para algumas parcelas
  for (const div of divs) {
    const c = compraDe(d, div)
    if (!c) continue
    const ja = partes.get(c.id) || 0
    const cheia = parcelasDaDivisao(div, Number(c.parcelas) || 1).todas
    if (!cheia) parciais.set(c.id, true)
    const parte = cheia ? parteTotal(div, Number(c.valor_total)) : parteDaCompra(c, div, d.cartoes || [])
    partes.set(c.id, arred(ja + Math.min(parte, Number(c.valor_total) - ja)))
  }
  return d.compras.map((c) => {
    if (!partes.has(c.id)) return c
    const liquida = { ...c, valor_total: arred(Number(c.valor_total) - partes.get(c.id)) }
    if (!parciais.has(c.id)) return liquida
    // por parcela: valor da parcela menos as partes dos outros (sem deixar negativo)
    const base = gerarParcelas(c, d.cartoes || [])
    const abate = base.map(() => 0)
    for (const div of divs.filter((x) => x.ref_id === c.id)) parcelasDaParte(c, div, d.cartoes || []).forEach((p, i) => { abate[i] = arred(abate[i] + p.esperado) })
    const valores = base.map((p, i) => arred(Math.max(0, p.valor - Math.min(abate[i], p.valor))))
    return { ...liquida, valor_total: arred(valores.reduce((t, v) => t + v, 0)), _valoresParcelas: valores }
  })
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
