// Pagamentos do mês por categoria: quanto é, quanto já foi pago e quanto falta. Soma igual ao "comprometido" do mês.
// Fatura de cartão é repartida pelas categorias das compras (e contas fixas) lançadas nela; se o valor real da fatura difere do lançado,
// a diferença é distribuída proporcionalmente (ou vira "Fatura sem lançamentos" quando nada foi lançado).
import { gerarParcelas, tituloCompra } from './utils.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const SEM = 'Sem categoria'
const SEM_LANCAMENTO = 'Fatura sem lançamentos'

// `det`: resultado de detalhePagamentos(store, mes). `store`: compras, cartoes, fixos. -> { categorias: [...], total, pago, pendente }
export function pagamentosPorCategoria(det, { compras = [], cartoes = [], fixos = [] }, mes) {
  const mapa = new Map()
  // `item`: { tipo: 'fixo' | 'conta' | 'fatura', nome, compras? } — vira a lista "de onde vem" de cada categoria.
  const somar = (categoria, valor, pago, item) => {
    const k = categoria || SEM
    const e = mapa.get(k) || { categoria: k, total: 0, pago: 0, itens: [] }
    e.total += valor
    e.itens.push({ ...item, valor: r2(valor), pago })
    if (pago) e.pago += valor
    mapa.set(k, e)
  }
  for (const f of det.fixosLista) somar(f.categoria, Number(f.valor), !!det.fixoPagamento(f)?.pago, { tipo: 'fixo', nome: f.nome })
  for (const c of det.outrasContas) somar(c.categoria, Number(c.valorParcela), !!c.pago, { tipo: 'conta', nome: `${tituloCompra(c)}${c.parcelaTotal > 1 ? ` (${c.parcelaNum}/${c.parcelaTotal})` : ''}` })

  const categoriaDoFixo = new Map(fixos.map((f) => [f.id, f.categoria]))
  for (const l of det.linhasCartao) {
    const partes = new Map() // categoria -> { valor, compras: [{ titulo, valor }] }
    const guardar = (cat, valor, titulo) => {
      const e = partes.get(cat) || { valor: 0, compras: [] }
      e.valor += valor; e.compras.push({ titulo, valor: r2(valor) })
      partes.set(cat, e)
    }
    for (const c of compras) {
      if (c.cartao_id !== l.cartao_id) continue
      const p = gerarParcelas(c, cartoes).find((x) => x.mes === mes)
      if (p) guardar(c.categoria || SEM, p.valor, tituloCompra(c))
    }
    for (const fx of l.fixosNoCartao || []) guardar(categoriaDoFixo.get(fx.id) || SEM, Number(fx.valor), `${fx.nome} (conta fixa no cartão)`)
    const lancado = [...partes.values()].reduce((t, e) => t + e.valor, 0)
    const valor = Number(l.valor)
    if (lancado > 0.005) {
      const fator = valor / lancado // 1 quando a fatura bate com o lançado
      for (const [cat, e] of partes) somar(cat, e.valor * fator, !!l.pago, { tipo: 'fatura', nome: `Fatura ${l.nome}`, compras: e.compras.sort((a, b) => b.valor - a.valor), ajustada: Math.abs(fator - 1) > 0.005 })
    } else if (valor > 0.005) somar(SEM_LANCAMENTO, valor, !!l.pago, { tipo: 'fatura', nome: `Fatura ${l.nome}`, compras: [] })
  }

  const categorias = [...mapa.values()].map((e) => {
    const total = r2(e.total), pago = r2(e.pago)
    return { ...e, total, pago, pendente: r2(total - pago), pct: total > 0 ? pago / total : 1, itens: e.itens.sort((a, b) => b.valor - a.valor) }
  }).sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria))
  const total = r2(categorias.reduce((t, e) => t + e.total, 0))
  const pago = r2(categorias.reduce((t, e) => t + e.pago, 0))
  return { categorias, total, pago, pendente: r2(total - pago) }
}
