import { describe, it, expect } from 'vitest'
import { simularPlano, resumoDividas, compararEstrategias } from '../dividas.js'

const d = (id, saldo, parcela, juros, extra = {}) => ({ id, nome: id, saldo, parcela, juros_mes: juros, ativa: true, ...extra })

describe('plano de dívidas', () => {
  it('uma dívida sem juros quita em saldo / orçamento meses', () => {
    const r = simularPlano([d('a', 1000, 100, 0)], { orcamento: 250, inicio: '2026-11' })
    expect(r.livreEm).toBe(3) // 250 × 4 meses = 1000 -> índice 3
    expect(r.livreMes).toBe('2027-02')
    expect(r.jurosTotal).toBe(0)
    expect(r.pagoTotal).toBe(1000)
  })
  it('avalanche gasta menos juros que bola de neve quando a maior dívida tem juros maiores', () => {
    const ds = [d('cartao', 5000, 150, 6), d('boleto', 800, 50, 1)]
    const c = compararEstrategias(ds, { orcamento: 800, inicio: '2026-11' })
    expect(c.avalanche.livreEm).not.toBeNull()
    expect(c.bola.livreEm).not.toBeNull()
    expect(c.avalanche.jurosTotal).toBeLessThan(c.bola.jurosTotal)
    expect(c.avalanche.ordemQuitacao[0].nome).toBe('cartao') // o extra vai para os juros mais altos
    expect(c.bola.ordemQuitacao[0].nome).toBe('boleto') // o extra vai para o menor saldo
  })
  it('bola de neve quita primeiro a de menor saldo', () => {
    const ds = [d('grande', 3000, 0, 2), d('pequena', 300, 0, 0.5)]
    const r = simularPlano(ds, { estrategia: 'bola', orcamento: 400, inicio: '2026-11' })
    expect(r.ordemQuitacao[0].nome).toBe('pequena')
  })
  it('a parcela de uma dívida quitada é redirecionada para a próxima (efeito bola de neve)', () => {
    const ds = [d('a', 200, 100, 0), d('b', 1000, 100, 0)]
    const r = simularPlano(ds, { estrategia: 'bola', orcamento: 200, inicio: '2026-11' })
    // a quita no mês 0 (200), depois todo o orçamento vai para b: 1000 − 100 (mês 0) = 900 → 5 meses (200 cada) a partir do mês 1
    expect(r.ordemQuitacao.map((x) => x.nome)).toEqual(['a', 'b'])
    expect(r.livreEm).toBe(5)
  })
  it('orçamento por mês (sazonal): meses com zero atrasam a quitação', () => {
    const r = simularPlano([d('a', 600, 0, 0)], { orcamento: [300, 0, 0, 300], inicio: '2026-11' })
    expect(r.livreEm).toBe(3)
  })
  it('avisa os meses em que o orçamento não cobre os mínimos', () => {
    const r = simularPlano([d('a', 5000, 400, 1), d('b', 5000, 400, 1)], { orcamento: 500, inicio: '2026-11', meses: 3 })
    expect(r.faltas[0]).toMatchObject({ mes: 0, falta: 300 })
  })
  it('juros maiores que o pagamento: não quita no prazo', () => {
    const r = simularPlano([d('a', 10000, 50, 10)], { orcamento: 50, inicio: '2026-11' })
    expect(r.livreEm).toBeNull()
    expect(r.naoQuitam[0].nome).toBe('a')
    expect(r.naoQuitam[0].saldo).toBeGreaterThan(10000)
  })
  it('só o mínimo vira a referência de economia', () => {
    const c = compararEstrategias([d('a', 2000, 100, 3)], { orcamento: 400, inicio: '2026-11' })
    expect(c.minimos.livreEm).not.toBeNull()
    expect(c.avalanche.economia).toBeGreaterThan(0)
  })
  it('resumo soma saldo, mínimos e juros do mês; ignora inativas e zeradas', () => {
    const r = resumoDividas([d('a', 1000, 100, 2, { atrasada: true }), d('b', 500, 50, 0), d('c', 0, 10, 5), d('x', 900, 90, 1, { ativa: false })])
    expect(r).toEqual({ qtd: 2, total: 1500, minimos: 150, jurosMes: 20, atrasadas: 1 })
  })
  it('sem dívidas, já está livre', () => {
    expect(simularPlano([], { orcamento: 100, inicio: '2026-11' }).livreEm).toBe(0)
  })
})

import { atrasadasDoApp } from '../dividasApp.js'
import { resumoDoPlano } from '../dividasResumo.js'
import { montarResumoMensal, textoDoResumo } from '../resumoMensal.js'

const dados = (extra = {}) => ({
  cartoes: [], faturas: [], saldoAjustes: [], comprasPagamentos: [], comprasPagamentosOk: true, compras: [], fixosPagamentos: [], rendaSazonal: [], inicioApp: '2026-09',
  fixos: [{ id: 'f1', nome: 'Aluguel', valor: 1000, ativo: true, dia_vencimento: 5, categoria: 'Casa', subcategoria: 'Aluguel' }],
  rendas: [{ mes: '2026-09', giovanna: 4000 }, { mes: '2026-10', giovanna: 4000 }, { mes: '2026-11', giovanna: 4000 }], fechamentos: [], dividas: [], ...extra,
})

describe('plano de dívidas v2', () => {
  it('conta de mês passado sem pagar vira candidata; paga ou já importada não', () => {
    const d = dados()
    expect(atrasadasDoApp(d, '2026-10-15').map((a) => a.origem)).toEqual(['fixo|f1|2026-09'])
    expect(atrasadasDoApp({ ...d, fixosPagamentos: [{ fixo_id: 'f1', mes: '2026-09', pago: true }] }, '2026-10-15')).toEqual([])
    expect(atrasadasDoApp(d, '2026-10-15', [{ origem: 'fixo|f1|2026-09' }])).toEqual([])
  })
  it('mês atual e futuro não entram como atrasados', () => {
    expect(atrasadasDoApp({ ...dados(), inicioApp: '2026-10' }, '2026-10-15')).toEqual([])
  })
  it('resumo do plano: total, progresso, próxima a quitar e mês livre', () => {
    const r = resumoDoPlano(dados({ dividas: [{ id: 'a', nome: 'Boleto', saldo: 300, saldo_inicial: 500, parcela: 0, juros_mes: 0, ativa: true }] }), '2026-10-15')
    expect(r).toMatchObject({ total: 300, pago: 200, pctPago: 40, proxima: { nome: 'Boleto' } })
    expect(r.livreMes).toBeTruthy()
    expect(resumoDoPlano(dados(), '2026-10-15')).toBeNull()
  })
  it('resumo mensal (Telegram) ganha a linha de dívidas', () => {
    const d = dados({ dividas: [{ id: 'a', nome: 'Cartão', saldo: 900, saldo_inicial: 900, parcela: 100, juros_mes: 2, ativa: true, atrasada: true }], compras: [] })
    const t = textoDoResumo(montarResumoMensal(d, '2026-10', '2026-10-31'))
    expect(t).toContain('Dívidas: 1 dívida')
  })
})

import { detalhePagamentos } from '../financeiro.js'
describe('conta que virou dívida sai do mês', () => {
  const base = () => dados({
    inicioApp: '2026-10', cartoes: [{ id: 'k', nome: 'Nubank', ativo: true }],
    compras: [{ id: 'c1', descricao: 'Boleto TV', valor_total: 900, parcelas: 3, data_compra: '2026-10-05', categoria: 'Casa', subcategoria: 'Outros', cartao_id: null, pessoa: 'G' }],
    faturas: [{ id: 'fa', cartao_id: 'k', mes: '2026-10', valor_real: 2000, pago: false }],
  })
  it('conta fixa, parcela de boleto e fatura saem do comprometido quando existe dívida com a origem', () => {
    const d = base()
    const antes = detalhePagamentos(d, '2026-10').comprometido
    expect(antes).toBe(1000 + 300 + 2000)
    const dd = { ...d, dividas: [{ origem: 'fixo|f1|2026-10' }, { origem: 'compra|c1|2026-10' }, { origem: 'fatura|k|2026-10' }] }
    const det = detalhePagamentos(dd, '2026-10')
    expect(det.fixosLista).toHaveLength(0)
    expect(det.outrasContas).toHaveLength(0)
    expect(det.linhasCartao).toHaveLength(0)
    expect(det.comprometido).toBe(0)
  })
  it('só some o mês indicado: a parcela do mês seguinte continua', () => {
    const dd = { ...base(), dividas: [{ origem: 'compra|c1|2026-10' }] }
    expect(detalhePagamentos(dd, '2026-11').outrasContas).toHaveLength(1)
    expect(detalhePagamentos(dd, '2026-11').fixosLista).toHaveLength(1)
  })
  it('dívida sem origem (cadastrada à mão) não mexe nos meses', () => {
    const dd = { ...base(), dividas: [{ nome: 'Cartão', origem: null }] }
    expect(detalhePagamentos(dd, '2026-10').comprometido).toBe(3300)
  })
  it('a dívida quitada continua tirando a conta do mês (ela foi paga pelo plano)', () => {
    const dd = { ...base(), dividas: [{ origem: 'fixo|f1|2026-10', ativa: false, saldo: 0 }] }
    expect(detalhePagamentos(dd, '2026-10').fixosLista).toHaveLength(0)
  })
})
