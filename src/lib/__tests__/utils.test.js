import { describe, it, expect } from 'vitest'
import { fmt, gastosPorCategoria } from '../utils'
import { cartoes, compra } from './fixtures'

describe('fmt', () => {
  it('formata em reais', () => {
    expect(fmt(1234.5)).toBe('R$ 1.234,50')
  })
  it('sobra de arredondamento não vira "R$ -0,00"', () => {
    expect(fmt(-1e-14)).toBe('R$ 0,00')
    expect(fmt(-0.004)).toBe('R$ 0,00')
  })
  it('valor negativo de verdade continua negativo', () => {
    expect(fmt(-12.3)).toContain('-')
  })
})

describe('gastos por categoria', () => {
  it('compra sem categoria vai para "Sem categoria", nunca "undefined"', () => {
    const c = compra({ categoria: undefined, data_compra: '2026-10-04', valor_total: 50, parcelas: 1, cartao_id: null })
    const r = gastosPorCategoria([c], cartoes, [], '2026-10')
    expect(r['Sem categoria'].total).toBe(50)
    expect(r.undefined).toBeUndefined()
  })
})

describe('fixosAtivos com histórico', () => {
  it('respeita mes_inicio e mes_fim', async () => {
    const { fixosAtivos } = await import('../utils')
    const fixos = [
      { id: 1, ativo: true, mes_fim: '2026-09' },
      { id: 2, ativo: true, mes_inicio: '2026-10' },
    ]
    expect(fixosAtivos(fixos, '2026-09').map((f) => f.id)).toEqual([1])
    expect(fixosAtivos(fixos, '2026-10').map((f) => f.id)).toEqual([2])
  })
})
