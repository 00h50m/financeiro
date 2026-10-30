import { describe, it, expect } from 'vitest'
import { pagamentosPorCategoria } from '../pagamentosCategoria'
import { detalhePagamentos } from '../financeiro'

const mes = '2026-10'
const store = {
  cartoes: [{ id: 'cn', nome: 'Nubank', dia_fechamento: 31, dia_vencimento: 10 }],
  fixos: [
    { id: 'f1', nome: 'Aluguel', valor: 2000, categoria: 'Moradia', ativo: true, dia_vencimento: 5, mes_inicio: '2026-01' },
    { id: 'f2', nome: 'Luz', valor: 300, categoria: 'Moradia', ativo: true, dia_vencimento: 10, mes_inicio: '2026-01' },
    { id: 'f3', nome: 'Internet', valor: 120, categoria: 'Comunicação', ativo: true, dia_vencimento: 15, mes_inicio: '2026-01', cartao_id: 'cn' },
  ],
  fixosPagamentos: [{ fixo_id: 'f1', mes, pago: true }],
  compras: [
    { id: 'c1', data_compra: '2026-10-03', descricao: 'Mercado', categoria: 'Alimentação', valor_total: 600, parcelas: 1, cartao_id: 'cn' },
    { id: 'c2', data_compra: '2026-10-04', descricao: 'Tênis', categoria: 'Vestuário', valor_total: 300, parcelas: 3, cartao_id: 'cn' },
    { id: 'c3', data_compra: '2026-10-06', descricao: 'Boleto escola', categoria: 'Educação', valor_total: 500, parcelas: 1, cartao_id: null, pago: false },
    { id: 'c4', data_compra: '2026-10-07', descricao: 'Sem categoria', categoria: null, valor_total: 50, parcelas: 1, cartao_id: null, pago: true },
  ],
  faturas: [], comprasPagamentos: [], comprasPagamentosOk: false, adiamentos: [], dividas: [],
}

describe('pagamentos por categoria', () => {
  it('soma igual ao comprometido e ao pago do mês', () => {
    const det = detalhePagamentos(store, mes)
    const r = pagamentosPorCategoria(det, store, mes)
    expect(r.total).toBeCloseTo(det.comprometido, 2)
    expect(r.pago).toBeCloseTo(det.pago, 2)
    expect(r.pendente).toBeCloseTo(det.totalDividas, 2)
  })
  it('por categoria: fixos, contas sem cartão e fatura repartida pelas compras e fixos no cartão', () => {
    const det = detalhePagamentos(store, mes)
    const por = Object.fromEntries(pagamentosPorCategoria(det, store, mes).categorias.map((c) => [c.categoria, c]))
    expect(por['Moradia']).toMatchObject({ total: 2300, pago: 2000, pendente: 300 })
    expect(por['Educação']).toMatchObject({ total: 500, pago: 0, pendente: 500 })
    expect(por['Sem categoria']).toMatchObject({ total: 50, pago: 50, pendente: 0 })
    expect(por['Alimentação'].total).toBe(600)
    expect(por['Vestuário'].total).toBe(100) // 1 de 3 parcelas
    expect(por['Comunicação'].total).toBe(120) // fixo pago no cartão entra na fatura
  })
  it('fatura paga conta tudo como pago; valor real do banco redistribui proporcionalmente', () => {
    const s2 = { ...store, faturas: [{ cartao_id: 'cn', mes, valor_real: 1640, pago: true }] }
    const det = detalhePagamentos(s2, mes)
    const r = pagamentosPorCategoria(det, s2, mes)
    const por = Object.fromEntries(r.categorias.map((c) => [c.categoria, c]))
    expect(por['Alimentação'].pago).toBe(por['Alimentação'].total)
    expect(r.total).toBeCloseTo(det.comprometido, 2)
    expect(por['Alimentação'].total).toBeCloseTo(600 * (1640 / 820), 2) // 600+100+120 lançado → 820; banco 1.640 (dobro)
  })
  it('ordenado pelo maior total; fatura sem lançamentos com valor real vira categoria própria', () => {
    const s3 = { ...store, compras: [], fixos: [], faturas: [{ cartao_id: 'cn', mes, valor_real: 900, pago: false }] }
    const r = pagamentosPorCategoria(detalhePagamentos(s3, mes), s3, mes)
    expect(r.categorias).toEqual([expect.objectContaining({ categoria: 'Fatura sem lançamentos', total: 900, pendente: 900 })])
  })
})
