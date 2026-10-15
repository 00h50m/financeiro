import { describe, it, expect } from 'vitest'
import { detalhePagamentos, resumoDoMes } from '../financeiro.js'

const base = () => ({
  cartoes: [], faturas: [], saldoAjustes: [], comprasPagamentos: [], comprasPagamentosOk: true,
  fixos: [{ id: 'f1', nome: 'Aluguel', valor: 1000, ativo: true, dia_vencimento: 5, categoria: 'Casa', subcategoria: 'Aluguel' }, { id: 'f2', nome: 'Internet', valor: 100, ativo: true, dia_vencimento: 10, categoria: 'Casa', subcategoria: 'Internet' }],
  fixosPagamentos: [],
  compras: [{ id: 'c1', descricao: 'Boleto TV', valor_total: 900, parcelas: 3, data_compra: '2026-10-05', categoria: 'Casa', subcategoria: 'Outros', cartao_id: null, pessoa: 'Giovanna' }],
  rendas: [{ mes: '2026-10', giovanna: 5000 }, { mes: '2026-11', giovanna: 5000 }, { mes: '2026-12', giovanna: 5000 }],
})
const fixoAdiado = { id: 'a1', tipo: 'fixo', ref_id: 'f1', mes_origem: '2026-10', mes_destino: '2026-11' }
const parcelaAdiada = { id: 'a2', tipo: 'compra', ref_id: 'c1', mes_origem: '2026-10', mes_destino: '2026-11' }

describe('adiar contas para outro mês', () => {
  it('sem adiamentos nada muda', () => {
    const d = base()
    expect(detalhePagamentos(d, '2026-10').comprometido).toBe(1400) // 1000 + 100 + parcela 300
    expect(detalhePagamentos({ ...d, adiamentos: [] }, '2026-10').comprometido).toBe(1400)
  })
  it('conta fixa adiada sai do mês de origem e entra no de destino (que fica com duas)', () => {
    const d = { ...base(), adiamentos: [fixoAdiado] }
    const out = detalhePagamentos(d, '2026-10')
    const nov = detalhePagamentos(d, '2026-11')
    expect(out.fixosLista.map((f) => f.id)).toEqual(['f2'])
    expect(out.comprometido).toBe(400)
    expect(nov.fixosLista.map((f) => f.id).sort()).toEqual(['f1', 'f1', 'f2'])
    expect(nov.fixosLista.find((f) => f.adiadoDe)).toMatchObject({ adiadoDe: '2026-10', mesPagamento: '2026-10' })
    expect(nov.comprometido).toBe(2400 - 300 + 300) // 1000 + 1000 + 100 + parcela 300 de novembro
  })
  it('o pagamento da conta adiada fica no mês de origem, sem confundir com a conta própria do destino', () => {
    const d = { ...base(), adiamentos: [fixoAdiado], fixosPagamentos: [{ fixo_id: 'f1', mes: '2026-10', pago: true }] }
    const nov = detalhePagamentos(d, '2026-11')
    const [propria, adiada] = [nov.fixosLista.find((f) => !f.adiadoDe && f.id === 'f1'), nov.fixosLista.find((f) => f.adiadoDe)]
    expect(nov.fixoPagamento(propria)?.pago).toBeFalsy()
    expect(nov.fixoPagamento(adiada)?.pago).toBe(true)
    expect(nov.pago).toBe(1000) // só a adiada (paga em novembro, registro de outubro)
  })
  it('parcela de compra sem cartão adiada muda de mês e leva o pagamento do mês de origem', () => {
    const d = { ...base(), adiamentos: [parcelaAdiada], comprasPagamentos: [{ compra_id: 'c1', mes: '2026-10', pago: true }] }
    expect(detalhePagamentos(d, '2026-10').outrasContas).toHaveLength(0)
    const nov = detalhePagamentos(d, '2026-11')
    expect(nov.outrasContas).toHaveLength(2) // a parcela 2/3 de novembro + a 1/3 que veio de outubro
    const veio = nov.outrasContas.find((c) => c.adiadoDe)
    expect(veio).toMatchObject({ adiadoDe: '2026-10', parcelaNum: 1, mesParcela: '2026-10', pago: true })
  })
  it('a sobra de cada mês muda e o total de contas continua o mesmo', () => {
    const d = base()
    const dd = { ...d, adiamentos: [fixoAdiado] }
    const r = (x, m) => resumoDoMes(x, m, { usarSaldoAnterior: false })
    expect(r(dd, '2026-10').sobraDoMes - r(d, '2026-10').sobraDoMes).toBe(1000)
    expect(r(dd, '2026-11').sobraDoMes - r(d, '2026-11').sobraDoMes).toBe(-1000)
    const soma = (x) => ['2026-10', '2026-11', '2026-12'].reduce((t, m) => t + detalhePagamentos(x, m).comprometido, 0)
    expect(soma(dd)).toBe(soma(d))
  })
  it('adiamento de conta no cartão é ignorado (só boleto/sem cartão adia)', () => {
    const d = { ...base(), cartoes: [{ id: 'k', nome: 'Nu', ativo: true }], adiamentos: [fixoAdiado] }
    d.fixos[0].cartao_id = 'k'
    expect(detalhePagamentos(d, '2026-10').totalFixos).toBe(1100)
    expect(detalhePagamentos(d, '2026-11').totalFixos).toBe(1100)
  })
})

import { acrescimoAdiamento } from '../financeiro.js'
describe('multa e juros ao adiar', () => {
  it('calcula multa + juros por mês de atraso', () => {
    expect(acrescimoAdiamento(1000, '2026-10', '2026-11', 2, 1)).toBe(30) // 2% + 1 mês × 1%
    expect(acrescimoAdiamento(1000, '2026-10', '2027-01', 2, 1)).toBe(50) // 2% + 3 meses × 1%
    expect(acrescimoAdiamento(500, '2026-10', '2026-11', 0, 0)).toBe(0)
    expect(acrescimoAdiamento(1000, '2026-10', '2026-10', 2, 1)).toBe(0)
  })
  it('o acréscimo entra no valor do mês de destino e a soma dos meses passa a refletir o custo', () => {
    const d = base()
    const dd = { ...d, adiamentos: [{ ...fixoAdiado, acrescimo: 30 }] }
    const nov = detalhePagamentos(dd, '2026-11')
    expect(nov.fixosLista.find((f) => f.adiadoDe)).toMatchObject({ valor: 1030, acrescimoAdiamento: 30 })
    const soma = (x) => ['2026-10', '2026-11', '2026-12'].reduce((t, m) => t + detalhePagamentos(x, m).comprometido, 0)
    expect(soma(dd) - soma(d)).toBe(30)
  })
  it('parcela adiada também leva o acréscimo', () => {
    const dd = { ...base(), adiamentos: [{ ...parcelaAdiada, acrescimo: 12 }] }
    const veio = detalhePagamentos(dd, '2026-11').outrasContas.find((c) => c.adiadoDe)
    expect(veio.valorParcela).toBe(312)
  })
})
