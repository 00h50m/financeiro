import { describe, it, expect } from 'vitest'
import { compilar, filtrar, numeroBR } from '../filtro'

const itens = [
  { texto: 'Ec *Shellbox Combustível Transporte', valor: 136.3, data: '2026-09-01' },
  { texto: 'Mercado Livre Roupa aniversário', valor: [33.43, 133.72], data: '2026-09-23' },
  { texto: 'Conta Vivo Comunicação', valor: 116, data: '2026-08-18' },
]
const achar = (t) => filtrar(itens, t, (x) => x).map((x) => x.texto.split(' ')[0])

describe('numeroBR', () => {
  it('entende formatos brasileiros', () => {
    expect(numeroBR('1.234,56')).toBe(1234.56)
    expect(numeroBR('89,90')).toBe(89.9)
    expect(numeroBR('89.90')).toBe(89.9)
    expect(numeroBR('1.234')).toBe(1234)
    expect(numeroBR('R$ 5')).toBe(5)
    expect(numeroBR('abc')).toBeNull()
  })
})
describe('busca em listas', () => {
  it('vazio não filtra', () => { expect(compilar('  ').vazio).toBe(true); expect(achar('')).toHaveLength(3) })
  it('texto sem acento e todas as palavras', () => {
    expect(achar('combustivel')).toEqual(['Ec'])
    expect(achar('mercado aniversario')).toEqual(['Mercado'])
    expect(achar('mercado shellbox')).toEqual([])
  })
  it('valor exato e valor inteiro', () => {
    expect(achar('136,30')).toEqual(['Ec'])
    expect(achar('116')).toEqual(['Conta'])
    expect(achar('136')).toEqual(['Ec'])
    expect(achar('133,72')).toEqual(['Mercado']) // qualquer um dos valores do item
  })
  it('comparações e faixas', () => {
    expect(achar('>120')).toEqual(['Ec', 'Mercado'])
    expect(achar('<=116')).toEqual(['Mercado', 'Conta'])
    expect(achar('100..120')).toEqual(['Conta'])
    expect(achar('120..100')).toEqual(['Conta'])
  })
  it('datas', () => {
    expect(achar('01/09')).toEqual(['Ec'])
    expect(achar('23/09/2026')).toEqual(['Mercado'])
    expect(achar('2026-08')).toEqual(['Conta'])
  })
  it('combina texto + valor', () => { expect(achar('mercado >100')).toEqual(['Mercado']) })
})
