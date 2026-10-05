import { describe, it, expect } from 'vitest'
import { eventosDoMes, porDia, diasNoMes } from '../calendario'
import { buscar } from '../busca'

const nubank = { id: 'c1', nome: 'Nubank', fechamento: 10, vencimento: 17 }
const base = (extra = {}) => ({
  fixos: [], fixosPagamentos: [], cartoes: [nubank], compras: [], faturas: [], rendas: [], saldoAjustes: [],
  comprasPagamentos: [], comprasPagamentosOk: true, metas: [], eventos: [], ...extra,
})
const fixo = (o) => ({ id: 'f1', nome: 'Aluguel', valor: 1000, dia_vencimento: 5, ativo: true, ...o })
const compra = (o) => ({ id: 'k' + Math.random(), parcelas: 1, cartao_id: null, pago: false, pessoa: 'Gi', categoria: 'Mercado', data_compra: '2026-10-12', valor_total: 100, descricao: 'x', ...o })

describe('calendário', () => {
  it('diasNoMes', () => {
    expect(diasNoMes('2026-02')).toBe(28)
    expect(diasNoMes('2028-02')).toBe(29)
    expect(diasNoMes('2026-10')).toBe(31)
  })
  it('lista fixo, fatura e parcela sem cartão nos dias certos', () => {
    const d = base({
      fixos: [fixo()],
      compras: [compra({ cartao_id: 'c1', data_compra: '2026-09-20', valor_total: 300 }), compra({ descricao: 'Dentista', valor_total: 200, data_compra: '2026-10-12' })],
    })
    const { eventos } = eventosDoMes(d, '2026-10')
    expect(eventos.map((e) => [e.dia, e.tipo])).toEqual([[5, 'fixo'], [12, 'parcela'], [17, 'fatura']])
    expect(eventos.find((e) => e.tipo === 'fatura')).toMatchObject({ valor: 300, estimada: true, pago: false })
  })
  it('dia 31 em mês curto vira último dia', () => {
    const { eventos } = eventosDoMes(base({ fixos: [fixo({ dia_vencimento: 31 })] }), '2026-02')
    expect(eventos[0].dia).toBe(28)
  })
  it('fixo sem dia vai para semDia e fixo encerrado não aparece', () => {
    const d = base({ fixos: [fixo({ dia_vencimento: null }), fixo({ id: 'f2', mes_fim: '2026-08' })] })
    const r = eventosDoMes(d, '2026-10')
    expect(r.eventos).toEqual([])
    expect(r.semDia).toHaveLength(1)
  })
  it('sem duplicar: cada item aparece uma vez, mesmo com 2 compras no mesmo cartão', () => {
    const d = base({ compras: [compra({ cartao_id: 'c1', data_compra: '2026-09-20' }), compra({ cartao_id: 'c1', data_compra: '2026-09-25' })] })
    const { eventos } = eventosDoMes(d, '2026-10')
    expect(new Set(eventos.map((e) => e.chave)).size).toBe(eventos.length)
    expect(eventos.filter((e) => e.tipo === 'fatura')).toHaveLength(1)
    expect(eventos[0].valor).toBe(200)
  })
  it('parcela marcada como paga aparece paga', () => {
    const c = compra({ id: 'p1', pago: true, data_compra: '2026-10-03' })
    const { eventos } = eventosDoMes(base({ compras: [c] }), '2026-10')
    expect(eventos[0].pago).toBe(true)
  })
  it('porDia agrupa', () => {
    expect(Object.keys(porDia([{ dia: 3 }, { dia: 3 }, { dia: 9 }]))).toEqual(['3', '9'])
  })
})

describe('busca global', () => {
  const d = base({
    compras: [compra({ descricao: 'PADARIA SÃO JOÃO', valor_total: 89.9 }), compra({ descricao: 'Netflix', identificacao: 'Streaming', categoria: 'Lazer' })],
    fixos: [fixo({ nome: 'Internet', valor: 120 })],
    metas: [{ id: 'm1', nome: 'Viagem Lisboa', tipo: 'objetivo' }],
    eventos: [{ id: 'e1', descricao_original: 'IFOOD *PEDIDO', data_evento: '2026-10-02', status: 'pendente', valor: -45, categoria: null, obs: null }],
  })
  it('ignora acento e maiúscula', () => {
    expect(buscar(d, 'sao joao').grupos[0].itens[0].titulo).toBe('PADARIA SÃO JOÃO')
    expect(buscar(d, 'PADARIA').total).toBe(1)
  })
  it('acha por identificação, categoria e outras áreas', () => {
    expect(buscar(d, 'streaming').grupos[0].itens[0].titulo).toBe('Streaming')
    expect(buscar(d, 'lisboa').grupos[0].id).toBe('metas')
    expect(buscar(d, 'ifood').grupos[0].id).toBe('inbox')
    expect(buscar(d, 'nubank').grupos[0].id).toBe('cartoes')
  })
  it('acha pelo valor', () => {
    expect(buscar(d, '89,90').grupos[0].itens[0].titulo).toBe('PADARIA SÃO JOÃO')
    expect(buscar(d, '120').grupos.find((g) => g.id === 'fixos').itens[0].titulo).toBe('Internet')
  })
  it('termo curto ou sem resultado', () => {
    expect(buscar(d, 'a').total).toBe(0)
    expect(buscar(d, 'zzzzz').total).toBe(0)
  })
  it('limita itens mostrados mas informa o total', () => {
    const muitas = base({ compras: Array.from({ length: 30 }, (_, i) => compra({ descricao: 'Mercado ' + i })) })
    const g = buscar(muitas, 'mercado', { limite: 10 }).grupos[0]
    expect(g.itens).toHaveLength(10)
    expect(g.total).toBe(30)
  })
})
