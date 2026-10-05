import { describe, it, expect } from 'vitest'
import { normalizarData, normalizarValor } from '../csvFormato'

describe('normalizarData', () => {
  it('aceita ISO e dia/mês/ano', () => {
    expect(normalizarData('2026-10-05')).toBe('2026-10-05')
    expect(normalizarData('05/10/2026')).toBe('2026-10-05')
    expect(normalizarData('5/1/26')).toBe('2026-01-05')
  })
  it('recusa data impossível ou lixo', () => {
    expect(normalizarData('31/02/2026')).toBe('')
    expect(normalizarData('ontem')).toBe('')
    expect(normalizarData('')).toBe('')
  })
})

describe('normalizarValor', () => {
  it('entende formatos brasileiros e americanos', () => {
    expect(normalizarValor('12,50')).toBe('12.50')
    expect(normalizarValor('R$ 1.234,56')).toBe('1234.56')
    expect(normalizarValor('1,234.56')).toBe('1234.56')
    expect(normalizarValor('1.234.567')).toBe('1234567')
    expect(normalizarValor('89.9')).toBe('89.9')
    expect(normalizarValor('-45,00')).toBe('-45.00')
  })
  it('mantém o texto quando não entende', () => {
    expect(normalizarValor('abc')).toBe('abc')
    expect(normalizarValor('')).toBe('')
  })
})
