import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarFakeDb, criarFakeTg, msg, GI } from './fakes.js'

const AGORA = new Date('2026-10-15T15:00:00Z')
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => AGORA })
const compra = (o) => ({ id: 'x' + Math.random(), data_compra: '2026-10-10', valor_total: 10, categoria: 'Alimentação', subcategoria: 'Mercado', descricao: 'mercado', pessoa: 'Giovanna', ...o })
beforeEach(() => { db = criarFakeDb({ comprasIniciais: [compra({ valor_total: 80 }), compra({ valor_total: 20, categoria: 'Transporte', subcategoria: 'Uber/99/Táxi', descricao: 'uber' })] }); tg = criarFakeTg() })

describe('resumo no bot', () => {
  it('/resumo mostra o mês', async () => {
    expect((await rodar(msg(GI, '/resumo'))).acao).toBe('resumo')
    expect(tg.ultima().text).toContain('R$ 100,00')
    expect(tg.ultima().text).toContain('Alimentação')
  })
  it('pergunta em texto vira resumo e não uma compra nova', async () => {
    expect((await rodar(msg(GI, 'quanto gastei em mercado este mês?'))).acao).toBe('resumo')
    expect(tg.ultima().text).toContain('R$ 80,00')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('/resumo mes passado sem compras avisa', async () => {
    await rodar(msg(GI, '/resumo mes passado'))
    expect(tg.ultima().text).toContain('Não achei compras')
  })
})
