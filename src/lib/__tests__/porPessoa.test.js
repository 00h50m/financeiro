import { describe, it, expect } from 'vitest'
import { visaoPorPessoa } from '../porPessoa'

const cartoes = [{ id: 'c1', nome: 'Nubank', fechamento: 25, vencimento: 5 }]
const compra = (o) => ({ id: 'k' + Math.random(), data_compra: '2026-10-03', valor_total: 100, parcelas: 1, cartao_id: 'c1', categoria: 'Alimentação', descricao: 'Mercado', pessoa: 'Gi', ...o })
const base = (extra = {}) => ({
  pessoas: [{ id: 'p1', nome: 'Gi' }, { id: 'p2', nome: 'Sabi' }], cartoes, compras: [], fixos: [], divisoes: [], ...extra,
})
const totalDe = (v, nome) => v.find((x) => x.pessoa === nome)?.total

describe('visão por pessoa', () => {
  it('soma compras do mês e contas fixas de cada pessoa, e o que não tem dono vai para a Casa', () => {
    const d = base({
      compras: [compra({ valor_total: 120 }), compra({ pessoa: 'Sabi', valor_total: 80, categoria: 'Transporte' })],
      fixos: [{ id: 'f1', nome: 'Aluguel', valor: 900, ativo: true, mes_inicio: '2026-01', pessoa: null, categoria: 'Casa' }],
    })
    const v = visaoPorPessoa(d, '2026-10')
    expect(totalDe(v, 'Gi')).toBe(120)
    expect(totalDe(v, 'Sabi')).toBe(80)
    expect(totalDe(v, 'Casa')).toBe(900)
    expect(v[0].pessoa).toBe('Casa')
  })
  it('conta só a parte da pessoa quando a compra é dividida', () => {
    const c = compra({ id: 'k1', valor_total: 200 })
    const d = base({ compras: [c], divisoes: [{ id: 'd1', tipo: 'compra', ref_id: 'k1', modo: 'valor', valor: 80, pessoa: 'Mãe' }] })
    expect(totalDe(visaoPorPessoa(d, '2026-10'), 'Gi')).toBe(120)
  })
  it('pessoa sem gastos aparece zerada e ordena categorias e itens do maior para o menor', () => {
    const d = base({ compras: [compra({ valor_total: 30, categoria: 'A' }), compra({ valor_total: 90, categoria: 'B' })] })
    const v = visaoPorPessoa(d, '2026-10')
    expect(totalDe(v, 'Sabi')).toBe(0)
    const gi = v.find((x) => x.pessoa === 'Gi')
    expect(gi.porCategoria.map((c) => c.categoria)).toEqual(['B', 'A'])
    expect(gi.maiores[0].valor).toBe(90)
  })
})
