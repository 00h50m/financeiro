import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarFakeDb, criarFakeTg, msg, GI } from './fakes.js'

const AGORA = new Date('2026-10-15T15:00:00Z')
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => AGORA })
beforeEach(() => {
  const compras = [{ id: 'x1', data_compra: '2026-10-10', valor_total: 80, parcelas: 1, cartao_id: 'c-nu', descricao: 'mercado' }]
  db = criarFakeDb({ comprasIniciais: compras }); tg = criarFakeTg()
})

describe('faturas no bot', () => {
  it('/faturas mostra a fatura aberta dos cartões', async () => {
    expect((await rodar(msg(GI, '/faturas'))).acao).toBe('faturas')
    expect(tg.ultima().text).toContain('Nubank')
    expect(tg.ultima().text).toContain('R$ 80,00')
  })
  it('pergunta em texto vira fatura e não uma compra nova', async () => {
    expect((await rodar(msg(GI, 'quanto está a fatura do nubank?'))).acao).toBe('faturas')
    expect(tg.ultima().text).not.toContain('Inter')
    expect(db.s.eventos).toHaveLength(0)
  })
})
