// CONTRATO DOS INDICADORES (refatoração UX). Congela o que cada número significa e como as telas o leem.
// Se um destes testes quebrar durante a refatoração visual, o que mudou foi um NÚMERO financeiro, não a interface.
import { describe, it, expect } from 'vitest'
import { resumoDoMes, lerUsarSaldoAnterior } from '../financeiro'
import { montarInicio } from '../inicio'

const nubank = { id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 10 }
const renda = (mes, giovanna) => ({ mes, giovanna, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 })
const compra = (o) => ({ parcelas: 1, cartao_id: null, pago: false, ...o })

// Cenário rico: renda nos dois meses, fixo, compra sem cartão (a pagar), compra à vista no cartão, compra parcelada, ajuste de saldo e aulas a receber.
const MES = '2026-10'
const store = (extra = {}) => ({
  cartoes: [nubank], faturas: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: true, adiamentos: [], dividas: [],
  rendas: [renda('2026-09', 5000), renda(MES, 5000)],
  fixos: [{ id: 'f1', nome: 'Aluguel', valor: 1500, ativo: true, dia_vencimento: 5, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Aluguel' }],
  compras: [
    compra({ id: 'a', data_compra: '2026-10-02', descricao: 'Mercado', categoria: 'Alimentação', subcategoria: 'Mercado', valor_total: 300, cartao_id: 'c1' }),
    compra({ id: 'b', data_compra: '2026-10-04', descricao: 'Boleto escola', categoria: 'Educação', subcategoria: 'Outros', valor_total: 700, cartao_id: null }),
    compra({ id: 'c', data_compra: '2026-09-02', descricao: 'TV', categoria: 'Casa', subcategoria: 'Outros', valor_total: 1200, parcelas: 6, cartao_id: 'c1' }),
  ],
  saldoAjustes: [{ mes: MES, ajuste: 100 }],
  aulasAReceber: { [MES]: 200 },
  ...extra,
})

describe('contrato: definições de resumoDoMes (fonte única dos indicadores)', () => {
  const r = resumoDoMes(store(), MES, { usarSaldoAnterior: false })

  it('aPagar = comprometido − pago', () => {
    expect(r.aPagar).toBeCloseTo(r.comprometido - r.pago, 2)
    expect(r.detalhe.totalDividas).toBeCloseTo(r.aPagar, 2) // "Total dívidas (a pagar)" em Pagamentos é o mesmo número que "Falta pagar"
  })
  it('disponivel = renda + saldoAnterior − pago + ajuste − aulasAReceber', () => {
    expect(r.disponivel).toBeCloseTo(r.renda + r.saldoAnterior - r.pago + r.ajuste - r.aulasAReceber, 2)
  })
  it('sobraProjetada = disponivel + aulasAReceber − aPagar = renda + saldoAnterior + ajuste − comprometido', () => {
    expect(r.sobraProjetada).toBeCloseTo(r.disponivel + r.aulasAReceber - r.aPagar, 2)
    expect(r.sobraProjetada).toBeCloseTo(r.renda + r.saldoAnterior + r.ajuste - r.comprometido, 2)
  })
  it('sobraDoMes = renda − comprometido (ignora saldo anterior e ajuste: não é a "sobra projetada")', () => {
    expect(r.sobraDoMes).toBeCloseTo(r.renda - r.comprometido, 2)
    expect(r.sobraProjetada).not.toBeCloseTo(r.sobraDoMes, 2) // com ajuste de 100 os dois divergem de propósito
  })
  it('valores do cenário (congelados): renda 5000, ajuste 100, aulas a receber 200', () => {
    expect(r.renda).toBe(5000)
    expect(r.ajuste).toBe(100)
    expect(r.aulasAReceber).toBe(200)
    expect(r.comprometido).toBeGreaterThan(0)
  })
  it('marcar uma conta como paga move dinheiro de "a pagar" para "pago", sem mudar a sobra projetada', () => {
    const antes = resumoDoMes(store(), MES, { usarSaldoAnterior: false })
    const depois = resumoDoMes(store({ compras: store().compras.map((c) => (c.id === 'b' ? { ...c, pago: true, data_pagamento: '2026-10-06' } : c)) }), MES, { usarSaldoAnterior: false })
    expect(depois.pago).toBeCloseTo(antes.pago + 700, 2)
    expect(depois.aPagar).toBeCloseTo(antes.aPagar - 700, 2)
    expect(depois.comprometido).toBeCloseTo(antes.comprometido, 2)
    expect(depois.sobraProjetada).toBeCloseTo(antes.sobraProjetada, 2) // pagar não cria nem some com dinheiro projetado
    expect(depois.disponivel).toBeCloseTo(antes.disponivel - 700, 2) // mas o dinheiro que existe agora diminui
  })
})

describe('contrato: o que cada tela lê', () => {
  // Início e Dashboard leem a opção "usar a sobra do mês anterior" (padrão: ligada); o contrato vale com a mesma opção dos dois lados.
  const r = resumoDoMes(store(), MES, { usarSaldoAnterior: lerUsarSaldoAnterior() })
  const ini = montarInicio(store(), MES, '2026-10-10')

  it('Início "Pode gastar" = sobraProjetada; "Comprometido", "Pago" e "A pagar" iguais aos do resumo', () => {
    expect(ini.podeGastar).toBeCloseTo(r.sobraProjetada, 2)
    expect(ini.comprometido).toBeCloseTo(r.comprometido, 2)
    expect(ini.pago).toBeCloseTo(r.pago, 2)
    expect(ini.aPagar).toBeCloseTo(r.aPagar, 2)
    expect(ini.entrada).toBeCloseTo(r.renda, 2)
  })
  it('as contas abertas do Início somam o "a pagar" (nenhuma conta some da lista)', () => {
    const soma = ini.abertas.reduce((t, c) => t + Number(c.valor), 0)
    expect(soma).toBeCloseTo(r.aPagar, 1)
  })
  it('sem renda cadastrada, "Pode gastar" é negativo (hoje o Início mostra o número; o Dashboard mostra "—"): o contrato é o número, a apresentação muda depois', () => {
    const semRenda = montarInicio(store({ rendas: [], saldoAjustes: [], aulasAReceber: {} }), MES, '2026-10-10')
    expect(semRenda.entrada).toBe(0)
    expect(semRenda.podeGastar).toBeCloseTo(-semRenda.comprometido, 2)
  })
})

describe('contrato: a sobra do mês anterior entra no "Pode gastar" por padrão', () => {
  it('com a opção ligada o saldo anterior soma; desligada, não', () => {
    const com = resumoDoMes(store(), MES, { usarSaldoAnterior: true })
    const sem = resumoDoMes(store(), MES, { usarSaldoAnterior: false })
    expect(com.saldoAnterior).toBeGreaterThan(0)
    expect(sem.saldoAnterior).toBe(0)
    expect(com.sobraProjetada).toBeCloseTo(sem.sobraProjetada + com.saldoAnterior, 2)
    expect(com.sobraDoMes).toBeCloseTo(sem.sobraDoMes, 2) // "Resultado do mês" nunca inclui saldo anterior
  })
})
