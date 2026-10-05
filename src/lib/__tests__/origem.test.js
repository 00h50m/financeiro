import { describe, it, expect } from 'vitest'
import { rotuloOrigem } from '../origem'

describe('rótulo da origem', () => {
  it('compra digitada no app não ganha selo', () => {
    expect(rotuloOrigem('manual')).toBeNull()
    expect(rotuloOrigem(null)).toBeNull()
    expect(rotuloOrigem(undefined)).toBeNull()
  })
  it('origens conhecidas ganham nome amigável', () => {
    expect(rotuloOrigem('telegram')).toContain('Telegram')
    expect(rotuloOrigem('csv')).toContain('Fatura')
  })
  it('origem desconhecida aparece como está, sem sublinhado', () => {
    expect(rotuloOrigem('open_finance')).toBe('open finance')
  })
})
