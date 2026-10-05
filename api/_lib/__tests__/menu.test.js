import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarFakeDb, criarFakeTg, msg, clicar, GI, ESTRANHO } from './fakes.js'

const AGORA = new Date('2026-10-15T15:00:00Z')
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => AGORA })
beforeEach(() => { db = criarFakeDb(); tg = criarFakeTg() })

describe('menu do bot', () => {
  it.each(['oi', 'Oi!', 'olá', 'bom dia', 'menu', '/menu', 'ajuda', 'sla', '?'])('"%s" mostra o menu com botões', async (t) => {
    expect((await rodar(msg(GI, t))).acao).toBe('menu')
    expect(tg.ultima().text).toContain('O que você quer fazer')
    expect(JSON.stringify(tg.ultima())).toContain('Resumo do mês')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('gasto que só começa parecido com saudação continua sendo gasto', async () => {
    expect((await rodar(msg(GI, 'oi mercado 50 nubank'))).acao).not.toBe('menu')
  })
  it('botão Resumo do mês responde o resumo', async () => {
    await rodar(msg(GI, 'oi'))
    expect((await rodar(clicar(GI, tg, 'Resumo do mês'))).acao).toBe('resumo')
  })
  it('botões Faturas, Próximas, Pendentes e Como lançar respondem', async () => {
    const toca = async (rotulo) => { await rodar(msg(GI, 'menu')); return (await rodar(clicar(GI, tg, rotulo))).acao }
    expect(await toca('Faturas abertas')).toBe('faturas')
    expect(await toca('Próximas faturas')).toBe('proximas')
    expect(await toca('Pendentes')).toBe('pendentes')
    expect(await toca('Como lançar')).toBe('ajuda')
  })
  it('estranho não pareado não recebe o menu', async () => {
    expect((await rodar(msg(ESTRANHO, 'oi'))).ignorado).toBe('nao_autorizado')
  })
})
