import { describe, it, expect } from 'vitest'
import { compromissosFuturos, mesesAte } from '../longoPrazo'

const cartoes = [{ id: 'c1', nome: 'Nubank', titular: 'Gi', fechamento: 25, vencimento: 5 }, { id: 'c2', nome: 'Inter', titular: 'Gi', fechamento: 10, vencimento: 17 }]
const compra = (o) => ({ id: 'x' + Math.random(), data_compra: '2026-10-02', descricao: 'X', valor_total: 100, parcelas: 1, cartao_id: 'c1', pessoa: 'Gi', pago: false, ...o })
const base = (extra = {}) => ({ fixos: [], fixosPagamentos: [], cartoes, compras: [], faturas: [], rendas: [], saldoAjustes: [], comprasPagamentos: [], comprasPagamentosOk: true, ...extra })

describe('compromissosFuturos', () => {
  const store = base({
    compras: [
      compra({ descricao: 'TV', valor_total: 1200, parcelas: 12, data_compra: '2026-10-02', cartao_id: 'c2' }),
      compra({ descricao: 'Pneu', valor_total: 300, parcelas: 3, data_compra: '2026-10-03', cartao_id: 'c2' }),
      compra({ descricao: 'Mercado', valor_total: 80, parcelas: 1 }),
    ],
    fixos: [{ id: 'f1', nome: 'Aluguel', valor: 1000, dia_vencimento: 5, mes_inicio: '2026-01', ativo: true }],
  })
  const r = compromissosFuturos(store, '2026-10', 12)
  it('soma o que ainda vai cair em parcelas, só de compras parceladas', () => {
    expect(r.qtdCompras).toBe(2)
    expect(r.parcelasRestantes).toBeCloseTo(1200 + 300, 1)
    expect(r.porCartao).toEqual([{ cartao_id: 'c2', nome: 'Inter', valor: 1500, qtd: 2 }])
  })
  it('mês a mês: parcelas caem quando o parcelamento termina', () => {
    expect(r.meses).toHaveLength(12)
    expect(r.meses[0].parcelas).toBeCloseTo(200, 1)
    expect(r.meses.find((m) => m.mes === '2026-12').parcelas).toBeCloseTo(200, 1)
    expect(r.meses.find((m) => m.mes === '2027-01').parcelas).toBeCloseTo(100, 1)
    expect(r.meses.find((m) => m.mes === '2026-12').terminam.map((c) => c.descricao)).toEqual(['Pneu'])
    expect(r.meses[0].fixos).toBe(1000)
  })
  it('último mês de parcela e meses até lá', () => {
    expect(r.ultimoMes).toBe('2027-09')
    expect(mesesAte('2026-10', r.ultimoMes)).toBe(11)
  })
  it('sem parcelamentos devolve zeros', () => {
    const v = compromissosFuturos(base({ compras: [compra({})] }), '2026-10', 6)
    expect(v.parcelasRestantes).toBe(0)
    expect(v.ultimoMes).toBeNull()
    expect(v.porCartao).toEqual([])
  })
})
