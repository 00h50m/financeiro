// Preferência de multa e juros ao adiar (padrão comum de boleto: 2% de multa + 1% ao mês). Guardada só neste aparelho.
// multa: { tipo: 'pct' | 'valor', texto }  ·  juros: { tipo: 'pct_mes' | 'valor_mes' | 'valor_dia', texto }
const CHAVE = 'adiar_multa_juros_v2'
const PADRAO = { multa: { tipo: 'pct', texto: '2' }, juros: { tipo: 'pct_mes', texto: '1' } }
const TIPOS_MULTA = ['pct', 'valor']
const TIPOS_JUROS = ['pct_mes', 'valor_mes', 'valor_dia']

export function lerPrefAdiar() {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) || 'null')
    if (v && TIPOS_MULTA.includes(v.multa?.tipo) && TIPOS_JUROS.includes(v.juros?.tipo)) return { multa: { tipo: v.multa.tipo, texto: String(v.multa.texto ?? '') }, juros: { tipo: v.juros.tipo, texto: String(v.juros.texto ?? '') } }
  } catch { /* usa o padrão */ }
  return PADRAO
}
export function gravarPrefAdiar(multa, juros) {
  try { localStorage.setItem(CHAVE, JSON.stringify({ multa, juros })) } catch { /* segue sem lembrar */ }
}
// "2", "2,5", "1.234,56" -> número (>= 0; inválido = 0)
export const lerNum = (t) => {
  const s = String(t ?? '').trim()
  if (!s) return 0
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) && n >= 0 ? n : 0
}
export const paraAcrescimo = (campo) => ({ tipo: campo.tipo, valor: lerNum(campo.texto) })
