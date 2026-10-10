// O que já está assumido pela frente: parcelas que ainda vão cair, mês a mês, e quanto cada cartão ainda deve em parcelas.
import { detalhePagamentos } from './financeiro.js'
import { calendarioQuitacao, parcelamentosAtivos } from './parcelamentos.js'
import { addMonths, gerarParcelas } from './utils.js'

const r2 = (n) => Math.round(n * 100) / 100

// -> {
//   meses: [{ mes, comprometido, parcelas, fixos, terminam: [compra] }]   próximos `n` meses a partir de `mes`
//   parcelasRestantes: soma de todas as parcelas de `mes` em diante (inclui meses além dos `n`)
//   qtdCompras, ultimoMes (quando a última parcela cai), porCartao: [{ cartao_id, nome, valor, qtd }]
// }
export function compromissosFuturos(store, mes, n = 12) {
  const { compras, cartoes } = store
  const cal = calendarioQuitacao(compras, cartoes, mes, n)
  const meses = cal.map((c) => {
    const det = detalhePagamentos(store, c.mes)
    return { mes: c.mes, comprometido: r2(det.comprometido), parcelas: c.total, fixos: r2(det.totalFixos), terminam: c.terminam }
  })

  const ativas = parcelamentosAtivos(compras, cartoes, mes)
  let parcelasRestantes = 0
  let ultimoMes = null
  const porCartaoMapa = new Map()
  for (const c of ativas) {
    const restantes = gerarParcelas(c, cartoes).filter((p) => p.mes >= mes)
    const valor = restantes.reduce((t, p) => t + p.valor, 0)
    parcelasRestantes += valor
    const fim = restantes[restantes.length - 1]?.mes
    if (fim && (!ultimoMes || fim > ultimoMes)) ultimoMes = fim
    const chave = c.cartao_id || 'sem'
    const atual = porCartaoMapa.get(chave) || { cartao_id: chave, nome: cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão', valor: 0, qtd: 0 }
    atual.valor += valor
    atual.qtd += 1
    porCartaoMapa.set(chave, atual)
  }
  return {
    meses,
    parcelasRestantes: r2(parcelasRestantes),
    qtdCompras: ativas.length,
    ultimoMes,
    porCartao: [...porCartaoMapa.values()].map((x) => ({ ...x, valor: r2(x.valor) })).sort((a, b) => b.valor - a.valor),
  }
}

export const mesesAte = (de, ate) => {
  let n = 0
  for (let m = de; m < ate; m = addMonths(m, 1)) n += 1
  return n
}
