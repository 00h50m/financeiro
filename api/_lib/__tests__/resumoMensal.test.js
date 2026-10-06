import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { enviarResumosMensais, textoResumoDoMes } from '../resumoMensal.js'
import cron from '../../cron-resumo-mensal.js'
import { criarFakeDb, criarFakeTg, msg, GI } from './fakes.js'

const DIA_1 = new Date('2026-11-01T11:00:00Z') // 08h em São Paulo, dia 1
const compra = (o) => ({ id: 'x' + Math.random(), data_compra: '2026-10-15', valor_total: 300, parcelas: 1, categoria: 'Alimentação', subcategoria: 'Mercado', descricao: 'mercado', pessoa: 'Giovanna', cartao_id: 'c-nu', origem: 'manual', ...o })
let db, tg
beforeEach(() => { db = criarFakeDb({ comprasIniciais: [compra({}), compra({ valor_total: 120, categoria: 'Transporte', descricao: 'uber' })] }); tg = criarFakeTg() })

describe('resumo mensal no Telegram', () => {
  it('texto traz renda, despesas, sobra e categorias do mês pedido', async () => {
    const t = textoResumoDoMes(await db.dadosResumoMensal(), '2026-10', '2026-11-01')
    expect(t).toContain('Resumo de Out/26')
    expect(t).toContain('Renda: R$ 5.000,00')
    expect(t).toContain('Onde foi o dinheiro:')
    expect(t).toContain('Alimentação')
  })
  it('no dia 1 manda o resumo do mês que passou só para quem ligou /avisos on', async () => {
    await processarUpdate(msg(GI, '/avisos on'), { db, tg, agora: () => DIA_1 })
    tg.enviadas.length = 0
    const r = await enviarResumosMensais({ db, tg, agora: () => DIA_1 })
    expect(r).toEqual({ enviados: 1, falhas: 0 })
    expect(tg.enviadas[0].chat).toBe(GI)
    expect(tg.enviadas[0].text).toContain('Resumo de Out/26')
    expect(tg.enviadas[0].text).toContain('/avisos off')
  })
  it('ninguém ligou: não manda nada', async () => {
    expect(await enviarResumosMensais({ db, tg, agora: () => DIA_1 })).toEqual({ enviados: 0, falhas: 0 })
  })
  it('/resumomes responde com o mês atual e "/resumomes passado" com o anterior', async () => {
    const r = await processarUpdate(msg(GI, '/resumomes'), { db, tg, agora: () => DIA_1 })
    expect(r.acao).toBe('resumo_mes')
    expect(tg.ultima().text).toContain('Resumo de Nov/26')
    await processarUpdate(msg(GI, '/resumomes passado'), { db, tg, agora: () => DIA_1 })
    expect(tg.ultima().text).toContain('Resumo de Out/26')
  })
  it('erro ao montar não derruba o bot: avisa com clareza', async () => {
    db.dadosResumoMensal = async () => { throw new Error('banco fora') }
    const r = await processarUpdate(msg(GI, '/resumomes'), { db, tg, agora: () => DIA_1 })
    expect(r.acao).toBe('resumo_mes_erro')
    expect(tg.ultima().text).toContain('Não consegui montar o resumo')
  })
  it('o cron só aceita quem tem o segredo', async () => {
    const res = { statusCode: 0, status(c) { this.statusCode = c; return this }, json() { return this }, end() { return this } }
    process.env.CRON_SECRET = 'segredo-teste'
    await cron({ method: 'GET', headers: {} }, res)
    expect(res.statusCode).toBe(401)
    delete process.env.CRON_SECRET
  })
})
