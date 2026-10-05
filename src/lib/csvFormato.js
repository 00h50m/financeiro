// Aceita datas como 2026-10-05 ou 05/10/2026 (e 05/10/26) e devolve AAAA-MM-DD, ou '' se não for uma data real.
export function normalizarData(txt) {
  const t = String(txt ?? '').trim()
  let a, m, d
  let r = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (r) [, a, m, d] = r
  else if ((r = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
    ;[, d, m, a] = r
    if (a.length === 2) a = '20' + a
  } else return ''
  const dt = new Date(Date.UTC(+a, +m - 1, +d))
  if (dt.getUTCFullYear() !== +a || dt.getUTCMonth() !== +m - 1 || dt.getUTCDate() !== +d) return ''
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// Aceita 12.5, "12,50", "R$ 1.234,56", "1,234.56" e devolve texto com ponto decimal ("1234.56"),
// ou o texto original se não der para entender (a linha fica inválida e o usuário vê).
export function normalizarValor(txt) {
  let t = String(txt ?? '').trim().replace(/R\$|\s/g, '')
  if (t === '') return ''
  const neg = t.startsWith('-') || /^\(.*\)$/.test(t)
  t = t.replace(/[-()]/g, '')
  const ultVirg = t.lastIndexOf(','), ultPonto = t.lastIndexOf('.')
  if (ultVirg > -1 && ultPonto > -1) {
    t = ultVirg > ultPonto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')
  } else if (ultVirg > -1) {
    t = t.replace(/,/g, (m, i) => (i === ultVirg ? '.' : ''))
  } else if ((t.match(/\./g) || []).length > 1) {
    t = t.replace(/\./g, '')
  }
  if (!/^\d+(\.\d+)?$/.test(t)) return String(txt).trim()
  return (neg ? '-' : '') + t
}
