import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { enviarResumosSemanais } from '../resumoSemanal.js'
import cron from '../../cron-resumo.js'
import { criarFakeDb, criarFakeTg, msg, GI, SA } from './fakes.js'

const DOMINGO = new Date('2026-10-18T22:00:00Z') // domingo 19h em São Paulo
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => DOMINGO })
const compra = (o) => ({ id: 'x' + Math.random(), data_compra: '2026-10-15', valor_total: 50, parcelas: 1, categoria: 'Alimentação', subcategoria: 'Mercado', descricao: 'mercado', pessoa: 'Giovanna', cartao_id: 'c-nu', origem: 'manual', ...o })
beforeEach(() => { db = criarFakeDb({ comprasIniciais: [compra({}), compra({ valor_total: 30, data_compra: '2026-10-02' })] }); tg = criarFakeTg() })

describe('/avisos', () => {
  it('sem argumento mostra o estado; on liga e off desliga', async () => {
    expect((await rodar(msg(GI, '/avisos'))).acao).toBe('avisos_status')
    expect(tg.ultima().text).toContain('desligado')
    expect((await rodar(msg(GI, '/avisos on'))).acao).toBe('avisos_ligado')
    expect((await db.destinatariosResumo()).map((d) => d.telegram_user_id)).toEqual([GI])
    expect((await rodar(msg(GI, '/avisos off'))).acao).toBe('avisos_desligado')
    expect(await db.destinatariosResumo()).toEqual([])
  })
  it('se o banco ainda não tem a coluna, explica em vez de falhar', async () => {
    db.definirResumoSemanal = async () => { throw new Error('column "resumo_semanal" of relation "integracoes_telegram" does not exist') }
    expect((await rodar(msg(GI, '/avisos on'))).acao).toBe('avisos_indisponivel')
    expect(tg.ultima().text).toContain('inbox/11')
  })
})

describe('envio do resumo de domingo', () => {
  it('manda só para quem ligou, com a semana e o mês', async () => {
    await rodar(msg(GI, '/avisos on'))
    tg.enviadas.length = 0
    const r = await enviarResumosSemanais({ db, tg, agora: () => DOMINGO })
    expect(r).toEqual({ enviados: 1, falhas: 0 })
    expect(tg.enviadas).toHaveLength(1)
    expect(tg.enviadas[0].chat).toBe(GI)
    expect(tg.enviadas[0].text).toContain('Resumo da semana')
    expect(tg.enviadas[0].text).toContain('R$ 50,00')
    expect(tg.enviadas[0].text).toContain('No mês (outubro): R$ 80,00')
    expect(tg.enviadas[0].text).toContain('/avisos off')
  })
  it('ninguém ligou: não manda nada', async () => {
    expect(await enviarResumosSemanais({ db, tg })).toEqual({ enviados: 0, falhas: 0 })
    expect(tg.enviadas).toHaveLength(0)
  })
  it('falha com um destinatário não impede os outros', async () => {
    await rodar(msg(GI, '/avisos on')); await rodar(msg(SA, '/avisos on'))
    tg.enviadas.length = 0
    const enviarOriginal = tg.enviar
    tg.enviar = async (chat, ...resto) => { if (chat === GI) throw new Error('bloqueado'); return enviarOriginal(chat, ...resto) }
    expect(await enviarResumosSemanais({ db, tg, agora: () => DOMINGO })).toEqual({ enviados: 1, falhas: 1 })
  })
})

describe('endereço do cron', () => {
  const resposta = () => { const r = { status(c) { r.codigo = c; return r }, json(b) { r.corpo = b; return r }, end() { return r } }; return r }
  const guardado = process.env.CRON_SECRET
  afterEach(() => { if (guardado === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = guardado })
  it('sem CRON_SECRET: 503', async () => {
    delete process.env.CRON_SECRET
    const r = resposta(); await cron({ method: 'GET', headers: {} }, r)
    expect(r.codigo).toBe(503)
  })
  it('cabeçalho errado: 401; método errado: 405', async () => {
    process.env.CRON_SECRET = 'segredo-teste'
    const r = resposta(); await cron({ method: 'GET', headers: { authorization: 'Bearer outro' } }, r)
    expect(r.codigo).toBe(401)
    const r2 = resposta(); await cron({ method: 'POST', headers: {} }, r2)
    expect(r2.codigo).toBe(405)
  })
})
