// Acompanhamento semanal do "Meu plano": quanto já foi gasto no dia a dia (compras à vista/1x) nesta semana contra o teto de cada categoria.
import { ehVariavel } from './gastoVariavel.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()

// Semana de segunda a domingo que contém `hoje`. dia = 1..7 (segunda = 1), diasRestantes inclui hoje.
export function semanaDe(hoje) {
  const dow = new Date(`${hoje}T12:00:00Z`).getUTCDay() // 0 domingo
  const dia = dow === 0 ? 7 : dow
  const inicio = somarDias(hoje, -(dia - 1))
  return { inicio, fim: somarDias(inicio, 6), dia, diasRestantes: 8 - dia }
}

// Tetos por semana: os do plano gerado; sem plano, a média reservada do dia a dia (reservaVariavel).
export function tetosDaSemana(plano, reserva) {
  const doPlano = (plano?.tetos_semanais || []).filter((t) => t.categoria && Number(t.valor) >= 0)
  if (doPlano.length) return doPlano.map((t) => ({ categoria: t.categoria, valor: r2(t.valor), origem: 'plano' }))
  return (reserva?.categorias || []).filter((c) => c.reservado > 0).map((c) => ({ categoria: c.categoria, valor: r2(c.porSemana), origem: 'media' }))
}

export function gastoPorCategoria(compras, de, ate) {
  const m = new Map()
  for (const c of compras || []) {
    if (!ehVariavel(c)) continue
    const d = String(c.data_compra).slice(0, 10)
    if (d < de || d > ate) continue
    const k = c.categoria || 'Outros'
    m.set(k, r2((m.get(k) || 0) + (Number(c.valor_total) || 0)))
  }
  return m
}

// -> { semana, itens: [{ categoria, teto, gasto, restante, pct, status, ritmo }], semTeto: [{categoria, gasto}], total: { teto, gasto, restante, pct, status }, anteriores: [{ inicio, gasto, teto, status }] }
// status: ok (até 80%) · atencao (80–100%) · estourou (>100%). ritmo: true se, no passo de hoje, fecharia a semana acima do teto.
export function acompanhamentoSemana({ compras, tetos, hoje, semanasAnteriores = 4 }) {
  const semana = semanaDe(hoje)
  const gastos = gastoPorCategoria(compras, semana.inicio, semana.fim)
  const pedido = new Map([...gastos].map(([k, v]) => [norm(k), { nome: k, v }]))
  const status = (pct) => (pct > 1 ? 'estourou' : pct >= 0.8 ? 'atencao' : 'ok')
  const usados = new Set()
  const itens = tetos.map((t) => {
    const g = pedido.get(norm(t.categoria))
    if (g) usados.add(norm(t.categoria))
    const gasto = g ? g.v : 0
    const pct = t.valor > 0 ? gasto / t.valor : gasto > 0 ? 2 : 0
    const ritmo = t.valor > 0 && gasto <= t.valor && (gasto / semana.dia) * 7 > t.valor * 1.05
    return { categoria: t.categoria, teto: t.valor, gasto, restante: r2(t.valor - gasto), pct, status: status(pct), ritmo, origem: t.origem }
  }).sort((a, b) => b.pct - a.pct)
  const semTeto = [...pedido].filter(([k]) => !usados.has(k)).map(([, x]) => ({ categoria: x.nome, gasto: x.v })).sort((a, b) => b.gasto - a.gasto)
  const tetoTotal = r2(tetos.reduce((t, x) => t + x.valor, 0))
  const gastoTotal = r2([...gastos.values()].reduce((t, v) => t + v, 0))
  const pctTotal = tetoTotal > 0 ? gastoTotal / tetoTotal : 0
  const anteriores = Array.from({ length: semanasAnteriores }, (_, i) => {
    const inicio = somarDias(semana.inicio, -7 * (i + 1))
    const g = r2([...gastoPorCategoria(compras, inicio, somarDias(inicio, 6)).values()].reduce((t, v) => t + v, 0))
    return { inicio, gasto: g, teto: tetoTotal, status: tetoTotal > 0 ? status(g / tetoTotal) : 'ok' }
  })
  return { semana, itens, semTeto, total: { teto: tetoTotal, gasto: gastoTotal, restante: r2(tetoTotal - gastoTotal), pct: pctTotal, status: status(pctTotal) }, anteriores }
}
