// Comparação de um valor com a média dos meses anteriores — sem inventar tendência.
// Só compara quando há pelo menos `minimo` meses COM dados; meses antes do início do uso não entram na média
// (antes, uma categoria com 1 mês de histórico aparecia como "↑ 400%" contra uma média diluída por meses vazios).
export const MINIMO_MESES_PARA_MEDIA = 3
export function compararComMedia(valor, meses, { minimo = MINIMO_MESES_PARA_MEDIA, tolerancia = 5 } = {}) {
  const base = meses.filter((m) => m.temDados)
  if (base.length < minimo) return { tipo: 'insuficiente', meses: base.length, minimo }
  const media = base.reduce((t, m) => t + (Number(m.valor) || 0), 0) / base.length
  if (!(media >= 1)) return { tipo: 'sem_gasto_antes', media, meses: base.length }
  const pct = Math.round(((valor - media) / media) * 100)
  if (Math.abs(pct) < tolerancia) return { tipo: 'na_media', media, pct, meses: base.length }
  return { tipo: pct > 0 ? 'acima' : 'abaixo', media, pct, meses: base.length }
}
