import { describe, it, expect } from 'vitest'
import { diasAte, textoVencimento, categoriasDoMes, montarInicio, diasRestantes, repartoDoMes, linhaDoMes, atencaoDoMes } from '../inicio'

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

describe('diasRestantes / porDia', () => {
  it('conta hoje e só existe no mês atual', () => {
    expect(diasRestantes('2026-10', '2026-10-10')).toBe(22)
    expect(diasRestantes('2026-10', '2026-10-31')).toBe(1)
    expect(diasRestantes('2026-11', '2026-10-10')).toBeNull()
  })
  it('por dia = pode gastar / dias restantes', () => {
    const s = base({ fixos: [fixo({ valor: 300, dia_vencimento: 20 })], rendas: [{ mes: '2026-10', giovanna: 1000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }] })
    const r = montarInicio(s, '2026-10', '2026-10-10')
    expect(r.diasRestantes).toBe(22)
    expect(r.porDia).toBeCloseTo(700 / 22, 5)
    expect(montarInicio(s, '2026-11', '2026-10-10').porDia).toBeNull()
  })
  it('sem sobra não mostra "por dia"', () => {
    const s = base({ fixos: [fixo({ valor: 900 })], rendas: [{ mes: '2026-10', giovanna: 100, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }] })
    expect(montarInicio(s, '2026-10', '2026-10-10').porDia).toBeNull()
  })
})

describe('repartoDoMes', () => {
  it('pago + falta pagar + livre fecham 100%', () => {
    const r = repartoDoMes(100, 200, 700)
    expect(r.total).toBe(1000)
    expect(r.partes.map((p) => p.pct)).toEqual([10, 20, 70])
  })
  it('faltando dinheiro a parte livre some', () => {
    const r = repartoDoMes(100, 600, -200)
    expect(r.partes[2].valor).toBe(0)
    expect(r.partes[0].pct + r.partes[1].pct).toBeCloseTo(100, 0)
  })
  it('mês vazio não divide por zero', () => {
    expect(repartoDoMes(0, 0, 0).partes.every((p) => p.pct === 0)).toBe(true)
  })
})

describe('linhaDoMes / atencaoDoMes', () => {
  const contas = [
    { chave: 'a', nome: 'Aluguel', valor: 1500, dia: 5, pago: false, atrasada: true, dias: -5 },
    { chave: 'b', nome: 'Luz', valor: 100, dia: 12, pago: false, atrasada: false, dias: 2 },
    { chave: 'c', nome: 'Gás', valor: 50, dia: 12, pago: true, atrasada: false, dias: null },
    { chave: 'd', nome: 'Compra', valor: 30, dia: null, pago: false, atrasada: false, dias: null },
  ]
  it('agrupa por dia, marca o estado e conta o que não tem data', () => {
    const l = linhaDoMes(contas, '2026-10', '2026-10-10')
    expect(l.hoje).toBe(10)
    expect(l.ultimoDia).toBe(31)
    expect(l.marcas.map((m) => [m.dia, m.valor, m.estado])).toEqual([[5, 1500, 'atrasada'], [12, 150, 'aberta']])
    expect(l.semData).toBe(1)
    expect(linhaDoMes(contas, '2026-11', '2026-10-10').hoje).toBeNull()
  })
  it('atenção: atrasadas e vencimentos em 7 dias (só as em aberto)', () => {
    const a = atencaoDoMes(contas.filter((c) => !c.pago))
    expect(a.atrasadas).toEqual({ n: 1, valor: 1500 })
    expect(a.proximos7).toEqual({ n: 1, valor: 100 })
  })
})
