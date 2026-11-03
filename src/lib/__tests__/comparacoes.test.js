import { describe, it, expect } from 'vitest'
import { compararComMedia } from '../comparacoes'

const m = (valor, temDados = true) => ({ valor, temDados })
describe('comparação com a média (sem tendência inventada)', () => {
  it('com menos de 3 meses de dados diz "histórico insuficiente" (não calcula percentual)', () => {
    expect(compararComMedia(1920, [m(0, false), m(0, false), m(0, false), m(0, false), m(384)]).tipo).toBe('insuficiente')
    expect(compararComMedia(1920, [m(300), m(320)]).tipo).toBe('insuficiente')
  })
  it('meses sem dados (antes do início do app) não diluem a média', () => {
    const r = compararComMedia(400, [m(0, false), m(0, false), m(300), m(300), m(300)])
    expect(r.media).toBe(300) // 3 meses com dados, não 5
    expect(r.tipo).toBe('acima'); expect(r.pct).toBe(33)
  })
  it('acima, abaixo e na média (tolerância de 5%)', () => {
    const base = [m(100), m(100), m(100)]
    expect(compararComMedia(150, base)).toMatchObject({ tipo: 'acima', pct: 50 })
    expect(compararComMedia(50, base)).toMatchObject({ tipo: 'abaixo', pct: -50 })
    expect(compararComMedia(103, base).tipo).toBe('na_media')
  })
  it('categoria que quase não gastava antes não vira percentual gigante', () => {
    expect(compararComMedia(500, [m(0), m(0), m(0)]).tipo).toBe('sem_gasto_antes')
  })
  it('o mínimo pode ser ajustado', () => {
    expect(compararComMedia(150, [m(100), m(100)], { minimo: 2 }).tipo).toBe('acima')
  })
})
