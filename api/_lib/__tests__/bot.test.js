import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarFakeDb, criarFakeTg, msg, clicar, hashCodigo, compra, GI, SA, ESTRANHO } from './fakes.js'

const AGORA = new Date('2026-10-04T15:00:00Z')
let db, tg
const rodar = (u) => processarUpdate(u, { db, tg, agora: () => AGORA })
const novo = (o) => { db = criarFakeDb(o); tg = criarFakeTg() }
beforeEach(() => novo())

describe('quem pode falar com o bot', () => {
  it('usuário não autorizado é ignorado em silêncio (nem resposta, nem evento)', async () => {
    const r = await rodar(msg(ESTRANHO, 'gastei 89,90 no mercado no nubank'))
    expect(r.ignorado).toBe('nao_autorizado')
    expect(tg.enviadas).toHaveLength(0)
    expect(db.s.eventos).toHaveLength(0)
  })
  it('estranho tentando botão de outro usuário não faz nada', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    const clique = clicar(GI, tg, 'Confirmar')
    clique.callback_query.from.id = ESTRANHO
    expect((await rodar(clique)).ignorado).toBe('nao_autorizado')
    expect(db.s.compras).toHaveLength(0)
  })
  it('pareamento: código válido conecta; inválido, expirado ou reusado não', async () => {
    db.s.pareamentos.push({ hash: await hashCodigo('ABCD2345'), tipo: 'telegram', pessoa_id: 'p-sa' })
    expect((await rodar(msg(ESTRANHO, '/start abcd-2345'))).acao).toBe('pareado')
    expect(db.s.integracoes.get(ESTRANHO).pessoa_id).toBe('p-sa')
    expect(tg.ultima().text).toContain('Conectado como Sa')
    expect((await rodar(msg(7777, '/start ABCD2345'))).acao).toBe('pareamento_recusado') // já usado
    expect((await rodar(msg(7778, '/start ZZZZ9999'))).acao).toBe('pareamento_recusado')
    expect(db.s.integracoes.has(7777)).toBe(false)
  })
  it('só conversa privada: grupo é ignorado', async () => {
    const u = msg(GI, 'mercado 100 nubank'); u.message.chat.type = 'group'
    expect((await rodar(u)).ignorado).toBe('fora_do_escopo')
  })
  it('limite de mensagens por minuto', async () => {
    for (let i = 0; i < 30; i++) await rodar(msg(GI, '/ajuda'))
    expect((await rodar(msg(GI, '/ajuda'))).ignorado).toBe('limite')
  })
})

describe('lançamento por mensagem', () => {
  it('mensagem completa: mostra o resumo e só lança depois do Confirmar', async () => {
    await rodar(msg(GI, 'gastei 89,90 no Outback no Nubank'))
    const r = tg.ultima().text
    expect(r).toContain('Nova compra')
    expect(r).toContain('Outback')
    expect(r).toContain('R$ 89,90')
    expect(r).toContain('Cartão: Nubank')
    expect(r).toContain('Pessoa: Gi')
    expect(db.s.compras).toHaveLength(0) // nada lançado ainda
    const res = await rodar(clicar(GI, tg, 'Confirmar'))
    expect(res.acao).toBe('confirmado')
    expect(db.s.compras).toHaveLength(1)
    expect(db.s.compras[0]).toMatchObject({ origem: 'telegram', valor_total: 89.9, cartao_id: 'c-nu', confirmado_por: 'telegram:Gi' })
    expect(tg.editadas.at(-1).text).toContain('Lançado')
  })
  it('sem cartão informado: pergunta o cartão e depois mostra o resumo', async () => {
    await rodar(msg(GI, 'gastei 120 no mercado'))
    expect(tg.ultima().text).toContain('Qual cartão')
    const nomes = tg.ultima().markup.inline_keyboard.flat().map((b) => b.text)
    expect(nomes).toEqual(['Nubank', 'Inter', 'Sem cartão']) // do titular primeiro
    await rodar(clicar(GI, tg, 'Inter'))
    expect(tg.ultima().text).toContain('Cartão: Inter')
  })
  it('sem cartão: pergunta a forma e se já foi pago', async () => {
    await rodar(msg(GI, 'padaria 15 pix'))
    expect(tg.ultima().text).toContain('já foi paga')
    await rodar(clicar(GI, tg, 'Sim'))
    expect(tg.ultima().text).toContain('Pagamento: Pix (já pago)')
  })
  it('"Sem cartão" pelo botão passa por forma de pagamento e pago', async () => {
    await rodar(msg(GI, 'mercado 50'))
    await rodar(clicar(GI, tg, 'Sem cartão'))
    expect(tg.ultima().text).toContain('Como foi pago')
    await rodar(clicar(GI, tg, 'Dinheiro'))
    await rodar(clicar(GI, tg, 'Ainda não'))
    expect(tg.ultima().text).toContain('Pagamento: Dinheiro (a pagar)')
  })
  it('estabelecimento desconhecido: pergunta categoria e subcategoria, sem chutar', async () => {
    await rodar(msg(GI, 'loja nova 80 nubank'))
    expect(tg.ultima().text).toContain('Qual a categoria')
    await rodar(clicar(GI, tg, 'Saúde'))
    expect(tg.ultima().text).toContain('Subcategoria de Saúde')
    await rodar(clicar(GI, tg, 'Farmácia'))
    expect(tg.ultima().text).toContain('Categoria: Saúde > Farmácia')
  })
  it('estabelecimento conhecido: sugere pelo histórico e avisa que foi sugerida', async () => {
    novo({ regras: [], comprasIniciais: [1, 2, 3].map((i) => compra({ id: 'h' + i, descricao: 'DROGASIL ' + i, categoria: 'Saúde', subcategoria: 'Farmácia', data_compra: '2026-08-0' + i, cartao_id: 'c-in' })) })
    await rodar(msg(GI, '53,90 drogasil nubank'))
    expect(tg.ultima().text).toContain('Categoria: Saúde > Farmácia — sugerida pelo seu histórico')
  })
  it('pessoa pode ser dita na mensagem (mercado ... sa)', async () => {
    await rodar(msg(GI, 'mercado 187,40 inter sa'))
    expect(tg.ultima().text).toContain('Pessoa: Sa')
  })
  it('mensagem sem valor, com valor ambíguo ou data inválida: orienta e não cria nada', async () => {
    await rodar(msg(GI, 'comprei um tênis no nubank'))
    expect(tg.ultima().text).toContain('Não encontrei o valor')
    await rodar(msg(GI, '2 pizzas 80'))
    expect(tg.ultima().text).toContain('mais de um valor')
    await rodar(msg(GI, 'uber 20 31/02'))
    expect(tg.ultima().text).toContain('Data inválida')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('Editar valor: pede o novo valor e atualiza o resumo', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    await rodar(clicar(GI, tg, 'Editar'))
    await rodar(clicar(GI, tg, 'Valor'))
    expect((await rodar(msg(GI, 'abc'))).acao).toBe('resposta_invalida')
    await rodar(msg(GI, '99,90'))
    expect(tg.ultima().text).toContain('R$ 99,90')
    await rodar(clicar(GI, tg, 'Confirmar'))
    expect(db.s.compras[0].valor_total).toBe(99.9)
  })
  it('Cancelar descarta; /cancelar também', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    await rodar(clicar(GI, tg, 'Cancelar'))
    expect(db.s.eventos[0].status).toBe('ignorado')
    await rodar(msg(GI, 'uber 30 nubank'))
    await rodar(msg(GI, '/cancelar'))
    expect(db.s.eventos[1].status).toBe('ignorado')
    expect(db.s.compras).toHaveLength(0)
  })
  it('um usuário não mexe no lançamento do outro', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    const clique = clicar(GI, tg, 'Confirmar')
    clique.callback_query.from.id = SA
    expect((await rodar(clique)).ignorado).toBe('evento_indisponivel')
    expect(db.s.compras).toHaveLength(0)
  })
})

describe('duplicidade e falhas', () => {
  it('o mesmo update chegando duas vezes é processado uma vez', async () => {
    const u = msg(GI, 'mercado 100 nubank')
    await rodar(u)
    expect((await rodar(u)).ignorado).toBe('repetido')
    expect(db.s.eventos).toHaveLength(1)
    expect(tg.enviadas).toHaveLength(1)
  })
  it('a mesma mensagem reenviada com outro update_id não duplica o evento', async () => {
    const u = msg(GI, 'mercado 100 nubank')
    await rodar(u)
    await rodar({ ...u, update_id: u.update_id + 5000 })
    expect(db.s.eventos).toHaveLength(1)
  })
  it('duplo clique em Confirmar cria uma compra só', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    const clique = clicar(GI, tg, 'Confirmar')
    await rodar(clique)
    await rodar({ ...clique, update_id: clique.update_id + 1 })
    expect(db.s.compras).toHaveLength(1)
  })
  it('compra parecida já existente (ex.: notificação): oferece Vincular ou Criar separadamente', async () => {
    novo({ comprasIniciais: [compra({ id: 'cp-notif', origem: 'android_notification', descricao: 'IFOOD', valor_total: 74.9, data_compra: '2026-10-04' })] })
    await rodar(msg(GI, 'ifood 74,90 nubank'))
    expect(tg.ultima().text).toContain('já existe no Finapp')
    await rodar(clicar(GI, tg, 'Vincular'))
    expect(db.s.compras).toHaveLength(1) // nenhuma compra nova
    expect(db.s.vinculos[0]).toMatchObject({ compraId: 'cp-notif' })
  })
  it('"Criar separadamente" segue para o resumo normal', async () => {
    novo({ comprasIniciais: [compra({ id: 'cp1', origem: 'csv', descricao: 'IFOOD', valor_total: 74.9, data_compra: '2026-10-04' })] })
    await rodar(msg(GI, 'ifood 74,90 nubank'))
    await rodar(clicar(GI, tg, 'separadamente'))
    expect(tg.ultima().text).toContain('Nova compra')
    await rodar(clicar(GI, tg, 'Confirmar'))
    expect(db.s.compras).toHaveLength(2)
  })
  it('falha de rede ao responder: o erro sobe (Telegram reenvia) e o update não fica "gasto"', async () => {
    tg.falharEnviar = true
    const u = msg(GI, 'mercado 100 nubank')
    await expect(rodar(u)).rejects.toThrow('falha de rede')
    expect(db.s.updates.has(u.update_id)).toBe(false)
    tg.falharEnviar = false
    await rodar(u) // reenvio do Telegram
    expect(db.s.eventos).toHaveLength(1) // o evento não foi duplicado
    expect(tg.ultima().text).toContain('Nova compra')
  })
  it('erro de lógica não trava a fila: avisa a pessoa e o update fica registrado', async () => {
    const u = msg(GI, 'mercado 100 nubank')
    db.carregarContexto = async () => { throw new Error('coluna inexistente') }
    expect((await rodar(u)).erro).toBe('inesperado')
    expect(tg.ultima().text).toContain('Algo deu errado')
    expect(db.s.updates.has(u.update_id)).toBe(true) // não será reprocessado em loop
  })
  it('mensagem enorme ou descrição enorme são recusadas com orientação', async () => {
    await rodar(msg(GI, 'x'.repeat(501)))
    expect(tg.ultima().text).toContain('longa demais')
    await rodar(msg(GI, 'compra ' + 'a'.repeat(100) + ' 50 nubank'))
    expect(tg.ultima().text).toContain('muito longa')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('erro do banco ao confirmar vira mensagem amigável, sem lançar', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    db.confirmarEvento = async () => { throw new Error('Informe a pessoa') }
    await rodar(clicar(GI, tg, 'Confirmar'))
    expect(tg.ultima().text).toContain('Não consegui lançar: Informe a pessoa')
  })
  it('/pendentes e /ajuda respondem', async () => {
    await rodar(msg(GI, 'mercado 100 nubank'))
    await rodar(msg(GI, '/pendentes'))
    expect(tg.ultima().text).toContain('1 lançamento')
    await rodar(msg(GI, '/ajuda'))
    expect(tg.ultima().text).toContain('gastei 89,90')
  })
})

describe('cartão sugerido no resumo', () => {
  it('com histórico no mesmo cartão, não pergunta e avisa que foi sugerido; trocar tira o aviso', async () => {
    const hist = ['a', 'b'].map((id) => ({ id, data_compra: '2026-09-10', descricao: 'uber', cartao_id: 'c-nu', categoria: 'Transporte', subcategoria: 'Uber/99/Táxi', valor_total: 20, parcelas: 1, origem: 'manual' }))
    const db2 = criarFakeDb({ comprasIniciais: hist })
    const tg2 = criarFakeTg()
    const r = await processarUpdate(msg(GI, 'uber 32,50'), { db: db2, tg: tg2, agora: () => new Date('2026-10-04T15:00:00Z') })
    expect(r.acao).toBe('evento_criado')
    expect(tg2.ultima().text).toContain('Cartão: Nubank — sugerido pelo seu histórico')
    await processarUpdate(clicar(GI, tg2, 'Editar'), { db: db2, tg: tg2, agora: () => new Date('2026-10-04T15:00:00Z') })
    await processarUpdate(clicar(GI, tg2, 'Cartão'), { db: db2, tg: tg2, agora: () => new Date('2026-10-04T15:00:00Z') })
    await processarUpdate(clicar(GI, tg2, 'Inter'), { db: db2, tg: tg2, agora: () => new Date('2026-10-04T15:00:00Z') })
    expect(tg2.ultima().text).toContain('Cartão: Inter')
    expect(tg2.ultima().text).not.toContain('sugerido')
  })
})
