import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarFakeDb, criarFakeTg, msg, clicar, GI } from './fakes.js'

const AGORA = new Date('2026-10-04T15:00:00Z')
const SEGURA = { id: 'r-mercado', estabelecimento_chave: 'mercado', categoria: 'Alimentação', subcategoria: 'Mercado', confirmacoes: 40, rejeicoes: 0, confianca: 0.97 }
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => AGORA })
beforeEach(() => { db = criarFakeDb({ regras: [SEGURA] }); tg = criarFakeTg() })

describe('/auto', () => {
  it('sem ligar, continua pedindo Confirmar', async () => {
    expect((await rodar(msg(GI, 'mercado 50 nubank'))).acao).toBe('evento_criado')
    expect(db.s.compras).toHaveLength(0)
  })
  it('/auto on liga e /auto mostra o estado', async () => {
    expect((await rodar(msg(GI, '/auto on'))).acao).toBe('auto_ligado')
    expect((await rodar(msg(GI, '/auto'))).acao).toBe('auto_status')
    expect(tg.ultima().text).toContain('ligado')
  })
  it('ligado: lugar conhecido com cartão dito é lançado sozinho e avisa', async () => {
    await rodar(msg(GI, '/auto on'))
    const r = await rodar(msg(GI, 'mercado 50 nubank'))
    expect(r.acao).toBe('auto_lancado')
    expect(db.s.compras).toHaveLength(1)
    expect(tg.ultima().text).toContain('Lançado sozinho')
    expect(tg.ultima().text).toContain('/ultima')
  })
  it('ligado: valor acima de R$ 300 ainda pede Confirmar', async () => {
    await rodar(msg(GI, '/auto on'))
    expect((await rodar(msg(GI, 'mercado 400 nubank'))).acao).toBe('evento_criado')
    expect(db.s.compras).toHaveLength(0)
  })
  it('ligado: sem cartão dito, pergunta (não adivinha)', async () => {
    await rodar(msg(GI, '/auto on'))
    expect((await rodar(msg(GI, 'mercado 50'))).acao).toBe('evento_criado')
    expect(db.s.compras).toHaveLength(0)
  })
  it('ligado: lugar desconhecido ou pouca certeza pede Confirmar', async () => {
    await rodar(msg(GI, '/auto on'))
    expect((await rodar(msg(GI, 'padaria 20 nubank'))).acao).toBe('evento_criado')
    db = criarFakeDb({ regras: [{ ...SEGURA, confianca: 0.9 }] })
    await rodar(msg(GI, '/auto on'))
    expect((await rodar(msg(GI, 'mercado 50 nubank'))).acao).toBe('evento_criado')
    expect(db.s.compras).toHaveLength(0)
  })
  it('compra lançada sozinha pode ser apagada pelo /ultima', async () => {
    await rodar(msg(GI, '/auto on'))
    await rodar(msg(GI, 'mercado 50 nubank'))
    await rodar(msg(GI, '/ultima'))
    await rodar(clicar(GI, tg, 'Apagar'))
    expect((await rodar(clicar(GI, tg, 'Sim, apagar'))).acao).toBe('compra_apagada')
    expect(db.s.compras).toHaveLength(0)
  })
  it('/auto off desliga', async () => {
    await rodar(msg(GI, '/auto on'))
    await rodar(msg(GI, '/auto off'))
    expect((await rodar(msg(GI, 'mercado 50 nubank'))).acao).toBe('evento_criado')
  })
})
