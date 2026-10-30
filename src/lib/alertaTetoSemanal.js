// Depois de lançar uma compra do dia a dia: avisa se a categoria chegou perto (80%) ou passou do teto da SEMANA do plano ("Meu plano").
// Só vale quando há plano com tetos por semana; só conta compra à vista/1x da semana atual; só avisa quando ESTA compra mudou a situação.
import { ehVariavel } from './gastoVariavel.js'
import { semanaDe } from './semanaPlano.js'
import { fmt } from './utils.js'

const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
const status = (pct) => (pct > 1 ? 'estourou' : pct >= 0.8 ? 'perto' : 'ok')

// `compras`: compras da categoria na semana, já incluindo a recém-lançada. `tetos`: tetos_semanais do plano ([{ categoria, valor }]).
// -> { texto, grave } ou null. grave = estourou.
export function avisoTetoSemanal({ compra, compras = [], tetos = [], hoje }) {
  if (!compra?.categoria || !ehVariavel(compra)) return null
  const teto = (tetos || []).find((t) => norm(t.categoria) === norm(compra.categoria))
  const valorTeto = Number(teto?.valor)
  if (!(valorTeto > 0)) return null
  const semana = semanaDe(hoje)
  const data = String(compra.data_compra).slice(0, 10)
  if (data < semana.inicio || data > semana.fim) return null // compra de outra semana
  const dela = compras.filter((c) => ehVariavel(c) && norm(c.categoria) === norm(compra.categoria) && String(c.data_compra).slice(0, 10) >= semana.inicio && String(c.data_compra).slice(0, 10) <= semana.fim)
  const depois = dela.reduce((t, c) => t + (Number(c.valor_total) || 0), 0)
  const antes = depois - (Number(compra.valor_total) || 0)
  const novo = status(depois / valorTeto)
  if (novo === 'ok' || status(antes / valorTeto) === novo) return null
  const pct = Math.round((depois / valorTeto) * 100)
  const texto = novo === 'estourou'
    ? `🔴 ${compra.categoria} nesta semana: ${fmt(depois)} de ${fmt(valorTeto)} (${pct}%) — passou do teto da semana em ${fmt(depois - valorTeto)}.`
    : `⚠️ ${compra.categoria} nesta semana: ${fmt(depois)} de ${fmt(valorTeto)} (${pct}%) — chegou perto do teto da semana.`
  return { texto, grave: novo === 'estourou' }
}
