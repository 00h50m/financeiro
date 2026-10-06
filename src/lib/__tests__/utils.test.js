import { describe, it, expect } from 'vitest'
import { fmt, gastosPorCategoria } from '../utils'
import { cartoes, compra } from './fixtures'

describe('fmt', () => {
  it('formata em reais', () => {
    expect(fmt(1234.5)).toBe('R$ 1.234,50')
  })
  it('sobra de arredondamento não vira "R$ -0,00"', () => {
    expect(fmt(-1e-14)).toBe('R$ 0,00')
    expect(fmt(-0.004)).toBe('R$ 0,00')
  })
  it('valor negativo de verdade continua negativo', () => {
    expect(fmt(-12.3)).toContain('-')
  })
})

describe('gastos por categoria', () => {
  it('compra sem categoria vai para "Sem categoria", nunca "undefined"', () => {
    const c = compra({ categoria: undefined, data_compra: '2026-10-04', valor_total: 50, parcelas: 1, cartao_id: null })
    const r = gastosPorCategoria([c], cartoes, [], '2026-10')
    expect(r['Sem categoria'].total).toBe(50)
    expect(r.undefined).toBeUndefined()
  })
})

describe('fixosAtivos com histórico', () => {
  it('respeita mes_inicio e mes_fim', async () => {
    const { fixosAtivos } = await import('../utils')
    const fixos = [
      { id: 1, ativo: true, mes_fim: '2026-09' },
      { id: 2, ativo: true, mes_inicio: '2026-10' },
    ]
    expect(fixosAtivos(fixos, '2026-09').map((f) => f.id)).toEqual([1])
    expect(fixosAtivos(fixos, '2026-10').map((f) => f.id)).toEqual([2])
  })
})

describe('gerarParcelas com centavos', () => {
  it('a soma das parcelas é igual ao total', async () => {
    const { gerarParcelas } = await import('../utils')
    const ps = gerarParcelas({ valor_total: 100, parcelas: 3, data_compra: '2026-10-05' }, [])
    expect(ps.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    expect(Math.round(ps.reduce((s, p) => s + p.valor, 0) * 100)).toBe(10000)
  })
})

describe('contas fixas de valor variável', () => {
  const comValores = (f, valores) => Object.defineProperty({ ...f }, 'valores', { value: valores, enumerable: false })
  const energia = comValores({ id: 1, nome: 'Energia', valor: 280, ativo: true, variavel: true }, { '2026-09': 312.4 })

  it('mês com valor real usa o real; sem ele usa a estimativa e marca como estimado', async () => {
    const { fixosAtivos } = await import('../utils')
    const [set] = fixosAtivos([energia], '2026-09')
    const [out] = fixosAtivos([energia], '2026-10')
    expect(set).toMatchObject({ valor: 312.4, estimado: false })
    expect(out).toMatchObject({ valor: 280, estimado: true })
  })
  it('informar um mês não altera os outros (passados ou futuros)', async () => {
    const { fixosAtivos } = await import('../utils')
    expect(fixosAtivos([energia], '2026-08')[0].valor).toBe(280)
    expect(fixosAtivos([energia], '2026-11')[0].valor).toBe(280)
  })
  it('conta fixa comum não é marcada como estimada e os valores não vazam para backup/gravação', async () => {
    const { fixosAtivos } = await import('../utils')
    expect(fixosAtivos([{ id: 2, nome: 'Internet', valor: 100, ativo: true }], '2026-10')[0].estimado).toBeUndefined()
    expect(Object.keys(energia)).not.toContain('valores')
    expect(JSON.stringify(energia)).not.toContain('312.4')
  })
})

describe('fatura escolhida na compra', () => {
  it('fatura_mes manda sobre o fechamento; sem cartão ou valor inválido volta ao automático', async () => {
    const { mesDaFatura, gerarParcelas } = await import('../utils')
    const cartao = { id: 'c1', fechamento: 1 }
    const c = { cartao_id: 'c1', data_compra: '2026-09-01', valor_total: 100, parcelas: 2 }
    expect(mesDaFatura(c, cartao)).toBe('2026-09')
    expect(mesDaFatura({ ...c, fatura_mes: '2026-10' }, cartao)).toBe('2026-10')
    expect(mesDaFatura({ ...c, fatura_mes: 'lixo' }, cartao)).toBe('2026-09')
    expect(mesDaFatura({ ...c, fatura_mes: '2026-10' }, undefined)).toBe('2026-09')
    expect(gerarParcelas({ ...c, fatura_mes: '2026-10' }, [cartao]).map((p) => p.mes)).toEqual(['2026-10', '2026-11'])
  })
})

describe('limite do cartão com contas fixas no cartão', () => {
  it('conta fixa no cartão ocupa limite enquanto a fatura do mês não está paga', async () => {
    const { limiteUsado } = await import('../utils')
    const fixos = [{ id: 'f', nome: 'Internet', valor: 100, ativo: true, cartao_id: 'c1' }, { id: 'g', nome: 'Outra', valor: 50, ativo: true, cartao_id: 'c2' }]
    expect(limiteUsado('c1', [], [{ id: 'c1' }], [], '2026-10', fixos).usado).toBe(100)
    expect(limiteUsado('c1', [], [{ id: 'c1' }], [{ cartao_id: 'c1', mes: '2026-10', pago: true }], '2026-10', fixos).usado).toBe(0)
    expect(limiteUsado('c1', [], [{ id: 'c1' }], [], '2026-10').usado).toBe(0)
  })
})
