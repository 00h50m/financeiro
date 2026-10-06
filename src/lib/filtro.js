// BUSCA/FILTRO de listas: um campo só entende texto, valor, faixa e data. Sem acento/maiúscula; todas as palavras precisam bater.
//   mercado livre   → as duas palavras no texto        89,90 · 1.234,56 → valor exato
//   150             → valor 150 (ou 150,xx) ou texto com 150     >100 · <=50 · 100..200 → comparação/faixa de valor
//   05/09 · 05/09/2026 · 2026-09 → data
import { normBasico } from './normalizacao.js'

// "1.234,56" · "89,90" · "89.90" · "100" · "R$ 5" → número (ou null)
export function numeroBR(s) {
  const t = String(s).trim().replace(/^r\$\s*/i, '')
  if (!/^\d[\d.,]*$/.test(t)) return null
  let n
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''))
  else n = Number(t)
  return Number.isFinite(n) ? n : null
}

const iguais = (a, b) => Math.abs(a - b) < 0.005

function compilarToken(tok) {
  let m = tok.match(/^(>=|<=|>|<)\s*(.+)$/)
  if (m && numeroBR(m[2]) != null) {
    const n = numeroBR(m[2])
    const cmp = { '>': (v) => v > n, '>=': (v) => v >= n, '<': (v) => v < n, '<=': (v) => v <= n }[m[1]]
    return (it) => valoresDe(it).some(cmp)
  }
  m = tok.match(/^(.+?)\.\.(.+)$/)
  if (m && numeroBR(m[1]) != null && numeroBR(m[2]) != null) {
    const [a, b] = [numeroBR(m[1]), numeroBR(m[2])].sort((x, y) => x - y)
    return (it) => valoresDe(it).some((v) => v >= a - 0.005 && v <= b + 0.005)
  }
  m = tok.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (m) {
    const [dia, mes] = [m[1].padStart(2, '0'), m[2].padStart(2, '0')]
    const ano = m[3] ? (m[3].length === 2 ? '20' + m[3] : m[3]) : null
    return (it) => { const d = String(it.data || '').slice(0, 10); return d.length === 10 && d.slice(8) === dia && d.slice(5, 7) === mes && (!ano || d.slice(0, 4) === ano) }
  }
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(tok)) return (it) => String(it.data || '').startsWith(tok)
  const n = numeroBR(tok)
  const txt = normBasico(tok)
  if (n != null) {
    const decimal = /[.,]\d{1,2}$/.test(tok)
    return (it) => valoresDe(it).some((v) => (decimal ? iguais(Math.abs(v), n) : Math.trunc(Math.abs(v)) === n))
      || normBasico(it.texto).includes(txt)
  }
  return (it) => normBasico(it.texto).includes(txt)
}
const valoresDe = (it) => (Array.isArray(it.valor) ? it.valor : [it.valor]).filter((v) => v != null && Number.isFinite(Number(v))).map(Number)

// compilar('mercado >100') → { vazio, combina({ texto, valor, data }) }
export function compilar(termo) {
  const tokens = String(termo || '').trim().split(/\s+/).filter((t) => t && t.toLowerCase() !== 'r$')
  const regras = tokens.map(compilarToken)
  return { vazio: regras.length === 0, combina: (item) => regras.every((r) => r(item)) }
}
export const filtrar = (lista, termo, paraItem) => {
  const { vazio, combina } = compilar(termo)
  return vazio ? lista : lista.filter((x) => combina(paraItem(x)))
}
export const DICA_BUSCA = 'Busque por nome, valor (89,90), faixa (100..200, >50) ou data (05/09)'
