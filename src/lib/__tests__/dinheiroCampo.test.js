import { describe, it, expect } from 'vitest'
import { limparDinheiro, paraCampoDinheiro } from '../dinheiroCampo'
import { lerValorReal } from '../faturaEdicao'

describe('campo de dinheiro', () => {
  it('digitar 777,24 mantém o texto', () => {
    expect(limparDinheiro('7')).toBe('7')
    expect(limparDinheiro('777,')).toBe('777,')
    expect(limparDinheiro('777,24')).toBe('777,24')
  })
  it('descarta letras e símbolos e limita a 2 casas', () => {
    expect(limparDinheiro('R$ 12a3,4567')).toBe('123,45')
    expect(limparDinheiro('--')).toBe('')
  })
  it('ponto com 1–2 casas vira vírgula decimal; milhar com ponto é preservado como número inteiro', () => {
    expect(limparDinheiro('777.24')).toBe('777,24')
    expect(limparDinheiro('1.234')).toBe('1234')
    expect(limparDinheiro('1.234,5')).toBe('1234,5')
  })
  it('formata o número para o campo', () => {
    expect(paraCampoDinheiro(777.24)).toBe('777,24')
    expect(paraCampoDinheiro('505')).toBe('505,00')
    expect(paraCampoDinheiro(null)).toBe('')
    expect(paraCampoDinheiro('')).toBe('')
  })
})

describe('lerValorReal com formatos brasileiros', () => {
  it('aceita 777,24 · 777.24 · 1.234,56 · 1.234 · 1234,5', () => {
    expect(lerValorReal('777,24').valor).toBe(777.24)
    expect(lerValorReal('777.24').valor).toBe(777.24)
    expect(lerValorReal('1.234,56').valor).toBe(1234.56)
    expect(lerValorReal('1.234').valor).toBe(1234)
    expect(lerValorReal('1234,5').valor).toBe(1234.5)
  })
  it('vazio e inválido', () => {
    expect(lerValorReal('').vazio).toBe(true)
    expect(Number.isNaN(lerValorReal('abc').valor)).toBe(true)
  })
})
