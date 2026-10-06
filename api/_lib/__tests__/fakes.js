import { categorias, compra } from '../../../src/lib/__tests__/fixtures.js'
import { hashCodigo } from '../../../src/lib/pareamento.js'

export const GI = 1001 // telegram_user_id da Gi (pareada)
export const SA = 1002 // da Sabi (pareada)
export const ESTRANHO = 9999

export const pessoas = [
  { id: 'p-gi', nome: 'Giovanna', apelidos: ['gi'] },
  { id: 'p-sa', nome: 'Sabrina', apelidos: ['sa'] },
]
export const cartoes = [
  { id: 'c-nu', nome: 'Nubank', titular: 'Giovanna', ativo: true },
  { id: 'c-in', nome: 'Inter', titular: 'Sabrina', ativo: true },
]

// Regras que o histórico real já teria ensinado.
const regra = (chave, categoria, subcategoria) => ({ id: 'r-' + chave, estabelecimento_chave: chave, categoria, subcategoria, confirmacoes: 9, rejeicoes: 0, confianca: 0.9 })
export const REGRAS = [
  regra('outback', 'Alimentação', 'Restaurante'), regra('mercado', 'Alimentação', 'Mercado'),
  regra('padaria', 'Alimentação', 'Mercado'), regra('ifood', 'Alimentação', 'Delivery'),
  regra('uber', 'Transporte', 'Uber/99/Táxi'),
]

// Banco em memória com a mesma interface de api/_lib/db.js.
export function criarFakeDb({ comprasIniciais = [], regras = REGRAS } = {}) {
  const s = {
    updates: new Map(), integracoes: new Map([[GI, { telegram_user_id: GI, chat_id: GI, pessoa_id: 'p-gi', ativo: true }], [SA, { telegram_user_id: SA, chat_id: SA, pessoa_id: 'p-sa', ativo: true }]]),
    pareamentos: [], eventos: [], compras: [...comprasIniciais], vinculos: [], proxId: 1,
  }
  const abertos = (e) => ['pendente', 'aguardando_dados'].includes(e.status)
  const db = {
    s,
    async registrarUpdate(id, uid) { if (s.updates.has(id)) return false; s.updates.set(id, { uid, ts: db.agora?.() ?? Date.now() }); return true },
    async esquecerUpdate(id) { s.updates.delete(id) },
    async contarUpdates(uid) { return [...s.updates.values()].filter((u) => u.uid === uid).length },
    async buscarIntegracao(uid) { return s.integracoes.get(uid) || null },
    async consumirPareamento(hash, tipo) {
      const p = s.pareamentos.find((x) => x.hash === hash && x.tipo === tipo && !x.usado && !x.expirado)
      if (!p) return null
      p.usado = true
      return { pessoa_id: p.pessoa_id }
    },
    async salvarIntegracao(r) { s.integracoes.set(r.telegram_user_id, { ...r, ativo: true }) },
    async carregarContexto() {
      return { categorias, cartoes, pessoas, regras, aliases: [], compras: s.compras, eventos: s.eventos.filter((e) => e.compra_id) }
    },
    // Devolve só as colunas que o banco de verdade seleciona (se o bot usar outra, o teste enxerga undefined como em produção).
    async buscarCompra(id) {
      const c = s.compras.find((x) => x.id === id)
      if (!c) return null
      const { id: i, descricao, identificacao, valor_total, data_compra, categoria, subcategoria, cartao_id } = c
      return { id: i, descricao, identificacao, valor_total, data_compra, categoria, subcategoria, cartao_id }
    },
    async contarPendentes() { return s.eventos.filter(abertos).length },
    async inserirEvento(row) {
      const ja = s.eventos.find((e) => e.origem === row.origem && e.id_externo === row.id_externo)
      if (ja) return ja
      const ev = { id: 'ev' + s.proxId++, status: 'pendente', contexto: {}, compra_id: null, ...row }
      s.eventos.push(ev)
      return ev
    },
    async buscarEvento(id) { return s.eventos.find((e) => e.id === id) || null },
    async atualizarEvento(id, patch) { const e = s.eventos.find((x) => x.id === id); Object.assign(e, patch); return e },
    async buscarEsperandoTexto(uid) {
      return [...s.eventos].reverse().find((e) => abertos(e) && e.contexto.telegram_user_id === uid && e.contexto.esperando) || null
    },
    async buscarEmAndamento(uid) { return [...s.eventos].reverse().find((e) => abertos(e) && e.contexto.telegram_user_id === uid) || null },
    async confirmarEvento(id, campos, por) {
      const e = s.eventos.find((x) => x.id === id)
      if (!abertos(e)) throw new Error(`Este lançamento já foi resolvido (${e.status})`)
      const c = { id: 'cp' + s.proxId++, data_compra: e.data_evento, descricao: e.descricao_original, valor_total: e.valor, parcelas: e.parcelas,
        categoria: e.categoria, subcategoria: e.subcategoria, cartao_id: e.cartao_id, origem: e.origem, confirmado_por: por, pago: e.pago }
      s.compras.push(c)
      Object.assign(e, { status: 'confirmado', compra_id: c.id })
      return c.id
    },
    async vincularEvento(id, compraId, por) {
      const e = s.eventos.find((x) => x.id === id)
      if (!abertos(e)) throw new Error(`Este lançamento já foi resolvido (${e.status})`)
      Object.assign(e, { status: 'vinculado', compra_id: compraId })
      s.vinculos.push({ id, compraId, por })
    },
    async definirResumoSemanal(uid, valor) { s.integracoes.get(uid).resumo_semanal = !!valor },
    async definirAutoLancar(uid, valor) { s.integracoes.get(uid).auto_lancar = !!valor },
    async dadosResumoMensal() {
      return {
        compras: s.compras, cartoes, fixos: [{ id: 'f1', nome: 'Internet', valor: 100, ativo: true, categoria: 'Casa', subcategoria: 'Internet' }], fixosValores: [], faturas: [],
        rendas: [{ mes: '2026-10', giovanna: 5000 }, { mes: '2026-09', giovanna: 5000 }], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: false, saldoAjustes: [], pessoas,
        orcamentos: [], fechamentos: [], divisoes: [], divisoesRepasses: [], metas: [], metasMovimentos: [],
      }
    },
    async destinatariosResumo() { return [...s.integracoes.values()].filter((i) => i.ativo && i.resumo_semanal) },
    async dadosTeto(categoria) {
      return { orcamentos: s.orcamentos || [], fixos: s.fixos || [], compras: s.compras.filter((c) => c.categoria === categoria) }
    },
    async comprasDeCartao() { return s.compras.filter((c) => c.cartao_id) },
    async comprasPeriodo(de, ate) { return s.compras.filter((c) => c.data_compra >= de && c.data_compra <= ate) },
    async ultimaConfirmada(uid) {
      return [...s.eventos].reverse().find((e) => e.status === 'confirmado' && e.compra_id && e.contexto.telegram_user_id === uid) || null
    },
    async buscarEditandoUltima(uid) {
      return [...s.eventos].reverse().find((e) => e.status === 'confirmado' && e.contexto.telegram_user_id === uid && e.contexto.esperando_ultima) || null
    },
    async atualizarCompraDoBot(id, patch) {
      const c = s.compras.find((x) => x.id === id && x.origem === 'telegram')
      if (!c) return false
      Object.assign(c, patch); return true
    },
    async apagarCompraDoBot(id) {
      const i = s.compras.findIndex((c) => c.id === id && c.origem === 'telegram')
      if (i < 0) return false
      s.compras.splice(i, 1); return true
    },
    async ignorarEvento(id) { Object.assign(s.eventos.find((x) => x.id === id), { status: 'ignorado' }) },
  }
  return db
}

export function criarFakeTg({ falharEnviar = false } = {}) {
  const t = { enviadas: [], editadas: [], callbacks: [], falharEnviar }
  return Object.assign(t, {
    async enviar(chat, text, markup) {
      if (t.falharEnviar) throw new Error('Telegram sendMessage: falha de rede')
      t.enviadas.push({ chat, text, markup }); return { message_id: 500 + t.enviadas.length }
    },
    async editar(chat, message_id, text) { t.editadas.push({ chat, message_id, text }) },
    async responderCallback(id, text) { t.callbacks.push({ id, text }) },
    async baixarAudio(file_id) { t.audiosBaixados = [...(t.audiosBaixados || []), file_id]; return t.audio === undefined ? { base64: 'BBBB', mediaType: 'audio/ogg', extensao: 'oga' } : t.audio },
    async baixarArquivo(file_id) { t.baixados = [...(t.baixados || []), file_id]; return t.imagem === undefined ? { base64: 'AAAA', mediaType: 'image/jpeg' } : t.imagem },
    ultima: () => t.enviadas[t.enviadas.length - 1],
  })
}

let seq = 0
export const msg = (from, text, extra = {}) => ({ update_id: ++seq, message: { message_id: 100 + seq, from: { id: from, is_bot: false }, chat: { id: from, type: 'private' }, text, ...extra } })
export const foto = (from, extra = {}) => msg(from, undefined, { photo: [{ file_id: 'pequena', width: 90, height: 90 }, { file_id: 'grande', width: 900, height: 1200 }], ...extra })
export const voz = (from, duration = 5, extra = {}) => msg(from, undefined, { voice: { file_id: 'voz1', duration, mime_type: 'audio/ogg' }, ...extra })
export const clicar = (from, tg, rotulo) => {
  const ult = tg.ultima()
  const b = ult.markup.inline_keyboard.flat().find((x) => x.text.includes(rotulo))
  if (!b) throw new Error(`botão "${rotulo}" não encontrado em: ${JSON.stringify(ult.markup)}`)
  return { update_id: ++seq, callback_query: { id: 'cb' + seq, from: { id: from, is_bot: false }, data: b.callback_data, message: { message_id: 900 + seq, chat: { id: from, type: 'private' } } } }
}
export { hashCodigo, compra }
