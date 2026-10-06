import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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
  it('buscarCompra do banco de verdade traz as colunas que o bot mostra (categoria, subcategoria, cartão)', () => {
    const fonte = readFileSync(new URL('../db.js', import.meta.url), 'utf8')
    const linha = fonte.split('\n').find((l) => l.includes('async buscarCompra'))
    for (const col of ['descricao', 'identificacao', 'valor_total', 'data_compra', 'categoria', 'subcategoria', 'cartao_id']) expect(linha).toContain(col)
  })
  it('carregarContexto traz categoria e subcategoria das compras (o aprendizado pelo histórico depende delas)', () => {
    const fonte = readFileSync(new URL('../db.js', import.meta.url), 'utf8')
    const linha = fonte.split('\n').find((l) => l.includes('const COLUNAS_CASAR ='))
    for (const col of ['categoria', 'subcategoria', 'cartao_id', 'descricao']) expect(linha).toContain(col)
  })
})
