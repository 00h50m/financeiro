import { describe, it, expect } from 'vitest'
import {
  parteTotal, parcelasDaParte, esperadoDoMes, repassesDoMes, resumoRepasses, saldoPorPessoa,
  comprasLiquidas, fixosLiquidos, parteDosOutrosNoMes, parcelaDoMes, parcelasDaDivisao, parteDaCompra, somaPassaDoValor,
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

describe('compra parcelada dividida', () => {
  const c = compra({ valor_total: 400, parcelas: 4, data_compra: '2026-10-05', cartao_id: null })
  it('100% da pessoa: cada parcela é toda dela', () => {
    const dv = divisao({ modo: 'percentual', valor: 100 })
    const ps = parcelasDaParte(c, dv, [])
    expect(ps.map((p) => p.esperado)).toEqual([100, 100, 100, 100])
  })
  it('"R$ 30 por parcela" = total 120 (30 × 4): cada parcela dela é 30', () => {
    const ps = parcelasDaParte(c, divisao({ modo: 'valor', valor: 30 * 4 }), [])
    expect(ps.map((p) => p.esperado)).toEqual([30, 30, 30, 30])
  })
  it('a parcela do mês é informada nas linhas de repasse (3/4 em dezembro)', () => {
    const d = base({ compras: [c], divisoes: [divisao({ modo: 'percentual', valor: 50 })] })
    expect(parcelaDoMes(d, d.divisoes[0], '2026-12')).toEqual({ num: 3, total: 4 })
    expect(repassesDoMes(d, '2026-12')[0].parcela).toEqual({ num: 3, total: 4 })
    expect(parcelaDoMes(d, d.divisoes[0], '2027-03')).toBeNull()
  })
  it('compra à vista e conta fixa não têm parcela', () => {
    const d = base({ compras: [compra()], divisoes: [divisao()] })
    expect(parcelaDoMes(d, d.divisoes[0], '2026-10')).toBeNull()
  })
})

describe('divisão de só algumas parcelas (parcela_de / parcela_ate)', () => {
  const c = compra({ valor_total: 600, parcelas: 6, data_compra: '2026-10-05', cartao_id: null })
  it('intervalo padrão: todas as parcelas', () => {
    expect(parcelasDaDivisao({}, 6)).toEqual({ de: 1, ate: 6, todas: true, qtd: 6 })
    expect(parcelasDaDivisao({ parcela_de: 4 }, 6)).toEqual({ de: 4, ate: 6, todas: false, qtd: 3 })
    expect(parcelasDaDivisao({ parcela_de: 2, parcela_ate: 99 }, 6).ate).toBe(6)
  })
  it('da parcela 4 em diante, 100%: ela paga 4, 5 e 6; as primeiras ficam com você', () => {
    const ps = parcelasDaParte(c, divisao({ modo: 'percentual', valor: 100, parcela_de: 4 }), [])
    expect(ps.map((p) => p.esperado)).toEqual([0, 0, 0, 100, 100, 100])
    expect(parteDaCompra(c, divisao({ modo: 'percentual', valor: 100, parcela_de: 4 }), [])).toBe(300)
  })
  it('R$ 60 no total só nas parcelas 2 a 3: 30 em cada, fechando a conta', () => {
    const ps = parcelasDaParte(c, divisao({ modo: 'valor', valor: 60, parcela_de: 2, parcela_ate: 3 }), [])
    expect(ps.map((p) => p.esperado)).toEqual([0, 30, 30, 0, 0, 0])
  })
  it('50% só das 3 primeiras parcelas', () => {
    const ps = parcelasDaParte(c, divisao({ modo: 'percentual', valor: 50, parcela_ate: 3 }), [])
    expect(ps.map((p) => p.esperado)).toEqual([50, 50, 50, 0, 0, 0])
  })
  it('o esperado do mês e a parcela do mês seguem o intervalo', () => {
    const dv = divisao({ modo: 'percentual', valor: 100, parcela_de: 4 })
    const d = base({ compras: [c], divisoes: [dv] })
    expect(esperadoDoMes(d, dv, '2026-11')).toBe(0)
    expect(esperadoDoMes(d, dv, '2027-01')).toBe(100)
    expect(repassesDoMes(d, '2026-11')).toHaveLength(0)
    expect(repassesDoMes(d, '2027-01')[0].parcela).toEqual({ num: 4, total: 6 })
  })
  it('teto/categorias: o valor líquido por mês só cai nas parcelas dela (total líquido correto)', () => {
    const dv = divisao({ modo: 'percentual', valor: 100, parcela_de: 4 })
    const d = base({ compras: [c], divisoes: [dv] })
    const [liq] = comprasLiquidas(d)
    expect(liq.valor_total).toBe(300)
    expect(liq._valoresParcelas).toEqual([100, 100, 100, 0, 0, 0])
    const gastosPorMes = gerarParcelasMes(liq)
    expect(gastosPorMes).toEqual({ '2026-10': 100, '2026-11': 100, '2026-12': 100, '2027-01': 0, '2027-02': 0, '2027-03': 0 })
  })
  it('sem intervalo, comprasLiquidas continua igual a antes (sem _valoresParcelas)', () => {
    const d = base({ compras: [c], divisoes: [divisao({ modo: 'percentual', valor: 50 })] })
    const [liq] = comprasLiquidas(d)
    expect(liq.valor_total).toBe(300)
    expect(liq._valoresParcelas).toBeUndefined()
  })
  it('duas divisões parciais na mesma compra somam sem passar do valor da parcela', () => {
    const d = base({ compras: [c], divisoes: [divisao({ id: 'a', modo: 'percentual', valor: 70, parcela_de: 4 }), divisao({ id: 'b', pessoa: 'Pai', modo: 'percentual', valor: 70, parcela_de: 4 })] })
    expect(comprasLiquidas(d)[0]._valoresParcelas).toEqual([100, 100, 100, 0, 0, 0])
  })
})

import { gerarParcelas } from '../utils'
const gerarParcelasMes = (c) => Object.fromEntries(gerarParcelas(c, []).map((p) => [p.mes, p.valor]))

describe('saldo por pessoa de conta fixa (não soma meses que não eram devidos)', () => {
  const dv = divisao({ id: 'dx', tipo: 'fixo', ref_id: 'f1', pessoa: 'Rose', modo: 'valor', valor: 470, criada_em: '2026-09-15T10:00:00Z' })
  const d = base({ fixos: [fixo({ valor: 1000, mes_inicio: '2025-01' })], divisoes: [dv] })
  const meses = Array.from({ length: 37 }, (_, i) => { const t = 2025 * 12 + 10 - 1 + i; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }) // 2025-11 .. 2028-11
  it('conta do mês em que a divisão foi criada até o mês atual: set, out e nov = 3 × 470', () => {
    expect(saldoPorPessoa(d, meses, '2026-11')).toEqual({ Rose: 1410 })
  })
  it('o que já foi recebido sai da conta', () => {
    const dd = { ...d, divisoesRepasses: [{ divisao_id: 'dx', mes: '2026-10', valor_recebido: 470, recebido_em: '2026-10-10' }] }
    expect(saldoPorPessoa(dd, meses, '2026-11')).toEqual({ Rose: 940 })
  })
  it('divisão de compra continua somando todas as parcelas em aberto (inclusive as futuras)', () => {
    const c = compra({ valor_total: 300, parcelas: 3, data_compra: '2026-11-05', cartao_id: null })
    const dc = base({ compras: [c], divisoes: [divisao({ modo: 'percentual', valor: 100 })] })
    expect(saldoPorPessoa(dc, meses, '2026-11')).toEqual({ Mãe: 300 })
  })
})

describe('somaPassaDoValor (editar divisão)', () => {
  const c = compra({ valor_total: 300, parcelas: 3, cartao_id: null })
  const d = base({ compras: [c] })
  it('compra: soma das partes dentro do valor não passa; acima, passa', () => {
    const outra = divisao({ id: 'o', modo: 'percentual', valor: 60 })
    expect(somaPassaDoValor(d, c, [outra], divisao({ id: 'n', pessoa: 'Pai', modo: 'percentual', valor: 40 }))).toBe(false)
    expect(somaPassaDoValor(d, c, [outra], divisao({ id: 'n', pessoa: 'Pai', modo: 'percentual', valor: 50 }))).toBe(true)
  })
  it('parcelas diferentes não se somam: 100% das parcelas 1-2 e 100% da 3 cabem', () => {
    const a = divisao({ id: 'a', modo: 'percentual', valor: 100, parcela_ate: 2 })
    expect(somaPassaDoValor(d, c, [a], divisao({ id: 'n', pessoa: 'Pai', modo: 'percentual', valor: 100, parcela_de: 3 }))).toBe(false)
  })
  it('conta fixa: soma mensal das partes', () => {
    const f = fixo({ valor: 1000 })
    const a = divisao({ id: 'a', tipo: 'fixo', ref_id: 'f1', modo: 'valor', valor: 600 })
    expect(somaPassaDoValor(base({ fixos: [f] }), f, [a], { ...a, id: 'n', valor: 400 })).toBe(false)
    expect(somaPassaDoValor(base({ fixos: [f] }), f, [a], { ...a, id: 'n', valor: 500 })).toBe(true)
  })
})
