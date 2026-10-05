import { describe, it, expect } from 'vitest'
import { criarDb } from '../db.js'
import { criarFakeDb } from './fakes.js'

// Os testes do bot rodam com um banco de mentira; se o banco de verdade não tiver um método que o bot chama,
// só dá erro em produção. Este teste garante que todo método do banco de mentira existe no de verdade.
describe('contrato do banco', () => {
  it('o banco de verdade tem todos os métodos que o banco de teste tem', () => {
    const real = criarDb({ url: 'http://localhost:54321', serviceKey: 'chave-de-teste' })
    const falso = criarFakeDb()
    const faltando = Object.keys(falso).filter((k) => typeof falso[k] === 'function' && typeof real[k] !== 'function')
    expect(faltando).toEqual([])
  })
})
