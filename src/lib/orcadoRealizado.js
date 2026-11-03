// Orçado × realizado por categoria no mês: o teto definido em Orçamento contra o que foi gasto (mesmas contas da tela Orçamento).
import { comprasLiquidas, fixosLiquidos } from './divisoes.js'
import { gastosPorCategoria, statusTeto } from './utils.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export function orcadoRealizado({ compras = [], cartoes = [], fixos = [], divisoes = [], categorias = [], orcamentos = [], mes }) {
  const gastos = gastosPorCategoria(comprasLiquidas({ compras, divisoes }), cartoes, fixosLiquidos({ fixos, divisoes }), mes)
  const tetoDe = (cat) => Number(orcamentos.find((o) => o.categoria === cat)?.valor) || 0
  const nomes = [...new Set([...categorias.map((c) => c.nome), ...Object.keys(gastos)])]
  const todas = nomes.map((categoria) => {
    const gasto = r2(gastos[categoria]?.total || 0)
    const teto = r2(tetoDe(categoria))
    return { categoria, gasto, teto, restante: r2(teto - gasto), pct: teto > 0 ? Math.round((gasto / teto) * 100) : null, status: statusTeto(gasto, teto) }
  })
  const comTeto = todas.filter((l) => l.teto > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0) || b.gasto - a.gasto)
  const semTeto = todas.filter((l) => !l.teto && l.gasto > 0).sort((a, b) => b.gasto - a.gasto)
  return {
    comTeto, semTeto,
    totalTeto: r2(comTeto.reduce((t, l) => t + l.teto, 0)), gastoComTeto: r2(comTeto.reduce((t, l) => t + l.gasto, 0)), gastoSemTeto: r2(semTeto.reduce((t, l) => t + l.gasto, 0)),
    estouradas: comTeto.filter((l) => l.status === 'estourou').length,
    semNenhumTeto: comTeto.length === 0,
  }
}
