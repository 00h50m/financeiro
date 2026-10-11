import { describe, it, expect } from 'vitest'
import { inicioDoApp, antesDoInicio, noMinimoDoInicio, INICIO_PADRAO } from '../inicioApp'

describe('início do uso do app', () => {
  it('sem registro vale o padrão (out/2026)', () => {
    expect(INICIO_PADRAO).toBe('2026-10')
    expect(inicioDoApp({})).toBe('2026-10')
    expect(inicioDoApp(undefined)).toBe('2026-10')
  })
  it('registro válido vale; vazio significa sem data de início', () => {
    expect(inicioDoApp({ inicio_app: '2026-08' })).toBe('2026-08')
    expect(inicioDoApp({ inicio_app: '' })).toBeNull()
    expect(inicioDoApp({ inicio_app: null })).toBeNull()
  })
  it('valor inválido cai no padrão', () => {
    expect(inicioDoApp({ inicio_app: '2026-13' })).toBe('2026-10')
    expect(inicioDoApp({ inicio_app: 'outubro' })).toBe('2026-10')
    expect(inicioDoApp({ inicio_app: 202610 })).toBe('2026-10')
  })
  it('antes do início e piso do mês', () => {
    expect(antesDoInicio('2026-09', '2026-10')).toBe(true)
    expect(antesDoInicio('2026-10', '2026-10')).toBe(false)
    expect(antesDoInicio('2020-01', null)).toBe(false)
    expect(noMinimoDoInicio('2026-09', '2026-10')).toBe('2026-10')
    expect(noMinimoDoInicio('2026-11', '2026-10')).toBe('2026-11')
    expect(noMinimoDoInicio('2026-09', null)).toBe('2026-09')
  })
})
