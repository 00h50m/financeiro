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

describe('/ultima: editar', () => {
  const lancar = async () => { await rodar(msg(GI, 'mercado 20 nubank')); await rodar(clicar(GI, tg, 'Confirmar')); await rodar(msg(GI, '/ultima')) }
  it('corrige o valor por texto', async () => {
    await lancar()
    expect((await rodar(clicar(GI, tg, 'Editar'))).acao).toBe('ultima_editar')
    expect((await rodar(clicar(GI, tg, 'Valor'))).acao).toBe('ultima_pergunta_texto')
    expect((await rodar(msg(GI, '32,50'))).acao).toBe('compra_corrigida')
    expect(db.s.compras[0].valor_total).toBe(32.5)
    expect(tg.ultima().text).toContain('Corrigido')
    expect(db.s.eventos).toHaveLength(1) // não cria compra nova
  })
  it('resposta inválida pede de novo e /cancelar desiste', async () => {
    await lancar()
    await rodar(clicar(GI, tg, 'Editar'))
    await rodar(clicar(GI, tg, 'Valor'))
    expect((await rodar(msg(GI, 'abc'))).acao).toBe('resposta_invalida')
    expect((await rodar(msg(GI, '/cancelar'))).acao).toBe('cancelado')
    expect(db.s.compras[0].valor_total).toBe(20)
    // depois do cancelar, texto volta a virar compra nova
    expect((await rodar(msg(GI, 'uber 10 nubank'))).acao).toBe('evento_criado')
  })
  it('corrige data e descrição; data futura não vale', async () => {
    await lancar()
    await rodar(clicar(GI, tg, 'Editar')); await rodar(clicar(GI, tg, 'Data'))
    expect((await rodar(msg(GI, 'ontem'))).acao).toBe('compra_corrigida')
    expect(db.s.compras[0].data_compra).toBe('2026-10-03')
    await rodar(clicar(GI, tg, 'Editar')); await rodar(clicar(GI, tg, 'Descrição'))
    await rodar(msg(GI, 'Supermercado'))
    expect(db.s.compras[0].descricao).toBe('Supermercado')
    await rodar(clicar(GI, tg, 'Editar')); await rodar(clicar(GI, tg, 'Data'))
    expect((await rodar(msg(GI, '20/10'))).acao).not.toBe('compra_corrigida')
  })
  it('corrige categoria e cartão pelos botões', async () => {
    await lancar()
    await rodar(clicar(GI, tg, 'Editar')); await rodar(clicar(GI, tg, 'Categoria'))
    await rodar(clicar(GI, tg, 'Transporte'))
    expect((await rodar(clicar(GI, tg, 'Uber'))).acao).toBe('compra_corrigida')
    expect(db.s.compras[0]).toMatchObject({ categoria: 'Transporte', subcategoria: 'Uber/99/Táxi' })
    await rodar(clicar(GI, tg, 'Editar')); await rodar(clicar(GI, tg, 'Cartão'))
    expect((await rodar(clicar(GI, tg, 'Inter'))).acao).toBe('compra_corrigida')
    expect(db.s.compras[0].cartao_id).toBe('c-in')
  })
})
