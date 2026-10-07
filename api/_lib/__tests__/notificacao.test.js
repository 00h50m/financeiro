import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import handler from '../../notificacao.js'
import { lerNotificacao, cartaoDaNotificacao } from '../../../src/lib/notificacaoCompra.js'
import { hashToken } from '../tokenAndroid.js'
import { criarFakeDb, criarFakeTg, msg, GI, cartoes, pessoas } from './fakes.js'

const NUBANK = { app: 'Nubank', titulo: 'Compra no crédito aprovada', texto: 'Compra de R$ 19,90 APROVADA em MP *MELIMAIS para o cartão com final 9017.' }

describe('lerNotificacao', () => {
  it('lê valor, local e final da notificação do Nubank', () => {
    expect(lerNotificacao(NUBANK)).toMatchObject({ valor: 19.9, estabelecimento: 'MP *MELIMAIS', final: '9017', app: 'Nubank' })
  })
  it('valor com milhar e local sem final', () => {
    expect(lerNotificacao({ app: 'Inter', titulo: 'Compra aprovada', texto: 'Compra aprovada no Outback de R$ 1.234,56.' }))
      .toMatchObject({ valor: 1234.56, estabelecimento: 'Outback de R$ 1.234,56' })
  })
  it('ignora recusada, estorno, pix e texto sem valor', () => {
    expect(lerNotificacao({ ...NUBANK, texto: 'Compra de R$ 19,90 RECUSADA em LOJA para o cartão com final 9017.' }).ignorar).toBeTruthy()
    expect(lerNotificacao({ titulo: 'Estorno', texto: 'Estorno de R$ 10,00 em LOJA' }).ignorar).toBeTruthy()
    expect(lerNotificacao({ titulo: 'Pix recebido', texto: 'Você recebeu R$ 50,00 de Maria' }).ignorar).toBeTruthy()
    expect(lerNotificacao({ titulo: 'Compra', texto: 'Compra aprovada em LOJA' }).ignorar).toBe('sem_valor')
    expect(lerNotificacao({ texto: '' }).ignorar).toBe('vazia')
  })
})

describe('cartaoDaNotificacao', () => {
  it('acha o cartão pelo nome do app; com dois, prefere o da pessoa', () => {
    expect(cartaoDaNotificacao('Nubank', cartoes, pessoas[0]).id).toBe('c-nu')
    const dois = [...cartoes, { id: 'c-nu2', nome: 'Nubank Roxinho', titular: 'Sabrina', ativo: true }]
    expect(cartaoDaNotificacao('Nubank', dois, pessoas[0]).id).toBe('c-nu')
    expect(cartaoDaNotificacao('Nubank', dois, null)).toBeNull()
    expect(cartaoDaNotificacao('Banco X', cartoes, pessoas[0])).toBeNull()
  })
})

describe('/android e a rota de notificação', () => {
  let db, tg
  const res = () => ({ status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } })
  const chamar = (token, corpo, extra = {}) => {
    const r = res()
    return handler({ method: 'POST', headers: { authorization: token ? `Bearer ${token}` : '' }, body: corpo }, r, { db, tg, ...extra }).then(() => r)
  }
  beforeEach(() => {
    db = criarFakeDb(); tg = criarFakeTg()
    process.env.TELEGRAM_BOT_TOKEN = 't'; process.env.TELEGRAM_WEBHOOK_SECRET = 's'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.SUPABASE_URL = 'http://x'
  })
  const gerarToken = async () => {
    await processarUpdate(msg(GI, '/android'), { db, tg })
    return tg.ultima().text.match(/fin_[0-9a-f]+/)[0]
  }

  it('/android entrega o token uma vez e o banco guarda só o hash', async () => {
    const token = await gerarToken()
    const dev = await db.dispositivoPorHash(await hashToken(token))
    expect(dev.pessoa_id).toBe('p-gi')
    expect(JSON.stringify(dev)).not.toContain(token)
  })
  it('notificação do Nubank vira pergunta de Confirmar no Telegram do dono, com o cartão certo', async () => {
    const token = await gerarToken()
    tg.enviadas.length = 0
    const r = await chamar(token, NUBANK)
    expect(r.code).toBe(200)
    const textos = tg.enviadas.map((e) => e.text).join('\n')
    expect(textos).toContain('Notificação do Nubank')
    expect(textos).toContain('R$ 19,90')
    expect(tg.enviadas.every((e) => e.chat === GI)).toBe(true)
    const ev = await db.buscarEmAndamento(GI)
    expect(ev.origem).toBe('android_notification')
    expect(ev.cartao_id).toBe('c-nu')
    expect(ev.app_origem).toBe('Nubank')
  })
  it('a mesma notificação reenviada não cria outro lançamento', async () => {
    const token = await gerarToken()
    await chamar(token, { ...NUBANK, quando: '2026-10-06T23:38' })
    const antes = tg.enviadas.length
    const r = await chamar(token, { ...NUBANK, quando: '2026-10-06T23:38' })
    expect(r.body).toMatchObject({ ok: true, ignorado: 'repetida' })
    expect(tg.enviadas.length).toBe(antes)
    // outra compra igual em outro horário é outra compra
    await chamar(token, { ...NUBANK, quando: '2026-10-07T09:10' })
    expect(tg.enviadas.length).toBeGreaterThan(antes)
  })
  it('token errado ou revogado: 401; sem token: 401', async () => {
    const token = await gerarToken()
    expect((await chamar('fin_errado', NUBANK)).code).toBe(401)
    expect((await chamar('', NUBANK)).code).toBe(401)
    await processarUpdate(msg(GI, '/android revogar'), { db, tg })
    expect((await chamar(token, NUBANK)).code).toBe(401)
  })
  it('notificação que não é compra é ignorada sem avisar ninguém', async () => {
    const token = await gerarToken()
    tg.enviadas.length = 0
    const r = await chamar(token, { app: 'Nubank', titulo: 'Pix', texto: 'Você recebeu um Pix de R$ 50,00' })
    expect(r.body).toMatchObject({ ok: true, ignorado: 'nao_e_compra' })
    expect(tg.enviadas).toHaveLength(0)
  })
  it('aceita o token dentro do corpo (MacroDroid)', async () => {
    const token = await gerarToken()
    const r = res()
    await handler({ method: 'POST', headers: {}, body: JSON.stringify({ ...NUBANK, token }) }, r, { db, tg })
    expect(r.code).toBe(200)
    expect(r.body.acao).toBeTruthy()
  })
  it('só POST e corpo válido', async () => {
    const r = res(); await handler({ method: 'GET', headers: {} }, r, { db, tg }); expect(r.code).toBe(405)
    const token = await gerarToken()
    expect((await chamar(token, { app: 'Nubank' })).code).toBe(400)
  })
})
