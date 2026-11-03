import { describe, it, expect } from 'vitest'
import { orcadoRealizado } from '../orcadoRealizado'

const cartoes = [{ id: 'c1', nome: 'N', fechamento: 3, vencimento: 10 }]
const compra = (id, cat, valor) => ({ id, data_compra: '2026-10-02', descricao: id, categoria: cat, subcategoria: 'x', pessoa: 'G', cartao_id: null, valor_total: valor, parcelas: 1 })
const base = (extra = {}) => ({ cartoes, fixos: [], divisoes: [], categorias: [{ nome: 'Alimentação' }, { nome: 'Lazer' }, { nome: 'Saúde' }], mes: '2026-10', ...extra })

describe('orçado × realizado', () => {
  const r = orcadoRealizado(base({ compras: [compra('a', 'Alimentação', 800), compra('b', 'Lazer', 100), compra('c', 'Saúde', 50)], orcamentos: [{ categoria: 'Alimentação', valor: 1000 }, { categoria: 'Lazer', valor: 80 }] }))
  it('compara o teto com o gasto de cada categoria e ordena pelo mais pressionado', () => {
    expect(r.comTeto.map((l) => l.categoria)).toEqual(['Lazer', 'Alimentação']) // Lazer 125%, Alimentação 80%
    expect(r.comTeto[0]).toMatchObject({ gasto: 100, teto: 80, pct: 125, status: 'estourou' })
    expect(r.comTeto[1]).toMatchObject({ gasto: 800, teto: 1000, restante: 200, pct: 80 })
  })
  it('categorias com gasto e sem teto ficam à parte', () => {
    expect(r.semTeto).toHaveLength(1); expect(r.semTeto[0]).toMatchObject({ categoria: 'Saúde', gasto: 50 })
    expect(r.gastoSemTeto).toBe(50)
  })
  it('totais e contagem de estouradas', () => {
    expect(r.totalTeto).toBe(1080); expect(r.gastoComTeto).toBe(900); expect(r.estouradas).toBe(1)
  })
  it('sem nenhum teto definido avisa (a tela oferece criar o orçamento)', () => {
    const v = orcadoRealizado(base({ compras: [compra('a', 'Alimentação', 800)], orcamentos: [] }))
    expect(v.semNenhumTeto).toBe(true); expect(v.comTeto).toEqual([])
  })
})
