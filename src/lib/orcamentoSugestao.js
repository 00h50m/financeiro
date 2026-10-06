// Sugestão de tetos do Orçamento a partir do histórico de gastos por categoria (meses anteriores ao escolhido).
import { addMonths } from './utils.js'
import { serieMensal } from './evolucao.js'

const r2 = (n) => Math.round(n * 100) / 100
export const arredondar10 = (v) => Math.ceil(v / 10 - 1e-9) * 10

// { categoria: [gasto do mês-n, ..., gasto do mês-1] } (mais antigo → mais novo), usando os mesmos números do Dashboard e da Evolução.
export function historicoPorCategoria(d, mes, n = 6) {
  const serie = serieMensal(d, addMonths(mes, -1), n)
  const cats = new Set(serie.flatMap((l) => Object.keys(l.porCategoria || {})))
  return Object.fromEntries([...cats].map((c) => [c, serie.map((l) => r2(l.porCategoria?.[c] || 0))]))
}

const media = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : 0)

// hist: saída de historicoPorCategoria; tetos: { categoria: valor }. margem: folga sobre a média (0.1 = +10%).
// -> [{ categoria, atual, media3, media6, maximo, mesesComGasto, irregular, sugerido, nota }] (maior média primeiro)
export function sugerirTetos(hist, tetos = {}, { margem = 0.1 } = {}) {
  return Object.entries(hist).map(([categoria, v]) => {
    const ult3 = v.slice(-3)
    const media3 = r2(media(ult3))
    const media6 = r2(media(v))
    const maximo = Math.max(0, ...v)
    const mesesComGasto = ult3.filter((x) => x > 0).length
    const irregular = mesesComGasto < 2 || (media3 > 0 && Math.max(...ult3) > media3 * 2)
    const sugerido = media3 > 0 ? arredondar10(media3 * (1 + margem)) : 0
    const atual = Number(tetos[categoria]) || 0
    let nota = ''
    if (!atual && sugerido > 0) nota = irregular ? 'gasto irregular — confira antes de aplicar' : 'sem teto ainda'
    else if (atual && sugerido > 0) nota = sugerido > atual * 1.15 ? 'gastando acima do teto atual' : sugerido < atual * 0.85 ? 'teto atual folgado demais' : 'teto atual condiz com o histórico'
    return { categoria, atual, media3, media6, maximo: r2(maximo), mesesComGasto, irregular, sugerido, nota }
  }).filter((s) => s.media3 > 0 || s.atual > 0).sort((a, b) => b.media3 - a.media3)
}
