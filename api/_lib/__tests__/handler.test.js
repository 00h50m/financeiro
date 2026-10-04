import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import telegram from '../../telegram.js'
import admin from '../../telegram-admin.js'
import { iguais, lerAmbiente } from '../ambiente.js'

const res = () => {
  const r = { codigo: null, corpo: null }
  r.status = (c) => { r.codigo = c; return r }
  r.json = (b) => { r.corpo = b; return r }
  r.end = () => r
  return r
}
const AMB = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_WEBHOOK_SECRET: 'segredo-correto', SUPABASE_SERVICE_ROLE_KEY: 'k', SUPABASE_URL: 'http://localhost:1' }
let salvo
beforeEach(() => { salvo = { ...process.env } })
afterEach(() => { process.env = salvo })

describe('webhook /api/telegram', () => {
  it('só aceita POST', async () => {
    const r = res(); await telegram({ method: 'GET', headers: {} }, r)
    expect(r.codigo).toBe(405)
  })
  it('sem configuração no servidor: 503, sem vazar nada', async () => {
    for (const k of Object.keys(AMB)) delete process.env[k]
    const r = res(); await telegram({ method: 'POST', headers: {}, body: { update_id: 1 } }, r)
    expect(r.codigo).toBe(503)
  })
  it('segredo ausente ou errado: 401', async () => {
    Object.assign(process.env, AMB)
    let r = res(); await telegram({ method: 'POST', headers: {}, body: { update_id: 1 } }, r)
    expect(r.codigo).toBe(401)
    r = res(); await telegram({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'segredo-errado' }, body: { update_id: 1 } }, r)
    expect(r.codigo).toBe(401)
  })
  it('segredo certo mas corpo inválido: 400', async () => {
    Object.assign(process.env, AMB)
    for (const body of [null, 'texto', {}, { update_id: 'x' }]) {
      const r = res(); await telegram({ method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'segredo-correto' }, body }, r)
      expect(r.codigo).toBe(400)
    }
  })
})

describe('admin /api/telegram-admin', () => {
  it('só POST; sem login não faz nada', async () => {
    let r = res(); await admin({ method: 'GET', headers: {} }, r)
    expect(r.codigo).toBe(405)
    for (const k of Object.keys(AMB)) delete process.env[k]
    r = res(); await admin({ method: 'POST', headers: {}, body: { acao: 'status' } }, r)
    expect(r.codigo).toBe(503)
  })
})

describe('ambiente', () => {
  it('comparação de segredos', () => {
    expect(iguais('abc', 'abc')).toBe(true)
    expect(iguais('abc', 'abd')).toBe(false)
    expect(iguais(undefined, 'abc')).toBe(false)
  })
  it('lista só os NOMES das variáveis que faltam', () => {
    expect(lerAmbiente({ SUPABASE_URL: 'x' }).faltando).toEqual(['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY'])
    expect(lerAmbiente({ VITE_SUPABASE_URL: 'x', ...AMB }).faltando).toEqual([])
  })
})
