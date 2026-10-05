import { gerarParcelas, gastosPorCategoria, statusTeto, mesLabel, fmt } from './utils.js'

// Depois de lançar uma compra: avisa se a categoria passou (ou chegou perto) do teto do mês em que a 1ª parcela cai.
// `compras` já inclui a compra recém-lançada. Só avisa quando esta compra mudou a situação (não repete aviso antigo).
export function avisoTeto({ compra, compras, cartoes, fixos = [], orcamentos = [] }) {
  const teto = Number(orcamentos.find((o) => o.categoria === compra.categoria)?.valor)
  if (!compra.categoria || !teto) return null
  const parcela = gerarParcelas(compra, cartoes)[0]
  if (!parcela || !parcela.valor) return null
  const depois = gastosPorCategoria(compras, cartoes, fixos, parcela.mes)[compra.categoria]?.total || 0
  const antes = depois - parcela.valor
  const novo = statusTeto(depois, teto)
  if (novo !== 'perto' && novo !== 'estourou') return null
  if (statusTeto(antes, teto) === novo) return null
  const pct = Math.round((depois / teto) * 100)
  const situacao = novo === 'estourou' ? `passou do teto em ${fmt(depois - teto)}` : 'chegou perto do teto'
  return `⚠️ ${compra.categoria} em ${mesLabel(parcela.mes)}: ${fmt(depois)} de ${fmt(teto)} (${pct}%) — ${situacao}.`
}
