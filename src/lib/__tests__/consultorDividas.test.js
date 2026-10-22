import { describe, it, expect } from 'vitest'
import { montarContexto } from '../consultorDividas'
import { reservaVariavel, sobraReal } from '../gastoVariavel'
import { projecaoRenda, perfilDeLinhas } from '../rendaSazonal'

describe('contexto do consultor', () => {
  it('reúne dívidas, sobra real, dia a dia e planos com números do app', () => {
    const store = {
      dividas: [{ id: 'd1', nome: 'Cartão', saldo: 3000, parcela: 200, juros_mes: 10, ativa: true, atrasada: true }],
      rendas: [{ mes: '2026-10', giovanna: 5000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }], rendaSazonal: [],
      compras: [{ id: 1, data_compra: '2026-09-10', categoria: 'Mercado', valor_total: 600, parcelas: 1 }, { id: 2, data_compra: '2026-08-10', categoria: 'Mercado', valor_total: 600, parcelas: 1 }, { id: 3, data_compra: '2026-07-10', categoria: 'Mercado', valor_total: 600, parcelas: 1 }],
      cartoes: [], fixos: [{ id: 'f1', nome: 'Aluguel', valor: 1500, ativo: true, dia_vencimento: 5, inicio: '2026-01' }], faturas: [], adiamentos: [], fixosPagamentos: [], comprasPagamentos: [],
    }
    const proj = projecaoRenda(store, perfilDeLinhas([]), '2026-10', 12)
    const reserva = reservaVariavel(store.compras, '2026-10')
    const real = sobraReal(proj, reserva, '2026-10')
    const ctx = montarContexto(store, { hoje: '2026-10-22', real, reserva, sobrasOrcamento: real.map((m) => Math.max(0, m.sobraReal)) })
    expect(ctx.mes).toBe('2026-10')
    expect(ctx.dividas).toEqual([{ nome: 'Cartão', tipo: null, saldo: 3000, parcela_minima: 200, juros_mes_pct: 10, atrasada: true }])
    expect(ctx.meses).toHaveLength(12)
    expect(ctx.dia_a_dia[0]).toMatchObject({ categoria: 'Mercado', reservado_mes: 600 })
    expect(ctx.planos.avalanche).toHaveProperty('juros_total')
    expect(ctx.contas_do_mes.some((c) => c.nome === 'Aluguel')).toBe(true)
    expect(JSON.stringify(ctx).length).toBeLessThan(20000)
  })
})
