import { describe, it, expect } from 'vitest'
import { lerValorReal, validarFatura, dadosDaFatura, mesesAfetadosPelaFatura } from '../faturaEdicao'

const cartoes = [{ id: 'c1' }, { id: 'c2' }]
const faturas = [{ id: 'f1', cartao_id: 'c1', mes: '2026-09' }, { id: 'f2', cartao_id: 'c1', mes: '2026-10' }]
const ok = { cartao_id: 'c1', mes: '2026-11', valor_real: '1234,56', pago: false, data_pagamento: '' }

describe('edição de fatura', () => {
  it('valor: vírgula, vazio e inválido', () => {
    expect(lerValorReal('1234,56')).toEqual({ vazio: false, valor: 1234.56 })
    expect(lerValorReal(' ')).toEqual({ vazio: true, valor: null })
    expect(Number.isNaN(lerValorReal('abc').valor)).toBe(true)
    expect(Number.isNaN(lerValorReal('-5').valor)).toBe(true)
    expect(lerValorReal('0').valor).toBe(0)
  })
  it('fatura válida não tem problemas', () => {
    expect(validarFatura(ok, { faturas, cartoes })).toEqual([])
  })
  it('exige cartão, mês e valor (nova); editar permite limpar o valor', () => {
    expect(validarFatura({ ...ok, cartao_id: '' }, { faturas, cartoes })).toContain('Escolha o cartão.')
    expect(validarFatura({ ...ok, mes: '2026-13' }, { faturas, cartoes })).toContain('Informe o mês da fatura.')
    expect(validarFatura({ ...ok, valor_real: '' }, { faturas, cartoes })).toContain('Informe o valor real da fatura.')
    expect(validarFatura({ ...ok, valor_real: '' }, { faturas, cartoes, id: 'f1', })).not.toContain('Informe o valor real da fatura.')
  })
  it('não deixa duas faturas do mesmo cartão no mesmo mês', () => {
    expect(validarFatura({ ...ok, mes: '2026-10' }, { faturas, cartoes })[0]).toContain('Já existe uma fatura')
    // editar a própria fatura sem mudar cartão/mês é permitido
    expect(validarFatura({ ...ok, mes: '2026-09' }, { faturas, cartoes, id: 'f1' })).toEqual([])
    // mover f1 para o mês de f2 (mesmo cartão) não pode
    expect(validarFatura({ ...ok, mes: '2026-10' }, { faturas, cartoes, id: 'f1' })[0]).toContain('Já existe uma fatura')
    // outro cartão no mesmo mês pode
    expect(validarFatura({ ...ok, cartao_id: 'c2', mes: '2026-10' }, { faturas, cartoes })).toEqual([])
  })
  it('dados: paga usa a data informada ou hoje; não paga limpa a data; vazio vira null', () => {
    expect(dadosDaFatura({ ...ok, pago: true, data_pagamento: '2026-10-03' }, '2026-10-06')).toMatchObject({ valor_real: 1234.56, pago: true, data_pagamento: '2026-10-03' })
    expect(dadosDaFatura({ ...ok, pago: true, data_pagamento: '' }, '2026-10-06').data_pagamento).toBe('2026-10-06')
    expect(dadosDaFatura({ ...ok, pago: false, data_pagamento: '2026-10-03' }, '2026-10-06').data_pagamento).toBeNull()
    expect(dadosDaFatura({ ...ok, valor_real: '' }, '2026-10-06').valor_real).toBeNull()
  })
  it('meses tocados: o antigo e o novo, sem repetir', () => {
    expect(mesesAfetadosPelaFatura({ mes: '2026-09' }, { mes: '2026-10' })).toEqual(['2026-09', '2026-10'])
    expect(mesesAfetadosPelaFatura({ mes: '2026-09' }, { mes: '2026-09' })).toEqual(['2026-09'])
  })
})
