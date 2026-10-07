import { describe, it, expect } from 'vitest'
import { limparFatura, criarLeitorFatura } from '../leitorFatura.js'
import ler from '../../ler-fatura.js'

const l = (o) => ({ data: '2026-09-12', descricao: 'Farmacia Local', valor: 40, parcela_atual: null, parcela_total: null, ...o })
const bom = (o = {}) => ({ legivel: true, cartao: 'Nubank final 1234', total_fatura: 100, lancamentos: [l({}), l({ descricao: 'Loja X 03/10', valor: 60, parcela_atual: 3, parcela_total: 10 })], ...o })

describe('limparFatura', () => {
  it('devolve as linhas no formato do CSV', () => {
    const r = limparFatura(bom())
    expect(r.linhas[0]).toEqual({ data: '2026-09-12', descricao: 'Farmacia Local', valor: '40', categoria: '', parcela_atual: '', parcela_total: '', cartao: '', observacao: '' })
    expect(r.linhas[1]).toMatchObject({ parcela_atual: '3', parcela_total: '10', valor: '60' })
    expect(r.cartao).toBe('Nubank final 1234')
    expect(r.totalFatura).toBe(100)
  })
  it('descarta linha com data impossível, valor zero ou sem nome, e conta quantas', () => {
    const r = limparFatura(bom({ lancamentos: [l({}), l({ data: '2026-02-31' }), l({ valor: 0 }), l({ descricao: '  ' })] }))
    expect(r.linhas).toHaveLength(1)
    expect(r.descartadas).toBe(3)
  })
  it('estorno fica negativo e parcela incoerente é ignorada', () => {
    const r = limparFatura(bom({ lancamentos: [l({ valor: -25.5 }), l({ parcela_atual: 5, parcela_total: 3 })] }))
    expect(r.linhas[0].valor).toBe('-25.5')
    expect(r.linhas[1]).toMatchObject({ parcela_atual: '', parcela_total: '' })
  })
  it('não é fatura ou sem linhas: null', () => {
    expect(limparFatura({ legivel: false })).toBeNull()
    expect(limparFatura(bom({ lancamentos: [] }))).toBeNull()
    expect(limparFatura(null)).toBeNull()
  })
})

describe('leitor de fatura', () => {
  it('manda o PDF como documento e lê o JSON da resposta', async () => {
    let enviado
    const client = { messages: { create: async (a) => { enviado = a; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(bom()) }] } } } }
    const r = await criarLeitorFatura('k', { client }).ler('UERG', '2026-10-07')
    expect(enviado.messages[0].content[0]).toMatchObject({ type: 'document', source: { media_type: 'application/pdf', data: 'UERG' } })
    expect(r.linhas).toHaveLength(2)
  })
  it('resposta cortada ou recusada: null', async () => {
    const client = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [] }) } }
    expect(await criarLeitorFatura('k', { client }).ler('x', '2026-10-07')).toBeNull()
  })
})

describe('rota ler-fatura', () => {
  const res = () => ({ status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } })
  it('só aceita POST e exige login', async () => {
    const r1 = res(); await ler({ method: 'GET', headers: {} }, r1); expect(r1.code).toBe(405)
    process.env.SUPABASE_URL = 'http://localhost:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    const r2 = res(); await ler({ method: 'POST', headers: {}, body: { pdf: 'x' } }, r2); expect(r2.code).toBe(401)
  })
})
