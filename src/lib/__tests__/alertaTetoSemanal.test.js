import { describe, it, expect } from 'vitest'
import { avisoTetoSemanal } from '../alertaTetoSemanal'

const c = (data_compra, categoria, valor_total, extra = {}) => ({ data_compra, categoria, valor_total, parcelas: 1, ...extra })
const tetos = [{ categoria: 'Mercado', valor: 150 }]
const hoje = '2026-10-22' // quinta; semana 19/10 a 25/10
describe('aviso de teto semanal', () => {
  it('chegou perto (80%): só quando esta compra cruzou', () => {
    const nova = c('2026-10-22', 'Mercado', 50)
    const r = avisoTetoSemanal({ compra: nova, compras: [c('2026-10-20', 'Mercado', 75), nova], tetos, hoje })
    expect(r).toMatchObject({ grave: false })
    expect(r.texto).toContain('R$ 125,00 de R$ 150,00 (83%)')
    expect(r.texto).toContain('chegou perto do teto da semana')
    // já estava perto antes: não repete
    expect(avisoTetoSemanal({ compra: c('2026-10-22', 'Mercado', 5), compras: [c('2026-10-20', 'Mercado', 130), c('2026-10-22', 'Mercado', 5)], tetos, hoje })).toBeNull()
  })
  it('estourou: grave, com quanto passou', () => {
    const nova = c('2026-10-22', 'Mercado', 60)
    const r = avisoTetoSemanal({ compra: nova, compras: [c('2026-10-19', 'Mercado', 110), nova], tetos, hoje })
    expect(r.grave).toBe(true)
    expect(r.texto).toContain('passou do teto da semana em R$ 20,00')
  })
  it('sem aviso: abaixo de 80%, sem teto, parcelada, outra semana, outra categoria', () => {
    const base = { tetos, hoje }
    const a = c('2026-10-22', 'Mercado', 20)
    expect(avisoTetoSemanal({ ...base, compra: a, compras: [a] })).toBeNull()
    const b = c('2026-10-22', 'Lazer', 500)
    expect(avisoTetoSemanal({ ...base, compra: b, compras: [b] })).toBeNull()
    const p = c('2026-10-22', 'Mercado', 500, { parcelas: 5 })
    expect(avisoTetoSemanal({ ...base, compra: p, compras: [p] })).toBeNull()
    const antiga = c('2026-10-14', 'Mercado', 500)
    expect(avisoTetoSemanal({ ...base, compra: antiga, compras: [antiga] })).toBeNull()
    expect(avisoTetoSemanal({ compra: a, compras: [a], tetos: [], hoje })).toBeNull()
  })
  it('categoria com acento/maiúscula diferente ainda casa', () => {
    const nova = c('2026-10-22', 'Combustível', 120)
    expect(avisoTetoSemanal({ compra: nova, compras: [nova], tetos: [{ categoria: 'combustivel', valor: 100 }], hoje }).grave).toBe(true)
  })
})
