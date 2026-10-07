import { describe, it, expect, vi } from 'vitest'

// Banco de mentira só para provar que o resumo e o teto do bot contam a parte líquida das compras divididas.
const tabelas = {
  compras: [
    { id: 1, data_compra: '2026-10-03', valor_total: 200, categoria: 'Saúde', cartao_id: 'c1', parcelas: 1 },
    { id: 2, data_compra: '2026-10-04', valor_total: 50, categoria: 'Saúde', cartao_id: 'c1', parcelas: 1 },
  ],
  divisoes: [{ id: 'd1', tipo: 'compra', ref_id: 1, modo: 'valor', valor: 80, pessoa: 'Mãe' }],
  fixos: [],
  orcamentos: [{ categoria: 'Saúde', valor: 500 }],
}
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (t) => {
      const q = { select: () => q, order: () => q, gte: () => q, lte: () => q, eq: () => q, not: () => q, range: () => Promise.resolve({ data: tabelas[t] || [], error: null }), then: (f) => f({ data: tabelas[t] || [], error: null }) }
      return q
    },
  }),
}))

const { criarDb } = await import('../db.js')

describe('bot: valores líquidos das compras divididas', () => {
  const db = criarDb({ url: 'http://x', serviceKey: 'k' })
  it('o resumo soma só a parte da pessoa que usa o app', async () => {
    const compras = await db.comprasPeriodo('2026-10-01', '2026-10-31')
    expect(compras.map((c) => c.valor_total)).toEqual([120, 50])
  })
  it('o aviso de teto usa o valor líquido', async () => {
    const { compras } = await db.dadosTeto('Saúde', '2022-01-01')
    expect(compras.map((c) => c.valor_total)).toEqual([120, 50])
  })
})
