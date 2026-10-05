import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarFakeDb, criarFakeTg, msg, clicar, GI, SA } from './fakes.js'

const AGORA = new Date('2026-10-04T15:00:00Z')
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => AGORA })
beforeEach(() => { db = criarFakeDb(); tg = criarFakeTg() })

describe('/ultima', () => {
  it('sem compra lançada: avisa', async () => {
    expect((await rodar(msg(GI, '/ultima'))).acao).toBe('ultima_vazia')
  })
  it('mostra a última e só apaga depois da segunda confirmação', async () => {
    await rodar(msg(GI, 'mercado 20 nubank'))
    await rodar(clicar(GI, tg, 'Confirmar'))
    expect(db.s.compras).toHaveLength(1)
    expect((await rodar(msg(GI, '/ultima'))).acao).toBe('ultima')
    expect(tg.ultima().text).toContain('R$')
    expect((await rodar(clicar(GI, tg, 'Apagar'))).acao).toBe('ultima_confirmar_apagar')
    expect(db.s.compras).toHaveLength(1) // ainda não apagou
    expect((await rodar(clicar(GI, tg, 'Sim, apagar'))).acao).toBe('compra_apagada')
    expect(db.s.compras).toHaveLength(0)
  })
  it('"Manter" não apaga nada', async () => {
    await rodar(msg(GI, 'mercado 20 nubank'))
    await rodar(clicar(GI, tg, 'Confirmar'))
    await rodar(msg(GI, '/ultima'))
    expect((await rodar(clicar(GI, tg, 'Manter'))).acao).toBe('ultima_mantida')
    expect(db.s.compras).toHaveLength(1)
  })
  it('outra pessoa não consegue apagar a compra de quem lançou', async () => {
    await rodar(msg(GI, 'mercado 20 nubank'))
    await rodar(clicar(GI, tg, 'Confirmar'))
    await rodar(msg(GI, '/ultima'))
    const u = clicar(GI, tg, 'Apagar')
    u.callback_query.from.id = SA
    u.callback_query.message.chat.id = SA
    expect((await rodar(u)).ignorado).toBe('ultima_indisponivel')
    expect(db.s.compras).toHaveLength(1)
  })
})
