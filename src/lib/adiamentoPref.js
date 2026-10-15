// Preferência de multa e juros ao adiar (padrão comum de boleto: 2% de multa + 1% ao mês). Guardada só neste aparelho.
const CHAVE = 'adiar_multa_juros'
export function lerPrefAdiar() {
  try { const v = JSON.parse(localStorage.getItem(CHAVE) || 'null'); if (v && Number.isFinite(v.multa) && Number.isFinite(v.juros)) return v } catch { /* usa o padrão */ }
  return { multa: 2, juros: 1 }
}
export function gravarPrefAdiar(multa, juros) {
  try { localStorage.setItem(CHAVE, JSON.stringify({ multa: Number(multa) || 0, juros: Number(juros) || 0 })) } catch { /* segue sem lembrar */ }
}
export const lerPct = (t) => { const n = Number(String(t ?? '').trim().replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : 0 }
