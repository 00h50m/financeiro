import { describe, it, expect } from 'vitest'
import { detalhePagamentos, resumoDoMes } from '../financeiro'
import { listaDePagamentos, filtrarPorAba, contagemPorAba, resumoCompacto, podeMarcarEmLote } from '../pagamentosLista'

const nubank = { id: 'c1', nome: 'Nubank', titular: 'Gi', fechamento: 3, vencimento: 20 }
const MES = '2026-10'
const HOJE = '2026-10-10'
const dados = (extra = {}) => ({
  cartoes: [nubank], faturas: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: true, adiamentos: [], dividas: [], rendas: [], saldoAjustes: [],
  fixos: [
    { id: 'f1', nome: 'Aluguel', valor: 1500, ativo: true, dia_vencimento: 5, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Aluguel' },
    { id: 'f2', nome: 'Internet', valor: 120, ativo: true, dia_vencimento: 12, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Internet' },
    { id: 'f3', nome: 'Condomínio', valor: 400, ativo: true, dia_vencimento: null, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Outros' },
  ],
  compras: [
    { id: 'a', data_compra: '2026-10-02', descricao: 'Mercado', categoria: 'Alimentação', subcategoria: 'Mercado', valor_total: 300, parcelas: 1, cartao_id: 'c1', pago: false },
    { id: 'b', data_compra: '2026-10-04', descricao: 'Boleto escola', categoria: 'Educação', subcategoria: 'Outros', valor_total: 700, parcelas: 1, cartao_id: null, pago: false },
  ],
  ...extra,
})
const montar = (d, mes = MES, hoje = HOJE) => listaDePagamentos(detalhePagamentos(d, mes), d.cartoes, mes, hoje)

describe('lista única de pagamentos', () => {
  const lista = montar(dados())
  it('junta fixas, fatura e compra sem cartão numa lista só', () => {
    expect(lista.map((i) => i.tipo).sort()).toEqual(['compra', 'fatura', 'fixo', 'fixo', 'fixo'])
  })
  it('os totais batem com o resumo financeiro (a pagar = comprometido − pago)', () => {
    const r = resumoDoMes(dados(), MES, { usarSaldoAnterior: false })
    const c = resumoCompacto(lista)
    expect(c.aPagar).toBeCloseTo(r.aPagar, 2)
    expect(c.pago).toBeCloseTo(r.pago, 2)
    expect(c.total).toBeCloseTo(r.comprometido, 2)
  })
  it('ordena por urgência: atrasadas, a vencer (mais próxima primeiro), sem vencimento, pagas por último', () => {
    const sit = lista.map((i) => `${i.nome}:${i.situacao}`)
    expect(sit[0]).toBe('Aluguel:atrasada') // dia 5, hoje é 10
    expect(lista.findIndex((i) => i.nome === 'Internet')).toBeLessThan(lista.findIndex((i) => i.nome === 'Fatura Nubank')) // dia 12 antes de dia 20
    expect(lista.at(-1).situacao).not.toBe('paga') // sem pagas ainda
    const semData = lista.filter((i) => i.situacao === 'sem_data').map((i) => i.nome)
    expect(semData).toContain('Condomínio'); expect(semData).toContain('Boleto escola')
    expect(lista.findIndex((i) => i.nome === 'Condomínio')).toBeGreaterThan(lista.findIndex((i) => i.nome === 'Fatura Nubank'))
  })
  it('abas: A pagar, Atrasadas, Pagas, Todas (contagens)', () => {
    const c = contagemPorAba(lista)
    expect(c).toEqual({ apagar: 5, atrasadas: 1, pagas: 0, todas: 5 })
    expect(filtrarPorAba(lista, 'atrasadas').map((i) => i.nome)).toEqual(['Aluguel'])
  })
  it('conta paga vai para "Pagas" e sai de "A pagar", sem mudar o total', () => {
    const d = dados({ fixosPagamentos: [{ fixo_id: 'f1', mes: MES, pago: true, data_pagamento: '2026-10-06' }] })
    const l2 = montar(d)
    expect(contagemPorAba(l2)).toEqual({ apagar: 4, atrasadas: 0, pagas: 1, todas: 5 })
    expect(l2.at(-1).nome).toBe('Aluguel') // pagas por último
    expect(resumoCompacto(l2).total).toBeCloseTo(resumoCompacto(lista).total, 2)
    expect(resumoCompacto(l2).pago).toBeCloseTo(1500, 2)
  })
  it('próximos 7 dias e atrasadas no resumo', () => {
    const c = resumoCompacto(lista)
    expect(c.atrasadas).toEqual({ qtd: 1, valor: 1500 })
    expect(c.proximos7.qtd).toBe(1) // Internet (dia 12); fatura no dia 20 fica fora
    expect(c.proximos7.valor).toBe(120)
  })
})

describe('situação por mês', () => {
  it('mês anterior em aberto: tudo atrasado; mês futuro: nada atrasado', () => {
    expect(montar(dados(), '2026-09').filter((i) => !i.pago).every((i) => i.situacao === 'atrasada')).toBe(true)
    expect(montar(dados(), '2026-11').some((i) => i.situacao === 'atrasada')).toBe(false)
  })
})

describe('pagamento em lote só do que é seguro', () => {
  it('conta variável com valor estimado exige conferência e fica fora do lote', () => {
    const d = dados({ fixos: [{ id: 'v1', nome: 'Luz', valor: 200, ativo: true, dia_vencimento: 8, mes_inicio: '2026-01', variavel: true }] })
    const luz = montar(d).find((i) => i.nome === 'Luz')
    expect(luz.estimado).toBe(true)
    expect(podeMarcarEmLote(luz)).toBe(false)
  })
  it('fatura, fixa normal e compra à vista entram no lote; conta já paga não', () => {
    const l = montar(dados())
    expect(l.every((i) => podeMarcarEmLote(i))).toBe(true)
    expect(podeMarcarEmLote({ pago: true, exigeConferencia: false })).toBe(false)
  })
  it('parcela de compra sem cartão sem controle por mês exige conferência', () => {
    const d = dados({ compras: [{ id: 'p', data_compra: '2026-10-03', descricao: 'Sofá', categoria: 'Casa', subcategoria: 'Outros', valor_total: 900, parcelas: 3, cartao_id: null, pago: false }] })
    const sofa = montar(d).find((i) => i.tipo === 'compra')
    expect(sofa.origem).toMatch(/Parcela/)
  })
})
