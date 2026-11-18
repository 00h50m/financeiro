import { describe, it, expect } from 'vitest'
import { montarInicio, calcularAjusteLivre } from '../inicio'

const nubank = { id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 10 }
const renda = (mes, giovanna) => ({ mes, giovanna, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 })
const MES = '2026-10'
const store = (saldoAjustes = []) => ({
  cartoes: [nubank], faturas: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: true, adiamentos: [], dividas: [],
  rendas: [renda('2026-09', 5000), renda(MES, 5000)],
  fixos: [{ id: 'f1', nome: 'Aluguel', valor: 1500, ativo: true, dia_vencimento: 5, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Aluguel' }],
  compras: [{ id: 'a', data_compra: '2026-10-02', descricao: 'Mercado', categoria: 'Alimentação', subcategoria: 'Mercado', valor_total: 300, parcelas: 1, cartao_id: 'c1', pago: false }],
  saldoAjustes, aulasAReceber: {},
})
const ini = (aj) => montarInicio(store(aj), MES, '2026-10-10')

describe('ajuste manual do livre para gastar', () => {
  it('o ajuste calculado faz o livre para gastar ficar exatamente como a pessoa quer', () => {
    const antes = ini([])
    const r = calcularAjusteLivre({ modo: 'livre', valor: antes.podeGastar - 250, podeGastar: antes.podeGastar, disponivel: antes.disponivel, ajusteAtual: antes.ajuste })
    expect(r.delta).toBe(-250)
    const depois = ini([{ mes: MES, ajuste: r.novoAjuste }])
    expect(depois.podeGastar).toBeCloseTo(antes.podeGastar - 250, 2)
    expect(r.livreDepois).toBeCloseTo(depois.podeGastar, 2)
  })
  it('soma ao ajuste que já existe (não substitui)', () => {
    const a = ini([{ mes: MES, ajuste: 100 }])
    const r = calcularAjusteLivre({ modo: 'livre', valor: a.podeGastar + 40, podeGastar: a.podeGastar, disponivel: a.disponivel, ajusteAtual: a.ajuste })
    expect(r.novoAjuste).toBe(140)
    expect(ini([{ mes: MES, ajuste: r.novoAjuste }]).podeGastar).toBeCloseTo(a.podeGastar + 40, 2)
  })
  it('modo "tenho na conta": o disponível do app passa a ser o saldo real informado', () => {
    const a = ini([])
    const r = calcularAjusteLivre({ modo: 'saldo', valor: 1234.56, podeGastar: a.podeGastar, disponivel: a.disponivel, ajusteAtual: a.ajuste })
    expect(ini([{ mes: MES, ajuste: r.novoAjuste }]).disponivel).toBeCloseTo(1234.56, 2)
  })
  it('pode deixar o livre negativo e remover o ajuste volta ao valor calculado pelos lançamentos', () => {
    const a = ini([])
    const neg = calcularAjusteLivre({ modo: 'livre', valor: -300, podeGastar: a.podeGastar, disponivel: a.disponivel, ajusteAtual: 0 })
    expect(ini([{ mes: MES, ajuste: neg.novoAjuste }]).podeGastar).toBeCloseTo(-300, 2)
    expect(ini([{ mes: MES, ajuste: 0 }]).podeGastar).toBeCloseTo(a.podeGastar, 2)
  })
  it('o ajuste do mês também chega ao mês seguinte pela sobra anterior (comportamento do acerto de saldo)', () => {
    const proximo = (aj) => montarInicio({ ...store(aj), rendas: [renda(MES, 5000), renda('2026-11', 5000)] }, '2026-11', '2026-11-10')
    expect(proximo([{ mes: MES, ajuste: 500 }]).podeGastar).toBeCloseTo(proximo([]).podeGastar + 500, 2)
  })
})
