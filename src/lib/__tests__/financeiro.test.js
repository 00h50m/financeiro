import { describe, it, expect } from 'vitest'
import {
  rendaDoMes, valorFatura, detalhePagamentos, sobraAnterior, resumoDoMes, parcelaPaga, parcelasPagas, lancadoDoCartao,
} from '../financeiro'
import { calcMesInicio, gerarParcelas, gastosPorCategoria, limiteUsado, addMonths } from '../utils'

const nubank = { id: 'c1', nome: 'Nubank', fechamento: 10, vencimento: 17 }
const base = (extra = {}) => ({
  fixos: [], fixosPagamentos: [], cartoes: [nubank], compras: [], faturas: [], rendas: [], saldoAjustes: [],
  comprasPagamentos: [], comprasPagamentosOk: true, ...extra,
})
const compra = (o) => ({ id: 'x' + Math.random(), parcelas: 1, cartao_id: null, pago: false, ...o })
const renda = (mes, giovanna) => ({ mes, giovanna, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 })

describe('rendaDoMes', () => {
  const rendas = [renda('2026-08', 5000), renda('2026-10', 6000)]
  it('mês sem renda vale 0 quando não se estima', () => {
    expect(rendaDoMes(rendas, '2026-09')).toEqual({ valor: 0, estimada: false })
  })
  it('mês sem renda repete a última anterior quando se estima', () => {
    expect(rendaDoMes(rendas, '2026-09', { estimar: true })).toEqual({ valor: 5000, estimada: true })
    expect(rendaDoMes(rendas, '2026-12', { estimar: true })).toEqual({ valor: 6000, estimada: true })
  })
  it('mês com renda não é estimado', () => {
    expect(rendaDoMes(rendas, '2026-10', { estimar: true })).toEqual({ valor: 6000, estimada: false })
  })
  it('antes de qualquer renda não inventa valor', () => {
    expect(rendaDoMes(rendas, '2026-01', { estimar: true }).valor).toBe(0)
  })
})

describe('valorFatura', () => {
  it('usa o real só quando foi informado', () => {
    expect(valorFatura({ valor_real: 900 }, 800)).toEqual({ valor: 900, real: true })
    expect(valorFatura({ valor_real: null, pago: true }, 800)).toEqual({ valor: 800, real: false })
    expect(valorFatura(undefined, 800)).toEqual({ valor: 800, real: false })
  })
})

describe('REGRESSÃO 3.1: pagar a fatura não congela a estimativa', () => {
  const compras = [compra({ id: 'a', cartao_id: 'c1', data_compra: '2026-10-05', valor_total: 300 })]
  it('fatura só marcada como paga continua estimada', () => {
    const d = base({ compras, faturas: [{ id: 'f', cartao_id: 'c1', mes: '2026-10', valor_real: null, pago: true }] })
    const linha = detalhePagamentos(d, '2026-10').linhasCartao[0]
    expect(linha.pago).toBe(true)
    expect(linha.temFatura).toBe(false)
    expect(linha.valor).toBe(300)
  })
  it('compra nova no mesmo cartão e mês continua entrando depois de pagar', () => {
    const f = [{ id: 'f', cartao_id: 'c1', mes: '2026-10', valor_real: null, pago: true }]
    const antes = detalhePagamentos(base({ compras, faturas: f }), '2026-10').comprometido
    const mais = [...compras, compra({ id: 'b', cartao_id: 'c1', data_compra: '2026-10-06', valor_total: 100 })]
    const depois = detalhePagamentos(base({ compras: mais, faturas: f }), '2026-10').comprometido
    expect(depois - antes).toBe(100)
  })
  it('valor real informado vale mesmo estando paga', () => {
    const d = base({ compras, faturas: [{ id: 'f', cartao_id: 'c1', mes: '2026-10', valor_real: 950, pago: true }] })
    const linha = detalhePagamentos(d, '2026-10').linhasCartao[0]
    expect(linha.valor).toBe(950)
    expect(linha.temFatura).toBe(true)
  })
  it('marcar conta fixa como paga não mexe em fatura', () => {
    const fixos = [{ id: 'fx', nome: 'Luz', valor: 200, ativo: true }]
    const d = base({ compras, fixos, fixosPagamentos: [{ fixo_id: 'fx', mes: '2026-10', pago: true }] })
    const det = detalhePagamentos(d, '2026-10')
    expect(det.linhasCartao[0].valor).toBe(300)
    expect(det.totalFixosPagos).toBe(200)
    expect(det.pago).toBe(200)
  })
})

describe('REGRESSÃO 3.2: parcelada sem cartão paga por parcela', () => {
  const c = compra({ id: 'p', data_compra: '2026-10-05', valor_total: 1200, parcelas: 6 })
  const reg = (mes, pago = true) => ({ compra_id: 'p', mes, pago })
  it('paga em outubro; novembro e dezembro pendentes', () => {
    const d = base({ compras: [c], comprasPagamentos: [reg('2026-10')] })
    const out = detalhePagamentos(d, '2026-10')
    const nov = detalhePagamentos(d, '2026-11')
    expect(out.outrasContas[0].valorParcela).toBe(200)
    expect(out.pago).toBe(200)
    expect(nov.pago).toBe(0)
    expect(nov.totalDividas).toBe(200)
  })
  it('compra atravessando o ano: janeiro de 2027 é a 4ª parcela', () => {
    const d = base({ compras: [c] })
    const jan = detalhePagamentos(d, '2027-01').outrasContas[0]
    expect(jan.parcelaNum).toBe(4)
  })
  it('desmarcar um mês não afeta os outros', () => {
    const d2 = base({ compras: [c], comprasPagamentos: [reg('2026-10'), reg('2026-11', false)] })
    expect(detalhePagamentos(d2, '2026-10').pago).toBe(200)
    expect(detalhePagamentos(d2, '2026-11').pago).toBe(0)
  })
  it('sem registro: parcelada só conta a primeira parcela como paga (pago na criação)', () => {
    const marcada = { ...c, pago: true }
    const d = base({ compras: [marcada] })
    expect(detalhePagamentos(d, '2026-10').pago).toBe(200)
    expect(detalhePagamentos(d, '2026-11').pago).toBe(0)
  })
  it('à vista com pago = true continua paga sem registro', () => {
    const avista = compra({ id: 'v', data_compra: '2026-10-05', valor_total: 80, pago: true })
    expect(detalhePagamentos(base({ compras: [avista] }), '2026-10').pago).toBe(80)
  })
  it('sem a tabela (migration 14 não rodada): o pago antigo vale para a compra inteira', () => {
    const marcada = { ...c, pago: true }
    const d = base({ compras: [marcada], comprasPagamentosOk: false })
    expect(detalhePagamentos(d, '2026-12').pago).toBe(200)
  })
  it('parcelasPagas conta por parcela', () => {
    const r = parcelasPagas(c, [nubank], [reg('2026-10'), reg('2026-11')], true)
    expect(r).toEqual({ pagas: 2, total: 6 })
  })
  it('parcelaPaga: registro vence o pago da compra', () => {
    const registros = new Map([['p|2026-10', { pago: false }]])
    expect(parcelaPaga({ ...c, pago: true }, '2026-10', '2026-10', registros, true)).toBe(false)
  })
})

describe('sobraAnterior', () => {
  const rendas = [renda('2026-07', 5000), renda('2026-08', 5000), renda('2026-09', 5000)]
  const fixos = [{ id: 'fx', nome: 'Aluguel', valor: 3000, ativo: true }]
  // referência: a definição recursiva original
  const ref = (d, mes) => {
    const ant = addMonths(mes, -1)
    const r = d.rendas.find((x) => x.mes === ant)
    const rendaAnt = r ? Number(r.giovanna) : 0
    if (!(rendaAnt > 0)) return 0
    const ajuste = Number(d.saldoAjustes.find((a) => a.mes === ant)?.ajuste) || 0
    return rendaAnt + ref(d, ant) + ajuste - detalhePagamentos(d, ant).comprometido
  }
  it('mês anterior sem renda não traz sobra', () => {
    expect(sobraAnterior(base({ fixos, rendas }), '2026-11')).toBe(0)
  })
  it('acumula mês a mês e bate com a definição recursiva', () => {
    const d = base({ fixos, rendas, saldoAjustes: [{ mes: '2026-08', ajuste: -150 }] })
    expect(sobraAnterior(d, '2026-10')).toBe(ref(d, '2026-10'))
    expect(sobraAnterior(d, '2026-10')).toBe(2000 + 2000 - 150 + 2000)
  })
  it('um buraco de renda interrompe o encadeamento', () => {
    const d = base({ fixos, rendas: [renda('2026-07', 5000), renda('2026-09', 5000)] })
    expect(sobraAnterior(d, '2026-10')).toBe(2000)
  })
  it('mês negativo gera sobra negativa que passa adiante', () => {
    const d = base({ fixos: [{ id: 'f', nome: 'Grande', valor: 6000, ativo: true }], rendas: [renda('2026-09', 5000)] })
    expect(sobraAnterior(d, '2026-10')).toBe(-1000)
  })
  it('virada dezembro para janeiro', () => {
    const d = base({ fixos, rendas: [renda('2026-12', 5000)] })
    expect(sobraAnterior(d, '2027-01')).toBe(2000)
  })
  it('histórico de conta fixa: mudar o valor só daqui para frente não altera o passado', () => {
    const fx = [
      { id: 'a', nome: 'Net', valor: 100, ativo: true, mes_fim: '2026-08' },
      { id: 'b', nome: 'Net', valor: 150, ativo: true, mes_inicio: '2026-09' },
    ]
    const d = base({ fixos: fx })
    expect(detalhePagamentos(d, '2026-08').totalFixos).toBe(100)
    expect(detalhePagamentos(d, '2026-09').totalFixos).toBe(150)
  })
})

describe('resumoDoMes (definição oficial)', () => {
  const rendas = [renda('2026-09', 5000), renda('2026-10', 6000)]
  const fixos = [{ id: 'fx', nome: 'Luz', valor: 400, ativo: true }]
  const compras = [compra({ id: 'a', cartao_id: 'c1', data_compra: '2026-10-05', valor_total: 600 })]
  const d = base({
    rendas, fixos, compras,
    fixosPagamentos: [{ fixo_id: 'fx', mes: '2026-10', pago: true }],
    saldoAjustes: [{ mes: '2026-10', ajuste: 50 }],
  })
  it('fecha as contas do mês', () => {
    const r = resumoDoMes(d, '2026-10')
    expect(r.renda).toBe(6000)
    expect(r.comprometido).toBe(1000)
    expect(r.pago).toBe(400)
    expect(r.aPagar).toBe(600)
    expect(r.saldoAnterior).toBe(5000 - 400) // setembro: renda 5000 menos a conta fixa de 400
    expect(r.disponivel).toBe(6000 + 4600 - 400 + 50)
    expect(r.sobraProjetada).toBe(r.renda + r.saldoAnterior + r.ajuste - r.comprometido)
    expect(r.sobraDoMes).toBe(5000)
  })
  it('sem saldo anterior a sobra projetada é só renda menos comprometido mais ajuste', () => {
    const r = resumoDoMes(d, '2026-10', { usarSaldoAnterior: false })
    expect(r.saldoAnterior).toBe(0)
    expect(r.sobraProjetada).toBe(6000 - 1000 + 50)
  })
  it('mês sem renda: sobra negativa honesta, sem inventar renda', () => {
    const r = resumoDoMes(base({ fixos }), '2026-10')
    expect(r.renda).toBe(0)
    expect(r.sobraDoMes).toBe(-400)
  })
  it('comprometido do resumo é o mesmo do detalhe (Dashboard = Pagamentos)', () => {
    expect(resumoDoMes(d, '2026-10').comprometido).toBe(detalhePagamentos(d, '2026-10').comprometido)
  })
})

describe('categorias fecham com o total lançado', () => {
  it('fixo sem categoria entra em "Sem categoria"', () => {
    const fixos = [{ id: 'f', nome: 'X', valor: 100, ativo: true }]
    const compras = [compra({ id: 'a', cartao_id: 'c1', data_compra: '2026-10-05', valor_total: 50, categoria: 'Mercado' })]
    const mapa = gastosPorCategoria(compras, [nubank], fixos, '2026-10')
    const soma = Object.values(mapa).reduce((s, c) => s + c.total, 0)
    expect(soma).toBe(150)
    expect(mapa['Sem categoria'].total).toBe(100)
  })
})

describe('datas e competência', () => {
  it('compra depois do fechamento cai na fatura seguinte; virada de ano', () => {
    expect(calcMesInicio('2026-10-10', nubank)).toBe('2026-10') // no dia do fechamento ainda entra
    expect(calcMesInicio('2026-10-11', nubank)).toBe('2026-11')
    expect(calcMesInicio('2026-12-20', nubank)).toBe('2027-01')
  })
  it('aceita data com hora', () => {
    expect(calcMesInicio('2026-10-11T03:00:00+00:00', nubank)).toBe('2026-11')
  })
  it('sem cartão usa o mês da compra', () => {
    expect(calcMesInicio('2026-10-31', undefined)).toBe('2026-10')
  })
  it('parcelamento atravessando o ano', () => {
    const ps = gerarParcelas({ valor_total: 300, parcelas: 3, data_compra: '2026-12-20', cartao_id: 'c1' }, [nubank])
    expect(ps.map((p) => p.mes)).toEqual(['2027-01', '2027-02', '2027-03'])
  })
  it('lancadoDoCartao soma só o mês pedido', () => {
    const compras = [compra({ id: 'a', cartao_id: 'c1', data_compra: '2026-10-05', valor_total: 300, parcelas: 3 })]
    expect(lancadoDoCartao(compras, [nubank], 'c1', '2026-11')).toBe(100)
    expect(lancadoDoCartao(compras, [nubank], 'c1', '2027-01')).toBe(0)
  })
})

describe('limite do cartão: passado sem registro é "sem informação"', () => {
  it('separa o que não dá para saber', () => {
    const compras = [compra({ id: 'a', cartao_id: 'c1', data_compra: '2026-08-05', valor_total: 200, parcelas: 2 })]
    const r = limiteUsado('c1', compras, [nubank], [], '2026-10')
    expect(r.semInformacao).toBe(200)
    expect(r.usado).toBe(0)
  })
  it('fatura passada registrada e não paga conta como devida', () => {
    const compras = [compra({ id: 'a', cartao_id: 'c1', data_compra: '2026-08-05', valor_total: 200, parcelas: 2 })]
    const faturas = [{ cartao_id: 'c1', mes: '2026-08', pago: false }]
    const r = limiteUsado('c1', compras, [nubank], faturas, '2026-10')
    expect(r.atual).toBe(100)
    expect(r.semInformacao).toBe(100)
  })
})

describe('conta fixa paga no cartão', () => {
  const mes = '2026-10'
  const luz = { id: 'luz', nome: 'Luz', valor: 200, ativo: true }
  const netflix = { id: 'nf', nome: 'Netflix', valor: 55, ativo: true, cartao_id: 'c1' }
  const compraNubank = compra({ data_compra: '2026-10-05', descricao: 'Mercado', valor_total: 300, cartao_id: 'c1' })

  it('sem cartão: segue como conta à parte, como sempre', () => {
    const det = detalhePagamentos(base({ fixos: [luz] }), mes)
    expect(det.fixosLista.map((f) => f.id)).toEqual(['luz'])
    expect(det.totalFixosAvulsos).toBe(200)
    expect(det.comprometido).toBe(200)
  })
  it('no cartão: entra na fatura, sai da lista de contas à parte e o total não conta duas vezes', () => {
    const det = detalhePagamentos(base({ fixos: [luz, netflix], compras: [compraNubank] }), mes)
    expect(det.fixosLista.map((f) => f.id)).toEqual(['luz'])
    expect(det.linhasCartao[0].valor).toBe(355) // 300 de compras + 55 da Netflix
    expect(det.linhasCartao[0].fixosNoCartao).toEqual([{ id: 'nf', nome: 'Netflix', valor: 55 }])
    expect(det.totalFixos).toBe(255) // custo fixo total
    expect(det.totalFixosAvulsos).toBe(200)
    expect(det.comprometido).toBe(200 + 355) // luz + fatura; a Netflix aparece uma vez só
  })
  it('mover um fixo para o cartão não muda o comprometido (fatura ainda estimada)', () => {
    const antes = detalhePagamentos(base({ fixos: [luz, { ...netflix, cartao_id: null }], compras: [compraNubank] }), mes)
    const depois = detalhePagamentos(base({ fixos: [luz, netflix], compras: [compraNubank] }), mes)
    expect(depois.comprometido).toBe(antes.comprometido)
  })
  it('com o valor real da fatura informado, vale o do banco (ele já inclui a cobrança)', () => {
    const faturas = [{ cartao_id: 'c1', mes, valor_real: 360, pago: false }]
    const det = detalhePagamentos(base({ fixos: [netflix], compras: [compraNubank], faturas }), mes)
    expect(det.linhasCartao[0].valor).toBe(360)
    expect(det.comprometido).toBe(360)
  })
  it('cartão sem compras no mês mas com fixo aparece como fatura', () => {
    const det = detalhePagamentos(base({ fixos: [netflix] }), mes)
    expect(det.linhasCartao).toHaveLength(1)
    expect(det.linhasCartao[0].valor).toBe(55)
  })
  it('pagar a fatura paga o fixo junto; o fixo não tem checkbox próprio', () => {
    const faturas = [{ cartao_id: 'c1', mes, pago: true }]
    const det = detalhePagamentos(base({ fixos: [netflix], faturas }), mes)
    expect(det.pago).toBe(55)
    expect(det.totalDividas).toBe(0)
  })
  it('cartão que não existe mais: volta a ser conta à parte', () => {
    const det = detalhePagamentos(base({ fixos: [{ ...netflix, cartao_id: 'sumiu' }] }), mes)
    expect(det.fixosLista).toHaveLength(1)
    expect(det.linhasCartao).toHaveLength(0)
  })
  it('fixo encerrado ou ainda não iniciado no mês não entra na fatura', () => {
    const encerrado = { ...netflix, mes_fim: '2026-09' }
    const futuro = { ...netflix, id: 'nf2', mes_inicio: '2026-12' }
    expect(detalhePagamentos(base({ fixos: [encerrado, futuro] }), mes).linhasCartao).toHaveLength(0)
  })
  it('lancadoDoCartao (tela Faturas) também soma o fixo do cartão', () => {
    expect(lancadoDoCartao([compraNubank], [nubank], 'c1', mes, [netflix])).toBe(355)
    expect(lancadoDoCartao([compraNubank], [nubank], 'c1', mes)).toBe(300) // sem fixos informados: como antes
  })
})
