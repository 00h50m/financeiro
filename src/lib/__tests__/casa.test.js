import { describe, it, expect } from 'vitest'
import { nomeCasa, donoDoFixo } from '../utils'

const pessoas = [{ nome: 'Giovanna' }, { nome: 'Sabrina' }, { nome: 'Casa' }]

describe('conta fixa sem pessoa é da Casa', () => {
  it('sem pessoa -> Casa; com pessoa -> a pessoa', () => {
    expect(donoDoFixo({ pessoa: null }, pessoas)).toBe('Casa')
    expect(donoDoFixo({ pessoa: '' }, pessoas)).toBe('Casa')
    expect(donoDoFixo({ pessoa: 'Sabrina' }, pessoas)).toBe('Sabrina')
  })
  it('usa o nome da pessoa "Casa" cadastrada, mesmo com outra grafia', () => {
    expect(nomeCasa([{ nome: 'Giovanna' }, { nome: ' CASA ' }])).toBe(' CASA ')
  })
  it('sem "Casa" cadastrada, usa "Casa" mesmo assim', () => {
    expect(nomeCasa([{ nome: 'Giovanna' }])).toBe('Casa')
    expect(nomeCasa()).toBe('Casa')
  })
})
