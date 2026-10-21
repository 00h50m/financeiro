import { describe, it, expect } from 'vitest'
import { faturasAbertas, filtrarCartoes, formatarFaturas } from '../fatura'

const cartoes = [{ id: 'c-nu', nome: 'Nubank Gi', fechamento: 25 }, { id: 'c-in', nome: 'Inter', fechamento: 10 }]
const compra = (o) => ({ data_compra: '2026-10-02', valor_total: 100, parcelas: 1, cartao_id: 'c-nu', ...o })

describe('faturasAbertas', () => {
  it('soma o que cai na fatura aberta e conta parcelas de compras antigas', () => {
    const compras = [compra({}), compra({ data_compra: '2026-08-05', valor_total: 300, parcelas: 3 }), compra({ data_compra: '2026-10-30' })]
    const [nu] = faturasAbertas(cartoes, compras, '2026-10-15')
    expect(nu).toMatchObject({ mes: '2026-10', total: 200, n: 2, fecha: '2026-10-25', dias: 10 })
  })
  it('depois do fechamento a fatura aberta é a do mês seguinte', () => {
    const [nu, inter] = faturasAbertas(cartoes, [compra({ data_compra: '2026-10-28' })], '2026-10-28')
    expect(nu).toMatchObject({ mes: '2026-11', total: 100 })
    expect(inter).toMatchObject({ mes: '2026-11', total: 0, n: 0 })
  })
  it('cartão sem fechamento cadastrado não inventa data', () => {
    const [f] = faturasAbertas([{ id: 'c-nu', nome: 'Nubank' }], [compra({})], '2026-10-15')
    expect(f.fecha).toBeNull()
  })
})

describe('texto', () => {
  it('filtra o cartão citado e, se não citar nenhum, mostra todos', () => {
    expect(filtrarCartoes(cartoes, 'quanto está a fatura do nubank?').map((c) => c.id)).toEqual(['c-nu'])
    expect(filtrarCartoes(cartoes, 'quanto está a fatura').length).toBe(2)
  })
  it('avisa quando está para fechar', () => {
    const t = formatarFaturas(faturasAbertas(cartoes, [compra({})], '2026-10-23'))
    expect(t).toContain('Nubank Gi')
    expect(t).toContain('fecha em 2 dias')
    expect(t).toContain('Total:')
  })
})

import { mesesDeFaturas } from '../faturaMeses'
describe('faturas a longo prazo', () => {
  const cartoes = [{ id: 'k', nome: 'Nu', ativo: true, fechamento: 5, vencimento: 10 }]
  const compras = [{ id: 'c', data_compra: '2026-10-01', valor_total: 1200, parcelas: 12, cartao_id: 'k', descricao: 'TV' }]
  it('por padrão mostra só até o mês seguinte; com mesesFuturos mostra os meses à frente', () => {
    const curto = mesesDeFaturas({ cartoes, compras, hoje: '2026-10' }).map((m) => m.mes)
    expect(curto[0]).toBe('2026-11')
    const longo = mesesDeFaturas({ cartoes, compras, hoje: '2026-10', mesesFuturos: 6 }).map((m) => m.mes)
    expect(longo[0]).toBe('2027-04')
    expect(longo).toContain('2026-12')
  })
  it('fatura cadastrada num mês distante aparece mesmo fora da janela', () => {
    const m = mesesDeFaturas({ cartoes, compras: [], faturas: [{ id: 'f', cartao_id: 'k', mes: '2027-08', valor_real: 500 }], hoje: '2026-10' }).map((x) => x.mes)
    expect(m).toContain('2027-08')
  })
})
