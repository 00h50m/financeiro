import { describe, it, expect } from 'vitest'
import { diasAte, textoVencimento, categoriasDoMes, montarInicio } from '../inicio'

const base = (extra = {}) => ({
  fixos: [], fixosPagamentos: [], cartoes: [{ id: 'c1', nome: 'Nubank', titular: 'Gi', fechamento: 10, vencimento: 17 }],
  compras: [], faturas: [], rendas: [], saldoAjustes: [], comprasPagamentos: [], comprasPagamentosOk: true,
  pessoas: [], divisoes: [], ...extra,
})
const fixo = (o) => ({ id: 'f' + Math.random(), nome: 'Luz', valor: 100, dia_vencimento: 10, mes_inicio: '2026-01', ativo: true, ...o })

describe('diasAte / textoVencimento', () => {
  it('conta dias só no mês atual', () => {
    expect(diasAte('2026-10', 15, '2026-10-10')).toBe(5)
    expect(diasAte('2026-10', 8, '2026-10-10')).toBe(-2)
    expect(diasAte('2026-11', 15, '2026-10-10')).toBeNull()
    expect(diasAte('2026-10', null, '2026-10-10')).toBeNull()
  })
  it('dia 31 num mês de 30 dias vale o último dia', () => {
    expect(diasAte('2026-11', 31, '2026-11-28')).toBe(2)
  })
  it('textos', () => {
    expect(textoVencimento(0)).toBe('vence hoje')
    expect(textoVencimento(1)).toBe('vence amanhã')
    expect(textoVencimento(5)).toBe('vence em 5 dias')
    expect(textoVencimento(-1)).toBe('venceu ontem')
    expect(textoVencimento(-3)).toBe('venceu há 3 dias')
    expect(textoVencimento(null, 12)).toBe('dia 12')
    expect(textoVencimento(null, null)).toBe('sem data')
  })
})

describe('categoriasDoMes', () => {
  it('ordena, calcula % e junta o resto em "Outras"', () => {
    const mapa = {}
    ;[['A', 50], ['B', 20], ['C', 10], ['D', 10], ['E', 5], ['F', 5]].forEach(([n, v]) => { mapa[n] = { total: v, itens: [] } })
    const { total, itens } = categoriasDoMes(mapa, 5)
    expect(total).toBe(100)
    expect(itens.map((c) => c.nome)).toEqual(['A', 'B', 'C', 'D', 'Outras'])
    expect(itens[4].valor).toBe(10)
    expect(itens[0].pct).toBe(50)
    expect(itens.reduce((s, c) => s + c.valor, 0)).toBe(100)
  })
  it('sem gastos devolve vazio', () => {
    expect(categoriasDoMes({})).toEqual({ total: 0, itens: [] })
  })
})

describe('montarInicio', () => {
  const store = base({
    fixos: [fixo({ id: 'f1', nome: 'Luz', valor: 200, dia_vencimento: 8 }), fixo({ id: 'f2', nome: 'Internet', valor: 100, dia_vencimento: 20 })],
    fixosPagamentos: [{ fixo_id: 'f2', mes: '2026-10', pago: true }],
    rendas: [{ mes: '2026-10', giovanna: 1000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }],
  })
  const r = montarInicio(store, '2026-10', '2026-10-10')
  it('pode gastar = renda − comprometido (mesma conta da aba Pagamentos)', () => {
    expect(r.entrada).toBe(1000)
    expect(r.comprometido).toBe(300)
    expect(r.pago).toBe(100)
    expect(r.aPagar).toBe(200)
    expect(r.podeGastar).toBe(700)
    expect(r.pctPago).toBe(33)
  })
  it('lista em aberto primeiro, com atraso marcado', () => {
    expect(r.contas.map((c) => c.nome)).toEqual(['Luz', 'Internet'])
    expect(r.contas[0].atrasada).toBe(true)
    expect(r.contas[0].texto).toBe('venceu há 2 dias')
    expect(r.contas[1].pago).toBe(true)
    expect(r.atrasadas).toBe(1)
  })
  it('despesa maior que a renda dá "pode gastar" negativo', () => {
    const s = base({ fixos: [fixo({ valor: 500 })], rendas: [{ mes: '2026-10', giovanna: 100, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }] })
    expect(montarInicio(s, '2026-10', '2026-10-10').podeGastar).toBe(-400)
  })
})
