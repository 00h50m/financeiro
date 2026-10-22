import { describe, it, expect } from 'vitest'
import { totalReserva, totalPorLiquidez, mesesCobertos, aplicarFonte } from '../reserva'
import { lerNum } from '../adiamentoPref'
import { reaisParaCentavos } from '../aulas'

const fontes = [{ id: 'a', nome: 'Poupança', valor: 2540, liquidez: 'na_hora' }, { id: 'b', nome: 'CDB', valor: 1000.5, liquidez: 'poucos_dias' }, { id: 'c', nome: 'FGTS', valor: 3000, liquidez: 'travado' }]
describe('reserva de emergência', () => {
  it('total e por liquidez', () => {
    expect(totalReserva(fontes)).toBe(6540.5)
    expect(totalPorLiquidez(fontes)).toEqual({ na_hora: 2540, poucos_dias: 1000.5, travado: 3000 })
    expect(mesesCobertos(6540.5, 2000)).toBeCloseTo(3.27, 2)
    expect(mesesCobertos(100, 0)).toBe(0)
  })
  it('aplicar fonte: editar e adicionar', () => {
    expect(totalReserva(aplicarFonte(fontes, { id: 'a', valor: 100 }))).toBe(4100.5)
    expect(totalReserva(aplicarFonte(fontes, { nome: 'Dinheiro', valor: 50 }))).toBe(6590.5)
  })
  it('"2.540" é dois mil e quinhentos (não 2,54)', () => {
    expect(reaisParaCentavos('2.540')).toBe(254000)
    expect(lerNum('2.540')).toBe(2540)
    expect(lerNum('10.000')).toBe(10000)
    expect(lerNum('2.54')).toBe(2.54)
    expect(lerNum('2.540,50')).toBe(2540.5)
    expect(lerNum('1500')).toBe(1500)
  })
})
