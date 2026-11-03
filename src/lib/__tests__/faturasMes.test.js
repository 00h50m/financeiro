import { describe, it, expect } from 'vitest'
import { cartoesDoMes, resumoDoMesFaturas, loteDoCartao, estadoConciliacao } from '../faturasMes'

const nubank = { id: 'c1', nome: 'Nubank', titular: 'Gi', fechamento: 3, vencimento: 25 }
const inter = { id: 'c2', nome: 'Inter', titular: 'Gi', fechamento: 20, vencimento: 5 }
const MES = '2026-10'
const HOJE = '2026-10-15'
const compra = (id, cartao, valor, data = '2026-10-02') => ({ id, data_compra: data, descricao: id, categoria: 'X', subcategoria: 'Y', pessoa: 'Gi', cartao_id: cartao, valor_total: valor, parcelas: 1 })
const base = (extra = {}) => ({ cartoes: [nubank, inter], fixos: [], faturas: [], importacoes: [], compras: [compra('a', 'c1', 300), compra('b', 'c2', 500, '2026-10-02')], mes: MES, hoje: HOJE, ...extra })
const lote = (cartao, status, extra = {}) => ({ id: 'L' + cartao, cartao_id: cartao, mes: MES, status_importacao: 'concluida', status_conciliacao: status, concluida_em: '2026-10-10T10:00:00Z', ...extra })

describe('cards de fatura por mês', () => {
  it('um card por cartão com algo lançado; cartão sem movimento não aparece', () => {
    expect(cartoesDoMes(base()).map((l) => l.cartao.nome).sort()).toEqual(['Inter', 'Nubank'])
    expect(cartoesDoMes(base({ compras: [compra('a', 'c1', 300)] })).map((l) => l.cartao.nome)).toEqual(['Nubank'])
  })
  it('sem valor do banco a fatura é estimada e não há diferença para comparar', () => {
    const [l] = cartoesDoMes(base({ compras: [compra('a', 'c1', 300)] }))
    expect(l.estados).toMatchObject({ valor: 'estimada', diferenca: 'sem_real', conciliacao: 'sem_importacao', pagamento: 'a_pagar' })
    expect(l.lancado).toBe(300); expect(l.real).toBeNull(); expect(l.diferenca).toBeNull()
  })
  it('valor real informado: diferença ok, faltam identificar ou excede (tolerância de R$ 1)', () => {
    const f = (v) => cartoesDoMes(base({ compras: [compra('a', 'c1', 300)], faturas: [{ id: 'f1', cartao_id: 'c1', mes: MES, valor_real: v }] }))[0]
    expect(f(300.5).estados.diferenca).toBe('ok')
    expect(f(450).estados.diferenca).toBe('faltam'); expect(f(450).diferenca).toBe(150)
    expect(f(250).estados.diferenca).toBe('excede'); expect(f(250).estados.valor).toBe('real')
  })
  it('os estados coexistem: valor real + divergente + conciliação parcial + paga', () => {
    const [l] = cartoesDoMes(base({ compras: [compra('a', 'c1', 300)], faturas: [{ id: 'f1', cartao_id: 'c1', mes: MES, valor_real: 450, pago: true }], importacoes: [lote('c1', 'parcial')] }))
    expect(l.estados).toEqual({ valor: 'real', diferenca: 'faltam', conciliacao: 'parcial', pagamento: 'paga' })
  })
  it('conciliação vem do lote de importação mais recente do cartão e mês', () => {
    const imp = [lote('c1', 'parcial', { concluida_em: '2026-10-01T00:00:00Z' }), lote('c1', 'conciliada', { concluida_em: '2026-10-12T00:00:00Z' }), lote('c1', 'conciliada', { mes: '2026-09' }), { ...lote('c1', 'conciliada'), status_importacao: 'rascunho', concluida_em: '2026-10-14T00:00:00Z' }]
    expect(loteDoCartao(imp, 'c1', MES).status_conciliacao).toBe('conciliada')
    expect(loteDoCartao(imp, 'c2', MES)).toBeNull()
    expect(estadoConciliacao(lote('c1', 'pendente'))).toBe('importada')
    expect(estadoConciliacao(null)).toBe('sem_importacao')
  })
  it('vencimento: mês atual usa o dia; vencida só se ainda não paga; mês anterior em aberto está vencido', () => {
    const [i] = cartoesDoMes(base({ compras: [compra('b', 'c2', 500, '2026-10-02')] })) // Inter vence dia 5, hoje 15
    expect(i.estados.pagamento).toBe('vencida'); expect(i.vencimento.texto).toMatch(/venceu há 10 dias/)
    const [pago] = cartoesDoMes(base({ compras: [compra('b', 'c2', 500)], faturas: [{ id: 'f', cartao_id: 'c2', mes: MES, pago: true }] }))
    expect(pago.estados.pagamento).toBe('paga')
    const ant = cartoesDoMes(base({ mes: '2026-09', compras: [compra('z', 'c1', 100, '2026-09-02')] }))[0]
    expect(ant.estados.pagamento).toBe('vencida')
    const fut = cartoesDoMes(base({ mes: '2026-11', compras: [{ ...compra('p', 'c1', 100), parcelas: 3 }] }))[0]
    expect(fut.estados.pagamento).toBe('a_pagar')
  })
  it('vencidas vêm primeiro', () => {
    const l = cartoesDoMes(base())
    expect(l[0].cartao.nome).toBe('Inter')
  })
})

describe('resumo do mês das faturas', () => {
  it('soma lançado, banco (só onde foi informado), diferença e contagens', () => {
    const l = cartoesDoMes(base({ faturas: [{ id: 'f1', cartao_id: 'c1', mes: MES, valor_real: 450, pago: true }] }))
    const r = resumoDoMesFaturas(l)
    expect(r).toMatchObject({ cartoes: 2, lancado: 800, banco: 450, bancoQtd: 1, diferenca: 150, pagas: 1, vencidas: 1, divergentes: 1 })
  })
  it('sem nenhum valor do banco, banco e diferença ficam nulos', () => {
    const r = resumoDoMesFaturas(cartoesDoMes(base()))
    expect(r.banco).toBeNull(); expect(r.diferenca).toBeNull(); expect(r.lancado).toBe(800)
  })
})
