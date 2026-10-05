import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { limparLeitura } from '../leitorNota.js'
import { criarFakeDb, criarFakeTg, msg, foto, clicar, GI, ESTRANHO } from './fakes.js'

const AGORA = new Date('2026-10-04T15:00:00Z') // 12:00 em São Paulo, dia 04/10/2026
let db, tg, leitor
const rodar = (u, extra = {}) => processarUpdate(u, { db, tg, leitor, agora: () => AGORA, ...extra })
const leitorFixo = (nota) => ({ ler: async (imagem, hoje) => { leitor.chamadas.push({ imagem, hoje }); return nota } })
beforeEach(() => {
  db = criarFakeDb(); tg = criarFakeTg()
  leitor = leitorFixo({ valor: 72.99, estabelecimento: 'Mercado Central', data: '2026-10-03', parcelas: null })
  leitor.chamadas = []
})

describe('foto de notinha', () => {
  it('lê a foto maior, cria o evento e mostra o resumo com Confirmar (nada é lançado sozinho)', async () => {
    const r = await rodar(foto(GI))
    expect(r.acao).toBe('evento_criado')
    expect(tg.baixados).toEqual(['grande'])
    expect(leitor.chamadas[0].hoje).toBe('2026-10-04')
    expect(tg.enviadas[0].text).toContain('Li a notinha: Mercado Central')
    expect(db.s.eventos[0]).toMatchObject({ valor: 72.99, descricao_original: 'Mercado Central', data_evento: '2026-10-03', confianca_origem: 0.7 })
    expect(db.s.compras).toHaveLength(0)
    expect(tg.ultima().text).toContain('Qual cartão')
  })
  it('a legenda completa cartão e pessoa; depois é só Confirmar', async () => {
    leitor = leitorFixo({ valor: 72.99, estabelecimento: 'Mercado', data: '2026-10-03', parcelas: null }); leitor.chamadas = [] // local que o histórico já conhece
    await rodar(foto(GI, { caption: 'nubank sa' }))
    expect(db.s.eventos[0]).toMatchObject({ cartao_id: 'c-nu', pessoa_id: 'p-sa' })
    expect(tg.ultima().markup.inline_keyboard.flat().some((b) => b.text.includes('Confirmar'))).toBe(true)
    await rodar(clicar(GI, tg, 'Confirmar'))
    expect(db.s.compras).toHaveLength(1)
    expect(db.s.compras[0]).toMatchObject({ valor_total: 72.99, descricao: 'Mercado' })
  })
  it('valor e descrição digitados na legenda valem mais que a leitura', async () => {
    await rodar(foto(GI, { caption: 'padaria 10 nubank' }))
    expect(db.s.eventos[0]).toMatchObject({ valor: 10, descricao_original: 'padaria' })
  })
  it('sem nome do local, usa um nome padrão editável', async () => {
    leitor = leitorFixo({ valor: 30, estabelecimento: null, data: null, parcelas: null }); leitor.chamadas = []
    await rodar(foto(GI, { caption: 'nubank' }))
    expect(db.s.eventos[0]).toMatchObject({ descricao_original: 'Compra da notinha', data_evento: '2026-10-04' })
  })
  it('imagem enviada como arquivo (png) também funciona; pdf não', async () => {
    const png = msg(GI, undefined, { document: { file_id: 'doc1', mime_type: 'image/png' } })
    expect((await rodar(png)).acao).toBe('evento_criado')
    const pdf = msg(GI, undefined, { document: { file_id: 'doc2', mime_type: 'application/pdf' } })
    expect((await rodar(pdf)).ignorado).toBe('sem_texto')
  })
  it('sem chave de IA: avisa e manda digitar, sem criar evento', async () => {
    const r = await rodar(foto(GI), { leitor: null })
    expect(r.acao).toBe('foto_desligada')
    expect(tg.ultima().text).toContain('Ainda não estou lendo fotos')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('foto ilegível: pede para digitar', async () => {
    leitor = leitorFixo(null); leitor.chamadas = []
    expect((await rodar(foto(GI))).acao).toBe('foto_ilegivel')
    expect(tg.ultima().text).toContain('Não consegui ler essa foto')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('imagem grande demais / formato não aceito: avisa sem chamar a IA', async () => {
    tg.imagem = null
    expect((await rodar(foto(GI))).acao).toBe('foto_invalida')
    expect(leitor.chamadas).toHaveLength(0)
  })
  it('erro da IA que não é de rede: avisa e o update fica registrado (sem laço de reenvio)', async () => {
    leitor = { ler: async () => { throw new Error('400 invalid_request_error') } }
    expect((await rodar(foto(GI))).acao).toBe('foto_ilegivel')
    expect(db.s.updates.size).toBe(1)
  })
  it('erro de rede/sobrecarga da IA: devolve erro para o Telegram reenviar e esquece o update', async () => {
    leitor = { ler: async () => { throw Object.assign(new Error('Overloaded'), { status: 529 }) } } // como o SDK da Anthropic sinaliza
    const u = foto(GI)
    await expect(rodar(u)).rejects.toThrow('Overloaded')
    expect(db.s.updates.has(u.update_id)).toBe(false)
  })
  it('quem não está pareado não gasta IA: foto é ignorada em silêncio', async () => {
    const r = await rodar(foto(ESTRANHO))
    expect(r.ignorado).toBe('nao_autorizado')
    expect(leitor.chamadas).toHaveLength(0)
    expect(tg.enviadas).toHaveLength(0)
  })
  it('a mesma foto reenviada pelo Telegram não duplica', async () => {
    const u = foto(GI)
    await rodar(u)
    expect((await rodar(u)).ignorado).toBe('repetido')
    expect(db.s.eventos).toHaveLength(1)
  })
})

describe('limparLeitura (valida o que a IA devolve)', () => {
  const hoje = '2026-10-04'
  it('aceita leitura boa e arredonda centavos', () => {
    expect(limparLeitura({ legivel: true, valor_total: 12.3456, estabelecimento: '  Padaria   X ', data: '2026-10-01', parcelas: 3 }, hoje))
      .toEqual({ valor: 12.35, estabelecimento: 'Padaria X', data: '2026-10-01', parcelas: 3 })
  })
  it('rejeita ilegível, valor zero/negativo/absurdo e lixo', () => {
    for (const j of [null, { legivel: false }, { legivel: true, valor_total: 0 }, { legivel: true, valor_total: -5 }, { legivel: true, valor_total: 1e7 }, { legivel: true, valor_total: 'abc' }, { legivel: true, valor_total: null }]) {
      expect(limparLeitura(j, hoje)).toBeNull()
    }
  })
  it('descarta data futura, impossível ou em formato errado (usa hoje depois), mas mantém o valor', () => {
    for (const data of ['2026-10-05', '2026-02-31', '03/10/2026', 'ontem', null]) {
      expect(limparLeitura({ legivel: true, valor_total: 10, estabelecimento: null, data, parcelas: null }, hoje).data).toBeNull()
    }
  })
  it('parcelas fora de 1 a 48 viram null', () => {
    for (const parcelas of [0, 49, 2.5, '3', null]) {
      expect(limparLeitura({ legivel: true, valor_total: 10, estabelecimento: 'x', data: null, parcelas }, hoje).parcelas).toBeNull()
    }
  })
})
