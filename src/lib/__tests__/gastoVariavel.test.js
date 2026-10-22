import { describe, it, expect } from 'vitest'
import { ehVariavel, reservaVariavel, sobraReal } from '../gastoVariavel'

const c = (data_compra, categoria, valor_total, extra = {}) => ({ data_compra, categoria, valor_total, parcelas: 1, ...extra })
const compras = [
  c('2026-07-10', 'Combustível', 300), c('2026-08-10', 'Combustível', 360), c('2026-09-10', 'Combustível', 240),
  c('2026-08-05', 'Mercado', 600), c('2026-09-05', 'Mercado', 900),
  c('2026-09-20', 'Eletrônicos', 3000, { parcelas: 10 }),
  c('2026-09-01', 'Financeiro', 5000, { origem: 'emprestimo' }),
  c('2026-10-03', 'Combustível', 100),
]

describe('gasto variável', () => {
  it('só conta compra à vista/1x e fora empréstimo/recorrente', () => {
    expect(ehVariavel(compras[0])).toBe(true)
    expect(ehVariavel(compras[5])).toBe(false)
    expect(ehVariavel(compras[6])).toBe(false)
    expect(ehVariavel(c('2026-09-01', 'X', 10, { origem: 'recorrente' }))).toBe(false)
  })
  it('média dos 3 meses anteriores, ajuste manual e o que já foi gasto no mês', () => {
    const r = reservaVariavel(compras, '2026-10')
    const comb = r.categorias.find((x) => x.categoria === 'Combustível')
    expect(comb.media).toBe(300)
    expect(comb.noMes).toBe(100)
    expect(r.categorias.find((x) => x.categoria === 'Mercado').media).toBe(500)
    expect(r.categorias.map((x) => x.categoria)).toEqual(['Mercado', 'Combustível'])
    expect(r.total).toBe(800)
    expect(r.jaNoMes).toBe(100)
    const aj = reservaVariavel(compras, '2026-10', { ajustes: { Mercado: 400, Combustível: 0 } })
    expect(aj.total).toBe(400)
    expect(aj.categorias[0].porSemana).toBeCloseTo(400 / (52 / 12), 1)
  })
  it('sobra real desconta a reserva (no mês atual, só o que falta gastar)', () => {
    const r = reservaVariavel(compras, '2026-10')
    const s = sobraReal([{ mes: '2026-10', sobra: 1000 }, { mes: '2026-11', sobra: 1000 }, { mes: '2026-12', sobra: 500 }], r, '2026-10')
    expect(s.map((x) => x.sobraReal)).toEqual([1000 - 700, 1000 - 800, 500 - 800])
  })
})
