import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { criarTranscritor } from '../transcritor.js'
import { criarTelegram } from '../telegramApi.js'
import { criarFakeDb, criarFakeTg, msg, voz, clicar, GI, ESTRANHO } from './fakes.js'

const AGORA = new Date('2026-10-04T15:00:00Z')
let db, tg, transcritor
const rodar = (u, extra = {}) => processarUpdate(u, { db, tg, transcritor, agora: () => AGORA, ...extra })
const falaFixa = (texto) => { const t = { chamadas: [], transcrever: async (a) => { t.chamadas.push(a); return texto } }; return t }
beforeEach(() => { db = criarFakeDb(); tg = criarFakeTg(); transcritor = falaFixa('gastei 45 no mercado no nubank') })

describe('recado de voz no bot', () => {
  it('transcreve, mostra o que entendeu e segue como texto (resumo + Confirmar)', async () => {
    const r = await rodar(voz(GI))
    expect(r.acao).toBe('evento_criado')
    expect(tg.audiosBaixados).toEqual(['voz1'])
    expect(tg.enviadas[0].text).toBe('🎤 Entendi: "gastei 45 no mercado no nubank"')
    expect(db.s.eventos[0]).toMatchObject({ valor: 45, descricao_original: 'mercado', cartao_id: 'c-nu' })
    expect(db.s.compras).toHaveLength(0) // nada é lançado sem o toque
    await rodar(clicar(GI, tg, 'Confirmar'))
    expect(db.s.compras).toHaveLength(1)
  })
  it('áudio enviado como arquivo (mp3) também vale', async () => {
    const u = msg(GI, undefined, { audio: { file_id: 'a1', duration: 8, mime_type: 'audio/mpeg' } })
    expect((await rodar(u)).acao).toBe('evento_criado')
  })
  it('responde a uma pergunta em aberto por voz (ex.: "me diga o valor")', async () => {
    await rodar(msg(GI, 'mercado 20 nubank'))
    await rodar(clicar(GI, tg, 'Editar'))
    await rodar(clicar(GI, tg, 'Valor'))
    transcritor = falaFixa('32,50')
    expect((await rodar(voz(GI))).acao).toBe('campo_atualizado')
    expect(db.s.eventos[0].valor).toBe(32.5)
  })
  it('sem chave: avisa e manda digitar', async () => {
    const r = await rodar(voz(GI), { transcritor: null })
    expect(r.acao).toBe('audio_desligado')
    expect(tg.ultima().text).toContain('Ainda não entendo áudio')
  })
  it('áudio longo demais não gasta transcrição', async () => {
    expect((await rodar(voz(GI, 61))).acao).toBe('audio_longo')
    expect(transcritor.chamadas).toHaveLength(0)
  })
  it('formato não aceito/arquivo grande: avisa sem transcrever', async () => {
    tg.audio = null
    expect((await rodar(voz(GI))).acao).toBe('audio_invalido')
    expect(transcritor.chamadas).toHaveLength(0)
  })
  it('silêncio ou ruído (sem texto): pede para digitar', async () => {
    transcritor = falaFixa(null)
    expect((await rodar(voz(GI))).acao).toBe('audio_ilegivel')
    expect(db.s.eventos).toHaveLength(0)
  })
  it('texto sem valor vira a mesma orientação do texto digitado', async () => {
    transcritor = falaFixa('comprei umas coisas')
    expect((await rodar(voz(GI))).acao).toBe('nao_entendi')
    expect(tg.ultima().text).toContain('Não encontrei o valor')
  })
  it('erro da Groq que não é de rede: avisa e o update fica registrado', async () => {
    transcritor = { transcrever: async () => { throw Object.assign(new Error('Groq: HTTP 400'), { status: 400 }) } }
    expect((await rodar(voz(GI))).acao).toBe('audio_ilegivel')
    expect(db.s.updates.size).toBe(1)
  })
  it('limite de uso/sobrecarga (429, 5xx): devolve erro para o Telegram reenviar e esquece o update', async () => {
    transcritor = { transcrever: async () => { throw Object.assign(new Error('Groq: HTTP 429'), { status: 429 }) } }
    const u = voz(GI)
    await expect(rodar(u)).rejects.toThrow('429')
    expect(db.s.updates.has(u.update_id)).toBe(false)
  })
  it('quem não está pareado não gasta transcrição: áudio é ignorado em silêncio', async () => {
    expect((await rodar(voz(ESTRANHO))).ignorado).toBe('nao_autorizado')
    expect(transcritor.chamadas).toHaveLength(0)
    expect(tg.enviadas).toHaveLength(0)
  })
  it('o mesmo áudio reenviado pelo Telegram não duplica', async () => {
    const u = voz(GI)
    await rodar(u)
    expect((await rodar(u)).ignorado).toBe('repetido')
    expect(db.s.eventos).toHaveLength(1)
  })
})

describe('transcritor (Groq)', () => {
  const audio = { base64: Buffer.from('som').toString('base64'), mediaType: 'audio/ogg', extensao: 'oga' }
  it('envia o arquivo, modelo e idioma certos com a chave no cabeçalho, e devolve o texto', async () => {
    let req
    const fetchImpl = async (url, init) => { req = { url, init }; return { ok: true, json: async () => ({ text: '  gastei   45 no mercado ' }) } }
    expect(await criarTranscritor('CHAVE', { fetchImpl }).transcrever(audio)).toBe('gastei 45 no mercado')
    expect(req.url).toBe('https://api.groq.com/openai/v1/audio/transcriptions')
    expect(req.init.headers.authorization).toBe('Bearer CHAVE')
    expect(req.init.body.get('model')).toBe('whisper-large-v3-turbo')
    expect(req.init.body.get('language')).toBe('pt')
    expect(req.init.body.get('file').name).toBe('audio.ogg') // .oga do Telegram vira .ogg
  })
  it('texto vazio vira null', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ text: '  ' }) })
    expect(await criarTranscritor('K', { fetchImpl }).transcrever(audio)).toBeNull()
  })
  it('erro HTTP leva o status e nunca a chave', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429, json: async () => ({}) })
    const e = await criarTranscritor('SEGREDO', { fetchImpl }).transcrever(audio).catch((x) => x)
    expect(e.status).toBe(429)
    expect(e.message).not.toContain('SEGREDO')
  })
  it('falha de rede vira erro "de conexão" (reenviável)', async () => {
    const fetchImpl = async () => { throw new TypeError('fetch failed') }
    const e = await criarTranscritor('K', { fetchImpl }).transcrever(audio).catch((x) => x)
    expect(e.name).toMatch(/connection/i)
  })
})

describe('download de áudio do Telegram', () => {
  const resposta = (corpo, extra = {}) => ({ ok: true, json: async () => ({ ok: true, result: corpo }), arrayBuffer: async () => Buffer.from('som'), ...extra })
  it('baixa voz .oga e devolve base64 + tipo', async () => {
    const urls = []
    const fetchImpl = async (url) => { urls.push(url); return url.includes('/file/') ? resposta(null) : resposta({ file_path: 'voice/file_1.oga', file_size: 3 }) }
    const r = await criarTelegram('TOKEN', fetchImpl).baixarAudio('f1')
    expect(r).toEqual({ base64: Buffer.from('som').toString('base64'), mediaType: 'audio/ogg', extensao: 'oga' })
    expect(urls[1]).toBe('https://api.telegram.org/file/botTOKEN/voice/file_1.oga')
  })
  it('recusa formato desconhecido e arquivo grande', async () => {
    const f = (r) => criarTelegram('T', async (url) => (url.includes('/file/') ? resposta(null) : resposta(r))).baixarAudio('x')
    expect(await f({ file_path: 'x/arquivo.exe', file_size: 3 })).toBeNull()
    expect(await f({ file_path: 'x/voz.oga', file_size: 11 * 1024 * 1024 })).toBeNull()
  })
})
