import { describe, it, expect } from 'vitest'
import {
  parteTotal, parcelasDaParte, esperadoDoMes, repassesDoMes, resumoRepasses, saldoPorPessoa,
  comprasLiquidas, fixosLiquidos, parteDosOutrosNoMes,
} from '../divisoes'
import { resumoDoMes, sobraAnterior } from '../financeiro'
import { montarFoto, validarFechamento } from '../fechamento'
import { gastosPorCategoria } from '../utils'

const nubank = { id: 'c1', nome: 'Nubank', fechamento: 10, vencimento: 17 }
const base = (extra = {}) => ({
  fixos: [], fixosPagamentos: [], cartoes: [nubank], compras: [], faturas: [], rendas: [], saldoAjustes: [],
  comprasPagamentos: [], comprasPagamentosOk: true, fechamentos: [], eventos: [], orcamentos: [],
  divisoes: [], divisoesRepasses: [], ...extra,
})
const renda = (mes, giovanna) => ({ mes, giovanna, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 })
const fixo = (o) => ({ id: 'f1', nome: 'Convênio', valor: 1000, dia_vencimento: 5, ativo: true, categoria: 'Saúde', ...o })
const compra = (o) => ({ id: 'k1', descricao: 'Presente', parcelas: 1, cartao_id: null, pago: false, pessoa: 'Gi', categoria: 'Diversos', data_compra: '2026-10-10', valor_total: 300, ...o })
const divisao = (o) => ({ id: 'd1', tipo: 'compra', ref_id: 'k1', pessoa: 'Mãe', modo: 'valor', valor: 100, ...o })
const repasse = (o) => ({ divisao_id: 'd1', mes: '2026-10', valor_recebido: 100, recebido_em: '2026-10-20', ...o })

describe('parteTotal', () => {
  it('valor em reais, limitado ao valor do item', () => {
    expect(parteTotal({ modo: 'valor', valor: 100 }, 300)).toBe(100)
    expect(parteTotal({ modo: 'valor', valor: 999 }, 300)).toBe(300)
  })
  it('percentual de 0 a 100', () => {
    expect(parteTotal({ modo: 'percentual', valor: 50 }, 300)).toBe(150)
    expect(parteTotal({ modo: 'percentual', valor: 250 }, 300)).toBe(300)
    expect(parteTotal({ modo: 'percentual', valor: 33.33 }, 100)).toBe(33.33)
  })
  it('valor inválido vira zero', () => {
    expect(parteTotal({ modo: 'valor', valor: 'abc' }, 300)).toBe(0)
    expect(parteTotal({ modo: 'valor', valor: -5 }, 300)).toBe(0)
  })
})

describe('parcelasDaParte', () => {
  it('compra parcelada: a parte é proporcional e a última parcela fecha a conta', () => {
    const c = compra({ valor_total: 100, parcelas: 3, data_compra: '2026-10-10' })
    const ps = parcelasDaParte(c, divisao({ valor: 50 }), [])
    expect(ps.map((p) => p.mes)).toEqual(['2026-10', '2026-11', '2026-12'])
    expect(ps.reduce((s, p) => s + p.esperado, 0)).toBeCloseTo(50, 2)
    expect(ps[0].esperado).toBeCloseTo(16.67, 2)
  })
})

describe('esperadoDoMes e repasses', () => {
  const d = base({ compras: [compra()], divisoes: [divisao()], fixos: [fixo()] })
  it('compra à vista cai só no mês dela', () => {
    expect(esperadoDoMes(d, d.divisoes[0], '2026-10')).toBe(100)
    expect(esperadoDoMes(d, d.divisoes[0], '2026-11')).toBe(0)
  })
  it('conta fixa vale todo mês ativo (percentual)', () => {
    const dv = divisao({ id: 'd2', tipo: 'fixo', ref_id: 'f1', modo: 'percentual', valor: 40 })
    const d2 = base({ fixos: [fixo({ mes_inicio: '2026-09' })], divisoes: [dv] })
    expect(esperadoDoMes(d2, dv, '2026-10')).toBe(400)
    expect(esperadoDoMes(d2, dv, '2026-08')).toBe(0)
  })
  it('item removido some das linhas do mês', () => {
    expect(repassesDoMes(base({ divisoes: [divisao()] }), '2026-10')).toEqual([])
  })
  it('a receber x recebido', () => {
    const r1 = resumoRepasses(d, '2026-10')
    expect(r1.aReceber).toBe(100)
    expect(r1.recebido).toBe(0)
    const r2 = resumoRepasses({ ...d, divisoesRepasses: [repasse({ valor_recebido: 80 })] }, '2026-10')
    expect(r2.aReceber).toBe(0)
    expect(r2.recebido).toBe(80)
  })
  it('saldo por pessoa soma só o que falta receber', () => {
    const dd = { ...d, divisoesRepasses: [] }
    expect(saldoPorPessoa(dd, ['2026-09', '2026-10', '2026-11'])).toEqual({ Mãe: 100 })
    expect(saldoPorPessoa({ ...dd, divisoesRepasses: [repasse()] }, ['2026-10'])).toEqual({})
  })
})

describe('valores líquidos (teto e categorias)', () => {
  it('sem divisões devolve a mesma lista', () => {
    const d = base({ compras: [compra()], fixos: [fixo()] })
    expect(comprasLiquidas(d)).toBe(d.compras)
    expect(fixosLiquidos(d)).toBe(d.fixos)
  })
  it('categoria conta só a sua parte', () => {
    const d = base({
      compras: [compra()], fixos: [fixo()],
      divisoes: [divisao(), divisao({ id: 'd2', tipo: 'fixo', ref_id: 'f1', valor: 250 })],
    })
    const mapa = gastosPorCategoria(comprasLiquidas(d), d.cartoes, fixosLiquidos(d), '2026-10')
    expect(mapa.Diversos.total).toBe(200)
    expect(mapa['Saúde'].total).toBe(750)
  })
  it('duas pessoas na mesma compra nunca passam do valor', () => {
    const d = base({ compras: [compra()], divisoes: [divisao({ valor: 200 }), divisao({ id: 'd2', pessoa: 'Pai', valor: 200 })] })
    expect(comprasLiquidas(d)[0].valor_total).toBe(0)
  })
  it('parte dos outros no mês', () => {
    expect(parteDosOutrosNoMes(base({ compras: [compra()], divisoes: [divisao()] }), '2026-10')).toBe(100)
  })
})

describe('motor: só o recebido entra na receita', () => {
  const d0 = base({ rendas: [renda('2026-10', 5000)], compras: [compra()], divisoes: [divisao()] })
  it('a receber não muda a sobra; a fatura/conta continua cheia', () => {
    const r = resumoDoMes(d0, '2026-10', { usarSaldoAnterior: false })
    expect(r.comprometido).toBe(300)
    expect(r.renda).toBe(5000)
    expect(r.sobraDoMes).toBe(4700)
  })
  it('recebido vira receita do mês', () => {
    const r = resumoDoMes({ ...d0, divisoesRepasses: [repasse()] }, '2026-10', { usarSaldoAnterior: false })
    expect(r.renda).toBe(5100)
    expect(r.rendaSalario).toBe(5000)
    expect(r.repasses).toBe(100)
    expect(r.sobraDoMes).toBe(4800)
  })
  it('o recebido também passa para o saldo do mês seguinte', () => {
    const d = { ...d0, divisoesRepasses: [repasse()] }
    expect(sobraAnterior(d, '2026-11')).toBe(4800)
  })
})

describe('fechamento com divisões', () => {
  const d = base({
    rendas: [renda('2026-10', 5000)], compras: [compra()], fixos: [fixo()],
    divisoes: [divisao(), divisao({ id: 'd2', tipo: 'fixo', ref_id: 'f1', valor: 250 })],
    divisoesRepasses: [repasse()],
  })
  it('a soma das categorias continua batendo com as despesas', () => {
    const f = montarFoto(d, '2026-10')
    const soma = Object.values(f.por_categoria).reduce((s, v) => s + v, 0)
    expect(f.despesas).toBe(1300)
    expect(Math.round(soma * 100) / 100).toBe(1300)
    expect(f.por_categoria['Parte de outras pessoas']).toBe(350)
    expect(f.por_categoria['Diversos']).toBe(200)
    expect(f.renda).toBe(5100)
  })
  it('avisa quando ainda falta receber', () => {
    const v = validarFechamento(d, '2026-10')
    expect(v.alertas.some((a) => /falta receber R\$ 250,00/.test(a))).toBe(true)
  })
  it('só repasse, sem renda cadastrada, continua bloqueando o fechamento', () => {
    const sem = { ...d, rendas: [] }
    expect(validarFechamento(sem, '2026-10').bloqueantes.some((b) => /não tem renda/.test(b))).toBe(true)
  })
})
