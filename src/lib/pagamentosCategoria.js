// Pagamentos do mês por categoria: quanto é, quanto já foi pago e quanto falta. Soma igual ao "comprometido" do mês.
// Fatura de cartão é repartida pelas categorias das compras (e contas fixas) lançadas nela; se o valor real da fatura difere do lançado,
// a diferença é distribuída proporcionalmente (ou vira "Fatura sem lançamentos" quando nada foi lançado).
import { gerarParcelas } from './utils.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const SEM = 'Sem categoria'
const SEM_LANCAMENTO = 'Fatura sem lançamentos'

// `det`: resultado de detalhePagamentos(store, mes). `store`: compras, cartoes, fixos. -> { categorias: [...], total, pago, pendente }
export function pagamentosPorCategoria(det, { compras = [], cartoes = [], fixos = [] }, mes) {
  const mapa = new Map()
  const somar = (categoria, valor, pago) => {
    const k = categoria || SEM
    const e = mapa.get(k) || { categoria: k, total: 0, pago: 0, itens: 0 }
    e.total += valor; e.itens += 1
    if (pago) e.pago += valor
    mapa.set(k, e)
  }
  for (const f of det.fixosLista) somar(f.categoria, Number(f.valor), !!det.fixoPagamento(f)?.pago)
  for (const c of det.outrasContas) somar(c.categoria, Number(c.valorParcela), !!c.pago)

  const categoriaDoFixo = new Map(fixos.map((f) => [f.id, f.categoria]))
  for (const l of det.linhasCartao) {
    const partes = new Map()
    for (const c of compras) {
      if (c.cartao_id !== l.cartao_id) continue
      const p = gerarParcelas(c, cartoes).find((x) => x.mes === mes)
      if (p) partes.set(c.categoria || SEM, (partes.get(c.categoria || SEM) || 0) + p.valor)
    }
    for (const fx of l.fixosNoCartao || []) partes.set(categoriaDoFixo.get(fx.id) || SEM, (partes.get(categoriaDoFixo.get(fx.id) || SEM) || 0) + Number(fx.valor))
    const lancado = [...partes.values()].reduce((t, v) => t + v, 0)
    const valor = Number(l.valor)
    if (lancado > 0.005) {
      const fator = valor / lancado // 1 quando a fatura bate com o lançado
      for (const [cat, v] of partes) somar(cat, v * fator, !!l.pago)
    } else if (valor > 0.005) somar(SEM_LANCAMENTO, valor, !!l.pago)
  }

  const categorias = [...mapa.values()].map((e) => {
    const total = r2(e.total), pago = r2(e.pago)
    return { ...e, total, pago, pendente: r2(total - pago), pct: total > 0 ? pago / total : 1 }
  }).sort((a, b) => b.total - a.total || a.categoria.localeCompare(b.categoria))
  const total = r2(categorias.reduce((t, e) => t + e.total, 0))
  const pago = r2(categorias.reduce((t, e) => t + e.pago, 0))
  return { categorias, total, pago, pendente: r2(total - pago) }
}
