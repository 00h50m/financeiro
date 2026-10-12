import { describe, it, expect, afterEach } from 'vitest'
import { resumoParaNinho } from '../resumoNinho.js'
import handler from '../../resumo-ninho.js'
import { criarFakeDb } from './fakes.js'

const base = (extra = {}) => ({
  compras: [], cartoes: [], fixosValores: [], faturas: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: false, saldoAjustes: [], pessoas: [],
  rendas: [{ mes: '2026-10', giovanna: 3000, sabrina: 2000 }],
  fixos: [
    { id: 'f1', nome: 'Internet', valor: 100, ativo: true, dia_vencimento: 22, mes_inicio: '2026-01' },
    { id: 'f2', nome: 'Aluguel', valor: 900, ativo: true, dia_vencimento: 5, mes_inicio: '2026-01' },
    { id: 'f3', nome: 'Condomínio', valor: 400, ativo: true, dia_vencimento: 26, mes_inicio: '2026-01' },
  ],
  ...extra,
})
const resposta = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v }, status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } })

describe('resumo do mês para o Ninho', () => {
  it('números do mês e o que vence nos próximos 7 dias (sem o que já passou ou foi pago)', () => {
    const r = resumoParaNinho(base({ fixosPagamentos: [{ fixo_id: 'f1', mes: '2026-10', pago: false }] }), '2026-10-20')
    expect(r.mes).toBe('2026-10')
    expect(r.comprometido).toBe(1400)
    expect(r.aPagar).toBe(1400)
    expect(r.vencimentos.map((v) => `${v.data} ${v.titulo} ${v.valor}`)).toEqual(['2026-10-22 Internet 100', '2026-10-26 Condomínio 400'])
    const pago = resumoParaNinho(base({ fixosPagamentos: [{ fixo_id: 'f1', mes: '2026-10', pago: true }] }), '2026-10-20')
    expect(pago.vencimentos.map((v) => v.titulo)).toEqual(['Condomínio'])
    expect(pago.pago).toBe(100)
  })
  it('perto do fim do mês entra o vencimento do mês seguinte', () => {
    expect(resumoParaNinho(base(), '2026-10-30').vencimentos.map((v) => v.data)).toEqual(['2026-11-05'])
  })
  it('avisos de teto e nenhum detalhe de compra', async () => {
    const db = criarFakeDb({ comprasIniciais: [{ id: 'x1', data_compra: '2026-10-15', valor_total: 300, parcelas: 1, categoria: 'Alimentação', subcategoria: 'Mercado', descricao: 'mercado secreto', pessoa: 'Giovanna', cartao_id: 'c-nu', origem: 'manual' }] })
    const d = await db.dadosResumoMensal()
    const r = resumoParaNinho({ ...d, orcamentos: [{ categoria: 'Alimentação', valor: 1 }] }, '2026-10-20')
    expect(r.avisos[0]).toEqual({ tom: 'ruim', texto: 'Alimentação passou do teto' })
    expect(JSON.stringify(r)).not.toContain('mercado secreto')
    expect(Object.keys(r).sort()).toEqual(['aPagar', 'avisos', 'comprometido', 'mes', 'pago', 'pctComprometido', 'renda', 'sobraProjetada', 'vencimentos'])
  })
})

describe('rota /api/resumo-ninho', () => {
  const OLD = process.env.NINHO_RESUMO_TOKEN
  afterEach(() => { if (OLD === undefined) delete process.env.NINHO_RESUMO_TOKEN; else process.env.NINHO_RESUMO_TOKEN = OLD })
  it('sem o segredo cadastrado não responde', async () => {
    delete process.env.NINHO_RESUMO_TOKEN
    const res = resposta(); await handler({ method: 'GET', headers: {} }, res)
    expect(res.code).toBe(503)
  })
  it('segredo errado: 401; certo: devolve o resumo', async () => {
    process.env.NINHO_RESUMO_TOKEN = 'segredo-de-teste-com-mais-de-24-caracteres'
    const db = { dadosResumoMensal: async () => base() }
    const errado = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer outro' } }, errado, { db })
    expect(errado.code).toBe(401)
    const ok = resposta(); await handler({ method: 'GET', headers: { authorization: 'Bearer segredo-de-teste-com-mais-de-24-caracteres' } }, ok, { db, agora: () => new Date('2026-10-20T15:00:00Z') })
    expect(ok.code).toBe(200)
    expect(ok.headers['Cache-Control']).toBe('no-store')
    expect(ok.body.resumo.renda).toBe(5000)
    const post = resposta(); await handler({ method: 'POST', headers: {} }, post)
    expect(post.code).toBe(405)
  })
})
