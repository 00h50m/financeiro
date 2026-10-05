import { describe, it, expect } from 'vitest'
import { montarFoto, validarFechamento, mesesFechadosTocados, mesFechado, riscosDoMes } from '../fechamento'
import { resumoDoMes, sobraAnterior } from '../financeiro'

const nubank = { id: 'c1', nome: 'Nubank', fechamento: 10, vencimento: 17 }
const base = (extra = {}) => ({
  fixos: [], fixosPagamentos: [], cartoes: [nubank], compras: [], faturas: [], rendas: [], saldoAjustes: [],
  comprasPagamentos: [], comprasPagamentosOk: true, fechamentos: [], fechamentosOk: true, eventos: [], orcamentos: [], ...extra,
})
const renda = (mes, giovanna) => ({ mes, giovanna, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 })
const fixo = (o) => ({ id: 'f1', nome: 'Aluguel', valor: 1000, dia_vencimento: 5, ativo: true, ...o })
const compra = (o) => ({ id: 'k' + Math.random(), parcelas: 1, cartao_id: null, pago: false, pessoa: 'Gi', categoria: 'Mercado', data_compra: '2026-08-10', ...o })
const fech = (mes, saldo_transportado, extra = {}) => ({ mes, status: 'fechado', saldo_transportado, ...extra })

describe('montarFoto', () => {
  it('soma por categoria e por pessoa bate com as despesas', () => {
    const d = base({
      rendas: [renda('2026-08', 5000)],
      fixos: [fixo({ categoria: 'Moradia' })],
      compras: [compra({ valor_total: 200, data_compra: '2026-08-10' }), compra({ valor_total: 100, pessoa: 'Sabi', categoria: 'Lazer' })],
    })
    const f = montarFoto(d, '2026-08')
    const soma = (m) => Object.values(m).reduce((s, v) => s + v, 0)
    expect(f.despesas).toBe(1300)
    expect(Math.round(soma(f.por_categoria) * 100) / 100).toBe(f.despesas)
    expect(Math.round(soma(f.por_pessoa) * 100) / 100).toBe(f.despesas)
    expect(f.sobra).toBe(3700)
  })
  it('saldo transportado = saldo final − reserva destinada', () => {
    const d = base({ rendas: [renda('2026-08', 5000)], fixos: [fixo()] })
    const f = montarFoto(d, '2026-08', { reservaDestinada: 500 })
    expect(f.saldo_final).toBe(4000)
    expect(f.saldo_transportado).toBe(3500)
  })
  it('diferença de fatura vira linha própria e a soma continua fechando', () => {
    const d = base({
      rendas: [renda('2026-08', 5000)],
      compras: [compra({ valor_total: 300, cartao_id: 'c1', data_compra: '2026-07-20' })],
      faturas: [{ cartao_id: 'c1', mes: '2026-08', valor_real: 350, pago: true }],
    })
    const f = montarFoto(d, '2026-08')
    expect(f.despesas).toBe(350)
    expect(f.por_categoria['Diferença entre fatura e lançado']).toBe(50)
  })
})

describe('validarFechamento', () => {
  const dOk = () => base({ rendas: [renda('2026-08', 5000)], fixos: [fixo()] })
  it('bloqueia mês sem renda', () => {
    expect(validarFechamento(base(), '2026-08', { hoje: '2026-10' }).bloqueantes.join()).toMatch(/renda/)
  })
  it('bloqueia mês futuro', () => {
    expect(validarFechamento(dOk(), '2026-12', { hoje: '2026-10' }).bloqueantes.join()).toMatch(/ainda não começou/)
  })
  it('bloqueia mês já fechado', () => {
    const d = { ...dOk(), fechamentos: [fech('2026-08', 0)] }
    expect(validarFechamento(d, '2026-08', { hoje: '2026-10' }).bloqueantes.join()).toMatch(/já está fechado/)
  })
  it('bloqueia fatura sem valor real', () => {
    const d = { ...dOk(), compras: [compra({ valor_total: 100, cartao_id: 'c1', data_compra: '2026-07-20' })] }
    expect(validarFechamento(d, '2026-08', { hoje: '2026-10' }).bloqueantes.join()).toMatch(/sem valor real/)
  })
  it('bloqueia pular mês quando já existem fechamentos antigos', () => {
    const d = { ...dOk(), rendas: [renda('2026-06', 5000), renda('2026-08', 5000)], fechamentos: [fech('2026-06', 0)] }
    expect(validarFechamento(d, '2026-08', { hoje: '2026-10' }).bloqueantes.join()).toMatch(/Jul\/26/)
  })
  it('mês limpo sem pendências não tem bloqueio; conta fixa sem pagar vira alerta', () => {
    const v = validarFechamento(dOk(), '2026-08', { hoje: '2026-10' })
    expect(v.bloqueantes).toEqual([])
    expect(v.alertas.join()).toMatch(/conta fixa/)
  })
  it('mês corrente gera alerta de não terminado', () => {
    expect(validarFechamento(dOk(), '2026-10', { hoje: '2026-10' }).alertas.join()).toMatch(/ainda não terminou/)
  })
})

describe('sobraAnterior com fechamento', () => {
  it('usa o saldo transportado do mês fechado, não a conta ao vivo', () => {
    const d = base({
      rendas: [renda('2026-07', 5000), renda('2026-08', 5000)], fixos: [fixo()],
      fechamentos: [fech('2026-07', 1234)],
    })
    // agosto: base 1234; mês de setembro = 5000 + 1234 − 1000 = 5234
    expect(sobraAnterior(d, '2026-08')).toBe(1234)
    expect(sobraAnterior(d, '2026-09')).toBe(5000 + 1234 - 1000)
  })
  it('mês reaberto volta a ser calculado ao vivo', () => {
    const d = base({
      rendas: [renda('2026-07', 5000), renda('2026-08', 5000)], fixos: [fixo()],
      fechamentos: [{ ...fech('2026-07', 1234), status: 'aberto' }],
    })
    expect(sobraAnterior(d, '2026-08')).toBe(4000)
  })
  it('virada de dezembro para janeiro', () => {
    const d = base({ rendas: [renda('2026-12', 3000)], fixos: [fixo()], fechamentos: [fech('2026-12', 777)] })
    expect(sobraAnterior(d, '2027-01')).toBe(777)
  })
  it('fechar não altera o resumo do mês fechado', () => {
    const d = base({ rendas: [renda('2026-08', 5000)], fixos: [fixo()] })
    const antes = resumoDoMes(d, '2026-08')
    const depois = resumoDoMes({ ...d, fechamentos: [fech('2026-08', 4000)] }, '2026-08')
    expect(depois.sobraDoMes).toBe(antes.sobraDoMes)
  })
})

describe('mesesFechadosTocados', () => {
  it('detecta compra com parcela em mês fechado', () => {
    const c = compra({ valor_total: 300, parcelas: 3, cartao_id: null, data_compra: '2026-08-10' })
    const fs = [fech('2026-09', 0)]
    expect(mesesFechadosTocados([c], [nubank], fs)).toEqual(['2026-09'])
    expect(mesesFechadosTocados([c], [nubank], [])).toEqual([])
    expect(mesFechado(fs, '2026-09')).toBe(true)
  })
})

describe('riscosDoMes', () => {
  it('avisa conta fixa vencida sem pagar no mês corrente', () => {
    const d = base({ rendas: [renda('2026-10', 5000)], fixos: [fixo({ dia_vencimento: 3 })] })
    const r = riscosDoMes(d, '2026-10', { hoje: '2026-10', diaHoje: 10 })
    expect(r.some((x) => /já venceu/.test(x.texto))).toBe(true)
  })
  it('avisa vermelho e renda ausente', () => {
    const d = base({ rendas: [renda('2026-10', 500)], fixos: [fixo()] })
    expect(riscosDoMes(d, '2026-10', { hoje: '2026-10', diaHoje: 1 }).some((x) => x.nivel === 'alto')).toBe(true)
    expect(riscosDoMes(base(), '2026-10', { hoje: '2026-10', diaHoje: 1 }).some((x) => /renda/.test(x.texto))).toBe(true)
  })
})
