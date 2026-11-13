import { describe, it, expect, beforeEach } from 'vitest'
import handler from '../../android-token.js'
import notificacao from '../../notificacao.js'
import { hashToken } from '../tokenAndroid.js'
import { criarFakeDb, criarFakeTg } from './fakes.js'

const res = () => ({ status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } })

describe('conectar o celular pelo app (api/android-token)', () => {
  let db
  const chamar = (corpo, { logado = true, metodo = 'POST' } = {}) => {
    const r = res()
    return handler({ method: metodo, headers: { authorization: 'Bearer jwt' }, body: corpo }, r, { db, autenticar: async () => logado }).then(() => r)
  }
  beforeEach(() => {
    db = criarFakeDb()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.SUPABASE_URL = 'http://x'
    delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_WEBHOOK_SECRET // instalação sem Telegram
  })
  it('gera o token (uma vez) e o banco guarda só o hash; funciona sem as variáveis do Telegram', async () => {
    const r = await chamar({ acao: 'gerar', pessoa_id: 'p-gi', nome: 'Meu Samsung' })
    expect(r.code).toBe(200)
    expect(r.body.token).toMatch(/^fin_[0-9a-f]{48}$/)
    const dev = await db.dispositivoPorHash(await hashToken(r.body.token))
    expect(dev).toMatchObject({ pessoa_id: 'p-gi', nome: 'Meu Samsung' })
    expect(JSON.stringify(dev)).not.toContain(r.body.token)
  })
  it('gerar de novo desconecta o celular anterior (começar do zero)', async () => {
    const a = (await chamar({ acao: 'gerar', pessoa_id: 'p-gi' })).body.token
    const b = (await chamar({ acao: 'gerar', pessoa_id: 'p-gi' })).body.token
    expect(await db.dispositivoPorHash(await hashToken(a))).toBeNull()
    expect(await db.dispositivoPorHash(await hashToken(b))).toBeTruthy()
  })
  it('revogar desconecta', async () => {
    const t = (await chamar({ acao: 'gerar', pessoa_id: 'p-gi' })).body.token
    expect((await chamar({ acao: 'revogar', pessoa_id: 'p-gi' })).code).toBe(200)
    expect(await db.dispositivoPorHash(await hashToken(t))).toBeNull()
  })
  it('sem login: 401; só POST; sem pessoa: 400; ação desconhecida: 400', async () => {
    expect((await chamar({ acao: 'gerar', pessoa_id: 'p-gi' }, { logado: false })).code).toBe(401)
    expect((await chamar({ acao: 'gerar' }, { metodo: 'GET' })).code).toBe(405)
    expect((await chamar({ acao: 'gerar' })).code).toBe(400)
    expect((await chamar({ acao: 'x', pessoa_id: 'p-gi' })).code).toBe(400)
  })
})

describe('testar conexão e leitura sem Telegram (api/notificacao)', () => {
  let db
  const post = (corpo, token) => {
    const r = res()
    return notificacao({ method: 'POST', headers: { authorization: token ? `Bearer ${token}` : '' }, body: corpo }, r, { db, tg: criarFakeTg() }).then(() => r)
  }
  beforeEach(() => {
    db = criarFakeDb()
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'; process.env.SUPABASE_URL = 'http://x'
    delete process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_WEBHOOK_SECRET
  })
  it('teste: reconhece o token, não cria lançamento e responde teste:true', async () => {
    const g = res(); await handler({ method: 'POST', headers: { authorization: 'Bearer j' }, body: { acao: 'gerar', pessoa_id: 'p-gi' } }, g, { db, autenticar: async () => true })
    const r = await post({ teste: true, app: 'Teste' }, g.body.token)
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, teste: true })
    expect(await db.buscarEmAndamento(null)).toBeNull()
  })
  it('teste com token errado: 401', async () => {
    expect((await post({ teste: true }, 'fin_errado')).code).toBe(401)
  })
  it('instalação sem as variáveis do Telegram: a notificação vai para o Inbox (antes dava 503)', async () => {
    const g = res(); await handler({ method: 'POST', headers: { authorization: 'Bearer j' }, body: { acao: 'gerar', pessoa_id: 'p-gi' } }, g, { db, autenticar: async () => true })
    const r = await post({ app: 'Nubank', titulo: 'Compra aprovada', texto: 'Compra de R$ 19,90 APROVADA em MP *MELIMAIS para o cartão com final 9017.' }, g.body.token)
    expect(r.code).toBe(200)
    expect(r.body).toMatchObject({ ok: true, destino: 'inbox' })
    expect(await db.buscarEmAndamento(null)).toMatchObject({ origem: 'android_notification', valor: 19.9 })
  })
})
