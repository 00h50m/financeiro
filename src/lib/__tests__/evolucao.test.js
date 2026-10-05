import { describe, it, expect } from 'vitest'
import { variacao, serieMensal, comparativos, insights, evolucaoPorCategoria, mediaDe } from '../evolucao'

const base = (extra = {}) => ({
  fixos: [], fixosPagamentos: [], cartoes: [], compras: [], faturas: [], rendas: [], saldoAjustes: [],
  comprasPagamentos: [], comprasPagamentosOk: true, fechamentos: [], ...extra,
})
const renda = (mes, giovanna) => ({ mes, giovanna, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 })
const compra = (data_compra, valor_total, categoria = 'Mercado', extra = {}) => ({ id: 'k' + Math.random(), descricao: 'x', parcelas: 1, cartao_id: null, pago: false, pessoa: 'Gi', categoria, data_compra, valor_total, ...extra })

describe('variacao', () => {
  it('calcula delta e percentual', () => {
    expect(variacao(120, 100)).toEqual({ delta: 20, pct: 20 })
    expect(variacao(80, 100)).toEqual({ delta: -20, pct: -20 })
  })
  it('base zero ou irrelevante não gera percentual enganoso', () => {
    expect(variacao(500, 0)).toEqual({ delta: 500, pct: null })
    expect(variacao(500, 0.5)).toEqual({ delta: 499.5, pct: null })
    expect(variacao(300, 10, { baseMinima: 50 }).pct).toBe(null)
  })
})

describe('serieMensal', () => {
  it('traz 12 meses terminando no mês pedido e marca meses sem dados', () => {
    const d = base({ rendas: [renda('2026-09', 5000)], compras: [compra('2026-09-10', 1000)] })
    const s = serieMensal(d, '2026-10', 12)
    expect(s).toHaveLength(12)
    expect(s[11].mes).toBe('2026-10')
    expect(s[10]).toMatchObject({ mes: '2026-09', renda: 5000, despesas: 1000, sobra: 4000, taxaPoupanca: 80, temDados: true })
    expect(s[0].temDados).toBe(false)
  })
  it('mês fechado usa a foto, não o cálculo ao vivo', () => {
    const d = base({
      rendas: [renda('2026-09', 5000)], compras: [compra('2026-09-10', 1000)],
      fechamentos: [{ mes: '2026-09', status: 'fechado', renda: 5000, despesas: 700, sobra: 4300, por_categoria: { Mercado: 700 } }],
    })
    const l = serieMensal(d, '2026-09', 1)[0]
    expect(l).toMatchObject({ despesas: 700, fonte: 'fechado' })
  })
  it('mediaDe ignora meses sem dados', () => {
    expect(mediaDe([{ temDados: true, despesas: 100 }, { temDados: false, despesas: 0 }, { temDados: true, despesas: 300 }], 'despesas')).toBe(200)
    expect(mediaDe([{ temDados: false, despesas: 0 }], 'despesas')).toBe(null)
  })
})

describe('comparativos', () => {
  const d = base({
    rendas: ['2025-10', '2026-07', '2026-08', '2026-09', '2026-10'].map((m) => renda(m, 5000)),
    compras: [compra('2025-10-05', 400), compra('2026-07-05', 1000), compra('2026-08-05', 1000), compra('2026-09-05', 1000), compra('2026-10-05', 1500)],
  })
  it('compara com mês anterior, médias e ano passado', () => {
    const c = comparativos(d, '2026-10', 'despesas')
    expect(c.atual).toBe(1500)
    const [ant, m3, m6, ano] = c.itens
    expect(ant).toMatchObject({ referencia: 1000, delta: 500, pct: 50 })
    expect(m3).toMatchObject({ referencia: 1000, pct: 50 })
    expect(m6.referencia).toBe(1000) // só 3 meses com dados
    expect(ano).toMatchObject({ referencia: 400, delta: 1100, pct: 275 })
  })
  it('referência sem dados vira null, sem percentual', () => {
    const c = comparativos(base({ rendas: [renda('2026-10', 5000)], compras: [compra('2026-10-05', 100)] }), '2026-10')
    expect(c.itens.every((i) => i.referencia === null)).toBe(true)
  })
})

describe('insights', () => {
  const d = base({
    rendas: ['2026-07', '2026-08', '2026-09', '2026-10'].map((m) => renda(m, 5000)),
    compras: [
      compra('2026-07-05', 500), compra('2026-08-05', 500), compra('2026-09-05', 500), compra('2026-10-05', 900),
      compra('2026-07-06', 300, 'Lazer'), compra('2026-08-06', 300, 'Lazer'), compra('2026-09-06', 300, 'Lazer'), compra('2026-10-06', 300, 'Lazer'),
    ],
  })
  it('categoria que subiu traz a conta', () => {
    const i = insights(d, '2026-10').find((x) => x.id === 'cat-Mercado')
    expect(i.texto).toMatch(/80%/)
    expect(i.porque).toMatch(/R\$ 900,00.*R\$ 500,00/)
  })
  it('categoria estável não gera alerta', () => {
    expect(insights(d, '2026-10').some((x) => x.id === 'cat-Lazer')).toBe(false)
  })
  it('mês no vermelho é avisado com a conta', () => {
    const v = base({ rendas: [renda('2026-10', 500)], compras: [compra('2026-10-05', 900)] })
    expect(insights(v, '2026-10').find((x) => x.id === 'negativo').porque).toMatch(/R\$ 500,00 − despesas R\$ 900,00/)
  })
  it('parcelamento que termina libera orçamento no mês seguinte', () => {
    const v = base({ rendas: [renda('2026-10', 5000)], compras: [compra('2026-08-05', 300, 'Casa', { parcelas: 3, descricao: 'Sofá' })] })
    const i = insights(v, '2026-10').find((x) => x.id === 'parcelas-terminam')
    expect(i.texto).toMatch(/R\$ 100,00/)
    expect(i.porque).toMatch(/Sofá/)
  })
  it('sem dados não inventa observação', () => {
    expect(insights(base(), '2026-10')).toEqual([])
  })
})

describe('evolucaoPorCategoria', () => {
  it('compara o mês com o anterior e não inventa percentual de base pequena', () => {
    const d = base({ compras: [compra('2026-09-05', 20, 'Lazer'), compra('2026-10-05', 400, 'Lazer'), compra('2026-10-05', 100, 'Casa')] })
    const r = evolucaoPorCategoria(d, '2026-10')
    expect(r.find((c) => c.categoria === 'Lazer')).toMatchObject({ atual: 400, anterior: 20, delta: 380, pct: null })
    expect(r.find((c) => c.categoria === 'Casa').anterior).toBe(0)
  })
})
