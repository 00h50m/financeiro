import { describe, it, expect } from 'vitest'
import { mesesDeFaturas } from '../faturaMeses'

const nubank = { id: 'c1', nome: 'Nubank', fechamento: 25 }
const inter = { id: 'c2', nome: 'Inter', fechamento: 10 }
const compra = (o) => ({ id: 'x' + Math.random(), parcelas: 1, cartao_id: 'c1', valor_total: 100, ...o })
const base = { cartoes: [nubank, inter], hoje: '2026-10' }

describe('meses da tela de Faturas', () => {
  it('mostra meses com compra mesmo sem fatura cadastrada (antes ficavam invisíveis)', () => {
    const compras = [compra({ data_compra: '2026-08-10' }), compra({ data_compra: '2026-09-10' })]
    const r = mesesDeFaturas({ ...base, compras })
    expect(r.map((m) => m.mes)).toEqual(['2026-09', '2026-08'])
    expect(r[0].linhas).toEqual([{ cartao_id: 'c1', fatura: null, lancado: 100 }])
  })
  it('mês com fatura cadastrada aparece, e a linha traz a fatura', () => {
    const faturas = [{ id: 'f', cartao_id: 'c1', mes: '2026-10', valor_real: 5103.57 }]
    const r = mesesDeFaturas({ ...base, faturas, compras: [compra({ data_compra: '2026-10-02' })] })
    expect(r[0]).toMatchObject({ mes: '2026-10' })
    expect(r[0].linhas[0].fatura.id).toBe('f')
  })
  it('um cartão com fatura e outro só com compras, no mesmo mês', () => {
    const faturas = [{ id: 'f', cartao_id: 'c1', mes: '2026-09', valor_real: 90 }]
    const compras = [compra({ data_compra: '2026-09-02' }), compra({ data_compra: '2026-09-03', cartao_id: 'c2', valor_total: 40 })]
    const [setembro] = mesesDeFaturas({ ...base, faturas, compras })
    expect(setembro.linhas.map((l) => [l.cartao_id, !!l.fatura])).toEqual([['c1', true], ['c2', false]])
  })
  it('parcelas aparecem nos meses seguintes, até o mês que vem; não passa disso', () => {
    const r = mesesDeFaturas({ ...base, compras: [compra({ data_compra: '2026-09-10', parcelas: 6, valor_total: 600 })] })
    expect(r.map((m) => m.mes)).toEqual(['2026-11', '2026-10', '2026-09'])
    expect(r[0].linhas[0].lancado).toBe(100)
  })
  it('compra sem cartão não cria fatura; mês sem nada não aparece', () => {
    const r = mesesDeFaturas({ ...base, compras: [compra({ data_compra: '2026-09-10', cartao_id: null })] })
    expect(r).toEqual([])
  })
  it('conta fixa no cartão também gera a linha do mês', () => {
    const fixos = [{ id: 'nf', nome: 'Netflix', valor: 55, ativo: true, cartao_id: 'c1', mes_inicio: '2026-09' }]
    const r = mesesDeFaturas({ ...base, fixos, compras: [compra({ data_compra: '2026-09-10' })] })
    expect(r[0].linhas[0].lancado).toBe(55) // mês que vem: só o fixo
    expect(r.find((m) => m.mes === '2026-09').linhas[0].lancado).toBe(155)
  })
  it('fatura cadastrada num mês futuro distante continua aparecendo', () => {
    const faturas = [{ id: 'f', cartao_id: 'c1', mes: '2027-03', valor_real: 10 }]
    expect(mesesDeFaturas({ ...base, faturas }).map((m) => m.mes)).toEqual(['2027-03'])
  })
})
