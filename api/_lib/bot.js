// Lógica do bot do Telegram. Não conhece rede nem banco: recebe `db` e `tg` (adaptadores), o que
// permite testar tudo sem Telegram nem Supabase. Princípios:
//  - só quem foi pareado (telegram_user_id -> pessoa) é atendido; os demais são ignorados em silêncio;
//  - nada vira compra sem o toque em "Confirmar"; o que falta é perguntado, nunca inventado;
//  - cada update é processado uma única vez (o Telegram reenvia quando a resposta falha).
import { interpretarMensagem, parseValor, parseData } from '../../src/lib/parserTelegram.js'
import { periodoDe, interpretarPergunta, filtroDe, calcularResumo, formatarResumo } from '../../src/lib/resumo.js'
import { prepararEvento } from '../../src/lib/evento.js'
import { hashCodigo, normalizarCodigo } from '../../src/lib/pareamento.js'
import { fmt, hojeSP } from '../../src/lib/utils.js'

const LIMITE_AUTORIZADO = 30 // mensagens por minuto
const LIMITE_DESCONHECIDO = 5
const ABERTOS = ['pendente', 'aguardando_dados']
const TRANSITORIO = /falha de rede|fetch failed|timeout|timed out|ECONN|ETIMEDOUT|EAI_AGAIN|\b(429|500|502|503|504)\b/i
// Falha de rede ou sobrecarga (429, 5xx e 529 da Anthropic): vale reenviar. Erro de lógica não: reenviar não resolveria.
const ehTransitorio = (e) => TRANSITORIO.test(String(e?.message)) || e?.status === 429 || e?.status >= 500 || /connection|timeout/i.test(String(e?.name))
const MAX_MENSAGEM = 500
const MAX_DESCRICAO = 80
const FORMAS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['boleto', 'Boleto'], ['outro', 'Outro']]
const CAMPOS_TEXTO = { valor: 'o valor (ex.: 89,90)', descricao: 'a descrição (ex.: Outback)', data: 'a data (ex.: 05/10 ou ontem)', parcelas: 'o número de parcelas (ex.: 3)' }

const AJUDA = `Mande seus gastos em linguagem natural:

• gastei 89,90 no Outback no Nubank
• mercado 187,40 inter
• uber 32,50
• comprei ração por 189,90 no nubank em 3x
• farmácia 49,90 pix ontem

Também aceito a foto de uma notinha ou comprovante (escreva o cartão na legenda, ex.: nubank) e recado de voz de até 1 minuto.

Eu mostro o que entendi e só lanço depois do seu Confirmar.
Se faltar algo (como o cartão), eu pergunto.

/pendentes – lançamentos esperando confirmação
/resumo – quanto você gastou no mês (ou: /resumo semana, /resumo mes passado)
Pergunte também: "quanto gastei em mercado este mês?"
/cancelar – descarta o que está em andamento`

const nomeCurto = (p) => (p?.apelidos?.[0] ? p.apelidos[0][0].toUpperCase() + p.apelidos[0].slice(1) : p?.nome || '—')
const fmtData = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/')
const botoes = (itens, porLinha = 2) => {
  const linhas = []
  for (let i = 0; i < itens.length; i += porLinha) linhas.push(itens.slice(i, i + porLinha))
  return { inline_keyboard: linhas }
}
const btn = (text, ...partes) => ({ text, callback_data: partes.join('|') })

// Foto enviada normalmente ou imagem enviada como arquivo (jpg/png/webp). Devolve o file_id ou null.
const arquivoDeImagem = (msg) => msg?.photo?.length ? msg.photo[msg.photo.length - 1].file_id
  : /^image\/(jpeg|png|webp)$/.test(msg?.document?.mime_type || '') ? msg.document.file_id : null

// Recado de voz (ogg) ou arquivo de áudio. Devolve { id, duracao } ou null.
const MAX_AUDIO_SEGUNDOS = 60
const audioDe = (msg) => {
  const a = msg?.voice || (/^audio\//.test(msg?.audio?.mime_type || '') ? msg.audio : null)
  return a ? { id: a.file_id, duracao: a.duration || 0 } : null
}

export async function processarUpdate(update, deps) {
  const { db, tg, leitor = null, transcritor = null, agora = () => new Date() } = deps
  const msg = update.message
  const cb = update.callback_query
  const de = (msg || cb)?.from
  const chat = msg ? msg.chat : cb?.message?.chat
  if (!de || de.is_bot || !chat || chat.type !== 'private') return { ignorado: 'fora_do_escopo' }
  if (!(typeof msg?.text === 'string' || cb?.data || arquivoDeImagem(msg) || audioDe(msg))) return { ignorado: 'sem_texto' }

  if (!(await db.registrarUpdate(update.update_id, de.id))) return { ignorado: 'repetido' }
  try {
    const integ = await db.buscarIntegracao(de.id)
    const limite = integ?.ativo ? LIMITE_AUTORIZADO : LIMITE_DESCONHECIDO
    const desde = new Date(agora().getTime() - 60000).toISOString()
    if ((await db.contarUpdates(de.id, desde)) > limite) return { ignorado: 'limite' }

    const c = { db, tg, leitor, transcritor, agora, hoje: hojeSP(agora()), de, chat, integ, update }
    if (!integ || !integ.ativo) return await tratarDesconhecido(c, msg)
    db.tocarIntegracao?.(de.id)?.catch?.(() => {})
    return cb ? await tratarCallback(c, cb) : await tratarMensagem(c, msg)
  } catch (e) {
    if (ehTransitorio(e)) {
      await db.esquecerUpdate(update.update_id).catch(() => {}) // para o Telegram poder reenviar
      throw e
    }
    // Erro de lógica: reenviar não resolveria e travaria a fila. Avisa e segue (o update fica registrado).
    console.error('bot: erro inesperado', e?.message)
    await tg.enviar(chat.id, 'Algo deu errado do meu lado e não consegui processar. Tente de novo em instantes.').catch(() => {})
    return { erro: 'inesperado' }
  }
}

// ---------- quem não está pareado ----------
async function tratarDesconhecido({ db, tg, de, chat }, msg) {
  const m = msg?.text?.trim().match(/^\/start(?:@\w+)?\s+(\S+)$/i)
  if (!m) return { ignorado: 'nao_autorizado' } // sem resposta: o bot não revela nada a estranhos
  const par = await db.consumirPareamento(await hashCodigo(normalizarCodigo(m[1])), 'telegram')
  if (!par) {
    await tg.enviar(chat.id, 'Código inválido ou expirado. Gere um novo no Finapp (Automações).')
    return { acao: 'pareamento_recusado' }
  }
  await db.salvarIntegracao({ telegram_user_id: de.id, chat_id: chat.id, pessoa_id: par.pessoa_id })
  const ctx = await db.carregarContexto()
  const nome = nomeCurto(ctx.pessoas.find((p) => p.id === par.pessoa_id))
  await tg.enviar(chat.id, `✅ Conectado como ${nome}.\n\n${AJUDA}`)
  return { acao: 'pareado', pessoa_id: par.pessoa_id }
}

// ---------- mensagens de quem está pareado ----------
async function tratarMensagem(c, msg) {
  const { db, tg, chat, de } = c
  if (typeof msg.text !== 'string') return audioDe(msg) ? await lerAudio(c, msg) : await lerFoto(c, msg) // sem texto: áudio ou foto (ver o portão acima)
  const texto = msg.text.trim()
  if (/^\/(start|ajuda|help)(@\w+)?$/i.test(texto)) { await tg.enviar(chat.id, AJUDA); return { acao: 'ajuda' } }
  if (/^\/pendentes(@\w+)?$/i.test(texto)) {
    const n = await db.contarPendentes()
    await tg.enviar(chat.id, n ? `Você tem ${n} lançamento${n > 1 ? 's' : ''} esperando confirmação. Abra o Finapp › Inbox.` : 'Nada pendente. 👍')
    return { acao: 'pendentes' }
  }
  const rs = texto.match(/^\/resumo(?:@\w+)?(?:\s+(.*))?$/i)
  if (rs) return await responderResumo(c, rs[1] || '')
  if (/^\/cancelar(@\w+)?$/i.test(texto)) {
    const ev = await db.buscarEmAndamento(de.id)
    if (ev) await db.ignorarEvento(ev.id, 'telegram')
    await tg.enviar(chat.id, ev ? 'Cancelado.' : 'Nada em andamento.')
    return { acao: 'cancelado' }
  }
  if (texto.startsWith('/')) { await tg.enviar(chat.id, AJUDA); return { acao: 'ajuda' } }

  return await tratarTexto(c, msg, texto)
}

// Texto digitado ou transcrito de áudio: responde à pergunta em aberto ou cria um novo gasto.
async function tratarTexto(c, msg, texto, { voz = false } = {}) {
  const esperando = await c.db.buscarEsperandoTexto(c.de.id)
  if (esperando) return await responderTexto(c, esperando, texto)
  const pergunta = interpretarPergunta(texto)
  if (pergunta) return await responderResumo(c, pergunta.texto)
  return await novoGasto(c, msg, texto, { voz })
}

// "/resumo semana", "quanto gastei em mercado este mês?": soma as compras do período, só leitura.
async function responderResumo(c, texto) {
  const { db, tg, chat, hoje } = c
  const { resto, ...periodo } = periodoDe(texto, hoje)
  const base = await db.carregarContexto()
  const filtro = filtroDe(resto, base.pessoas)
  const compras = await db.comprasPeriodo(periodo.de, periodo.ate)
  await tg.enviar(chat.id, formatarResumo(calcularResumo(compras, { ...periodo, filtro }), { ...periodo, filtro }))
  return { acao: 'resumo' }
}

// Recado de voz: a Groq transcreve, o bot mostra o que entendeu e segue como se tivesse sido digitado.
async function lerAudio(c, msg) {
  const { tg, chat, transcritor } = c
  const naoEntendi = (motivo) => tg.enviar(chat.id, `${motivo} Mande o gasto em texto, por exemplo: gastei 89,90 no mercado no nubank.`)
  if (!transcritor) { await naoEntendi('Ainda não entendo áudio.'); return { acao: 'audio_desligado' } }
  const audio = audioDe(msg)
  if (audio.duracao > MAX_AUDIO_SEGUNDOS) { await naoEntendi(`Áudio longo demais (máximo ${MAX_AUDIO_SEGUNDOS} segundos).`); return { acao: 'audio_longo' } }
  let texto = null
  try {
    const arquivo = await tg.baixarAudio(audio.id)
    if (!arquivo) { await naoEntendi('Esse áudio é grande demais ou está num formato que não aceito.'); return { acao: 'audio_invalido' } }
    texto = await transcritor.transcrever(arquivo)
  } catch (e) {
    if (ehTransitorio(e)) throw e // o Telegram reenvia o áudio
    console.error('bot: erro ao transcrever o áudio', e?.message)
  }
  if (!texto) { await naoEntendi('Não consegui entender esse áudio.'); return { acao: 'audio_ilegivel' } }
  await tg.enviar(chat.id, `🎤 Entendi: "${texto.slice(0, MAX_MENSAGEM)}"`)
  return await tratarTexto(c, msg, texto, { voz: true })
}

async function novoGasto(c, msg, texto, { voz = false } = {}) {
  const { db, tg, chat, integ, hoje } = c
  if (texto.length > MAX_MENSAGEM) { await tg.enviar(chat.id, `Mensagem longa demais (máximo ${MAX_MENSAGEM} caracteres). Resuma: valor, onde e cartão.`); return { acao: 'nao_entendi' } }
  const base = await db.carregarContexto()
  const lido = interpretarMensagem(texto, { cartoes: base.cartoes, pessoas: base.pessoas, hoje, remetente_pessoa_id: integ.pessoa_id, nomeCompleto: voz })
  return await registrarLeitura(c, msg, texto, lido, base)
}

// Parte comum do texto e da foto: confere o que foi lido, cria o evento e faz a próxima pergunta ou mostra o resumo.
async function registrarLeitura(c, msg, texto, lido, base, { confianca = 0.9, aviso = null } = {}) {
  const { db, tg, chat, integ, hoje } = c
  const problema = lido.valorAmbiguo ? 'Encontrei mais de um valor. Escreva o valor com R$ (ex.: 2 pizzas R$ 80).'
    : lido.valor == null ? 'Não encontrei o valor. Exemplo: gastei 89,90 no mercado no nubank.'
    : lido.dataInvalida ? 'Data inválida (não pode ser futura). Exemplo: 05/10 ou ontem.'
    : !lido.descricao ? 'Faltou dizer o que foi. Exemplo: 89,90 no mercado.'
    : lido.descricao.length > MAX_DESCRICAO ? `Descrição muito longa (máximo ${MAX_DESCRICAO} caracteres).`
    : lido.parcelas != null && lido.parcelas < 1 ? 'Número de parcelas inválido.' : null
  if (problema) { await tg.enviar(chat.id, problema); return { acao: 'nao_entendi' } }

  const { evento, erros } = prepararEvento({
    origem: 'telegram', id_externo: `${chat.id}:${msg.message_id}`, valor: lido.valor,
    data_evento: lido.data_evento || hoje, descricao_original: lido.descricao, parcelas: lido.parcelas ?? 1,
    forma_pagamento: lido.forma_pagamento || undefined, cartao_id: lido.cartao_id || undefined,
    pessoa_id: lido.pessoa_id || integ.pessoa_id, obs: lido.obs || undefined, confianca_origem: confianca,
  }, base)
  if (erros.length) { await tg.enviar(chat.id, `Não consegui registrar: ${erros.join(', ')}.`); return { acao: 'invalido' } }

  const ev = await db.inserirEvento({
    ...evento,
    contexto: { telegram_user_id: c.de.id, chat_id: chat.id, texto, cartao_ambiguo: lido.cartaoAmbiguo, pessoa_ambigua: lido.pessoaAmbigua },
  })
  if (!ABERTOS.includes(ev.status)) { await tg.enviar(chat.id, 'Esse lançamento já foi resolvido.'); return { acao: 'repetido' } }
  if (aviso) await tg.enviar(chat.id, aviso)
  await avancar(c, ev, base)
  return { acao: 'evento_criado', evento_id: ev.id }
}

// Foto de notinha/comprovante: a IA lê valor, local e data; a legenda (ex.: "nubank gi") completa cartão/pessoa/parcelas.
// Sai no mesmo resumo com Confirmar do texto: a leitura nunca vira compra sem o toque.
async function lerFoto(c, msg) {
  const { db, tg, chat, integ, hoje, leitor } = c
  const naoLi = (motivo) => tg.enviar(chat.id, `${motivo} Mande o gasto em texto, por exemplo: gastei 89,90 no mercado no nubank.`)
  if (!leitor) { await naoLi('Ainda não estou lendo fotos.'); return { acao: 'foto_desligada' } }
  const legenda = String(msg.caption || '').trim()
  if (legenda.length > MAX_MENSAGEM) { await naoLi(`Legenda longa demais (máximo ${MAX_MENSAGEM} caracteres).`); return { acao: 'nao_entendi' } }
  const fileId = arquivoDeImagem(msg)
  let nota = null
  try {
    const imagem = await tg.baixarArquivo(fileId)
    if (!imagem) { await naoLi('Essa imagem é grande demais ou não é jpg/png/webp.'); return { acao: 'foto_invalida' } }
    nota = await leitor.ler(imagem, hoje)
  } catch (e) {
    if (ehTransitorio(e)) throw e // o Telegram reenvia a foto
    console.error('bot: erro ao ler a foto', e?.message)
  }
  if (!nota) { await naoLi('Não consegui ler essa foto.'); return { acao: 'foto_ilegivel' } }

  const base = await db.carregarContexto()
  const lido = interpretarMensagem(legenda, { cartoes: base.cartoes, pessoas: base.pessoas, hoje, remetente_pessoa_id: integ.pessoa_id })
  if (lido.valor == null && !lido.valorAmbiguo) lido.valor = nota.valor // valor digitado na legenda vale mais que o da foto
  if (!lido.descricao) lido.descricao = nota.estabelecimento || 'Compra da notinha'
  if (!lido.data_evento && !lido.dataInvalida) lido.data_evento = nota.data
  if (lido.parcelas == null) lido.parcelas = nota.parcelas
  const aviso = `📷 Li a notinha: ${lido.descricao} — ${fmt(nota.valor)}${nota.data ? ` em ${fmtData(nota.data)}` : ''}. Confira abaixo antes de confirmar.`
  return await registrarLeitura(c, msg, legenda || '[foto]', lido, base, { confianca: 0.7, aviso })
}

async function responderTexto(c, ev, texto) {
  const { db, tg, chat, hoje } = c
  const campo = ev.contexto.esperando
  let mud = null
  if (campo === 'valor') { const v = parseValor(texto); if (v > 0) mud = { valor: v } }
  else if (campo === 'descricao') { const d = texto.trim(); if (d && d.length <= MAX_DESCRICAO) mud = { descricao_original: d } }
  else if (campo === 'data') { const d = parseData(texto, hoje); if (d?.data) mud = { data_evento: d.data } }
  else if (campo === 'parcelas') { const p = Number(texto); if (Number.isInteger(p) && p >= 1 && p <= 48) mud = { parcelas: p } }
  if (!mud) { await tg.enviar(chat.id, `Não entendi. Me diga ${CAMPOS_TEXTO[campo]}, ou /cancelar.`); return { acao: 'resposta_invalida' } }
  const base = await db.carregarContexto()
  const novo = await recalcular(c, ev, mud, base, { esperando: null })
  await avancar(c, novo, base)
  return { acao: 'campo_atualizado', campo }
}

// ---------- botões ----------
async function tratarCallback(c, cb) {
  const { db, tg, de } = c
  const [acao, eid, arg] = String(cb.data).split('|')
  const ev = await db.buscarEvento(eid)
  if (!ev || ev.contexto?.telegram_user_id !== de.id || !ABERTOS.includes(ev.status)) {
    await tg.responderCallback(cb.id, 'Esse lançamento já foi resolvido.')
    return { ignorado: 'evento_indisponivel' }
  }
  await tg.responderCallback(cb.id)
  const opcao = ev.contexto.opcoes?.[Number(arg)]
  const base = await db.carregarContexto()
  const trocar = async (mud, ctxMud = {}) => avancar(c, await recalcular(c, ev, mud, base, ctxMud), base)

  switch (acao) {
    case 'cd': // cartão
      if (arg === 's') { await perguntarForma(c, ev); return { acao: 'pergunta_forma' } }
      if (!opcao) break
      await limparTeclado(c, cb, `Cartão: ${base.cartoes.find((x) => x.id === opcao)?.nome}`)
      await trocar({ cartao_id: opcao, forma_pagamento: undefined, pago: undefined })
      return { acao: 'cartao' }
    case 'fp': { // forma sem cartão
      const forma = FORMAS[Number(arg)]?.[0]
      if (!forma) break
      await limparTeclado(c, cb, `Pagamento: ${FORMAS[Number(arg)][1]}`)
      await trocar({ cartao_id: undefined, forma_pagamento: forma })
      return { acao: 'forma' }
    }
    case 'pg':
      await limparTeclado(c, cb, arg === '1' ? 'Já pago' : 'A pagar')
      await trocar({ pago: arg === '1' })
      return { acao: 'pago' }
    case 'ps':
      if (!opcao) break
      await limparTeclado(c, cb, `Pessoa: ${nomeCurto(base.pessoas.find((x) => x.id === opcao))}`)
      await trocar({ pessoa_id: opcao })
      return { acao: 'pessoa' }
    case 'ct': { // categoria -> pergunta a subcategoria
      if (!opcao) break
      const subs = base.categorias.find((x) => x.nome === opcao)?.subcategorias || []
      await limparTeclado(c, cb, `Categoria: ${opcao}`)
      const novo = await db.atualizarEvento(ev.id, { contexto: { ...ev.contexto, categoria_tmp: opcao, opcoes: subs, pergunta: 'subcategoria' } })
      await tg.enviar(c.chat.id, `Subcategoria de ${opcao}:`, botoes(subs.map((s, i) => btn(s, 'sb', ev.id, i)), 2))
      return { acao: 'pergunta_subcategoria', evento_id: novo.id }
    }
    case 'sb': {
      if (!opcao || !ev.contexto.categoria_tmp) break
      await limparTeclado(c, cb, `Subcategoria: ${opcao}`)
      await trocar({ categoria: ev.contexto.categoria_tmp, subcategoria: opcao }, { categoria_manual: true, categoria_tmp: null })
      return { acao: 'categoria' }
    }
    case 'ok': {
      try {
        const compraId = await db.confirmarEvento(ev.id, {}, `telegram:${nomeCurto(base.pessoas.find((p) => p.id === ev.pessoa_id))}`)
        await limparTeclado(c, cb, `✅ Lançado: ${ev.descricao_original} — ${fmt(ev.valor)}`)
        return { acao: 'confirmado', compra_id: compraId }
      } catch (e) {
        await tg.enviar(c.chat.id, /já foi resolvido/.test(e.message) ? 'Esse lançamento já estava resolvido.' : `Não consegui lançar: ${e.message}`)
        return { acao: 'erro_confirmar' }
      }
    }
    case 'vi':
      if (!ev.match_compra_id) break
      await db.vincularEvento(ev.id, ev.match_compra_id, 'telegram')
      await limparTeclado(c, cb, '🔗 Vinculado à compra que já existia (nada foi duplicado).')
      return { acao: 'vinculado' }
    case 'se':
      await limparTeclado(c, cb, 'Ok, vou tratar como uma compra separada.')
      await avancar(c, await db.atualizarEvento(ev.id, { contexto: { ...ev.contexto, separado: true } }), base)
      return { acao: 'separado' }
    case 'ca':
      await db.ignorarEvento(ev.id, 'telegram')
      await limparTeclado(c, cb, '❌ Cancelado.')
      return { acao: 'cancelado' }
    case 'ed':
      await tg.enviar(c.chat.id, 'O que você quer mudar?', botoes([
        btn('Valor', 'ef', ev.id, 'valor'), btn('Descrição', 'ef', ev.id, 'descricao'), btn('Data', 'ef', ev.id, 'data'),
        btn('Parcelas', 'ef', ev.id, 'parcelas'), btn('Categoria', 'ef', ev.id, 'categoria'),
        btn('Cartão/pagamento', 'ef', ev.id, 'cartao'), btn('Pessoa', 'ef', ev.id, 'pessoa'), btn('« Voltar', 'vo', ev.id),
      ], 2))
      return { acao: 'menu_editar' }
    case 'vo':
      await avancar(c, ev, base, { forcarResumo: true })
      return { acao: 'resumo' }
    case 'ef': {
      if (CAMPOS_TEXTO[arg]) {
        await db.atualizarEvento(ev.id, { contexto: { ...ev.contexto, esperando: arg } })
        await tg.enviar(c.chat.id, `Me diga ${CAMPOS_TEXTO[arg]}. (/cancelar para desistir)`)
        return { acao: 'pergunta_texto', campo: arg }
      }
      if (arg === 'categoria') await perguntarCategoria(c, ev, base)
      else if (arg === 'cartao') await perguntarCartao(c, ev, base)
      else if (arg === 'pessoa') await perguntarPessoa(c, ev, base)
      else break
      return { acao: 'pergunta_' + arg }
    }
    default:
  }
  return { ignorado: 'callback_invalido' }
}

async function limparTeclado({ tg, chat }, cb, texto) {
  try { await tg.editar(chat.id, cb.message.message_id, texto) } catch { /* mensagem antiga: segue */ }
}

// ---------- reavaliação do evento ----------
async function recalcular(c, ev, mud, base, ctxMud = {}) {
  const manual = ev.contexto?.categoria_manual || ctxMud.categoria_manual
  const entrada = {
    origem: ev.origem, id_externo: ev.id_externo, valor: ev.valor, data_evento: ev.data_evento,
    descricao_original: ev.descricao_original, parcelas: ev.parcelas, confianca_origem: ev.confianca_origem ?? undefined,
    forma_pagamento: ev.forma_pagamento && ev.forma_pagamento !== 'cartao' ? ev.forma_pagamento : undefined,
    cartao_id: ev.cartao_id || undefined, pessoa_id: ev.pessoa_id || undefined,
    pago: typeof ev.pago === 'boolean' ? ev.pago : undefined, obs: ev.obs || undefined,
    ...(manual ? { categoria: ev.categoria, subcategoria: ev.subcategoria } : {}),
    ...mud,
  }
  const { evento, erros } = prepararEvento(entrada, base)
  if (erros.length) throw new Error(erros.join(', '))
  const { origem, id_externo, app_origem, dispositivo_id, ...campos } = evento
  return await c.db.atualizarEvento(ev.id, { ...campos, contexto: { ...ev.contexto, ...ctxMud } })
}

// ---------- próxima pergunta / resumo ----------
async function avancar(c, ev, base, { forcarResumo = false } = {}) {
  const f = ev.faltando || []
  if (!forcarResumo) {
    if (f.includes('cartao')) return await perguntarCartao(c, ev, base)
    if (f.includes('pago')) return await perguntarPago(c, ev)
    if (f.includes('pessoa')) return await perguntarPessoa(c, ev, base)
    if (f.includes('categoria')) return await perguntarCategoria(c, ev, base)
    if (ev.match_nivel !== 'nenhum' && ev.match_compra_id && !ev.contexto?.separado) return await mostrarCorrespondencia(c, ev, base)
  }
  const texto = resumo(ev, base)
  const teclado = botoes([btn('✅ Confirmar', 'ok', ev.id), btn('✏️ Editar', 'ed', ev.id), btn('❌ Cancelar', 'ca', ev.id)], 3)
  await c.tg.enviar(c.chat.id, texto, teclado)
}

async function perguntarCartao(c, ev, base) {
  const dono = base.pessoas.find((p) => p.id === (ev.pessoa_id || c.integ.pessoa_id))?.nome
  const ordem = [...base.cartoes].sort((a, b) => (b.titular === dono) - (a.titular === dono))
  const opcoes = ordem.map((x) => x.id)
  await c.db.atualizarEvento(ev.id, { contexto: { ...ev.contexto, opcoes, pergunta: 'cartao' } })
  const teclado = botoes([...ordem.map((x, i) => btn(x.nome, 'cd', ev.id, i)), btn('Sem cartão', 'cd', ev.id, 's')], 2)
  await c.tg.enviar(c.chat.id, `Qual cartão você utilizou?\n${ev.descricao_original} — ${fmt(ev.valor)}`, teclado)
}
async function perguntarForma(c, ev) {
  await c.tg.enviar(c.chat.id, 'Como foi pago?', botoes(FORMAS.map(([, nome], i) => btn(nome, 'fp', ev.id, i)), 2))
}
async function perguntarPago(c, ev) {
  await c.tg.enviar(c.chat.id, `Essa compra sem cartão já foi paga?\n${ev.descricao_original} — ${fmt(ev.valor)}`,
    botoes([btn('Sim, já paguei', 'pg', ev.id, 1), btn('Ainda não', 'pg', ev.id, 0)], 2))
}
async function perguntarPessoa(c, ev, base) {
  const opcoes = base.pessoas.map((p) => p.id)
  await c.db.atualizarEvento(ev.id, { contexto: { ...ev.contexto, opcoes, pergunta: 'pessoa' } })
  await c.tg.enviar(c.chat.id, 'De quem é esse gasto?', botoes(base.pessoas.map((p, i) => btn(nomeCurto(p), 'ps', ev.id, i)), 3))
}
async function perguntarCategoria(c, ev, base) {
  const opcoes = base.categorias.map((x) => x.nome)
  await c.db.atualizarEvento(ev.id, { contexto: { ...ev.contexto, opcoes, pergunta: 'categoria' } })
  await c.tg.enviar(c.chat.id, `Qual a categoria?\n${ev.descricao_original} — ${fmt(ev.valor)}`,
    botoes(opcoes.map((nome, i) => btn(nome, 'ct', ev.id, i)), 2))
}
async function mostrarCorrespondencia(c, ev, base) {
  const compra = await c.db.buscarCompra(ev.match_compra_id)
  if (!compra) return await avancar(c, ev, base, { forcarResumo: true })
  const titulo = ev.match_nivel === 'exato' ? 'Parece que essa compra já existe no Finapp' : 'Possível correspondência encontrada'
  await c.tg.enviar(c.chat.id,
    `${titulo}\n\nFinapp: ${compra.identificacao || compra.descricao}\n${fmt(compra.valor_total)} · ${fmtData(compra.data_compra)}\n\nAgora: ${ev.descricao_original}\n${fmt(ev.valor)} · ${fmtData(ev.data_evento)}`,
    botoes([btn('🔗 Vincular', 'vi', ev.id), btn('➕ Criar separadamente', 'se', ev.id), btn('❌ Cancelar', 'ca', ev.id)], 2))
}

function resumo(ev, base) {
  const cartao = base.cartoes.find((x) => x.id === ev.cartao_id)
  const pessoa = base.pessoas.find((p) => p.id === ev.pessoa_id)
  const pagamento = cartao ? `Cartão: ${cartao.nome}`
    : `Pagamento: ${FORMAS.find(([k]) => k === ev.forma_pagamento)?.[1] || ev.forma_pagamento}${ev.pago === true ? ' (já pago)' : ev.pago === false ? ' (a pagar)' : ''}`
  const sugerida = ev.confianca_categoria != null ? ' — sugerida pelo seu histórico' : ''
  return [
    'Nova compra',
    ev.descricao_original,
    fmt(ev.valor) + (ev.parcelas > 1 ? ` em ${ev.parcelas}x de ${fmt(ev.valor / ev.parcelas)}` : ''),
    `Categoria: ${ev.categoria} > ${ev.subcategoria}${sugerida}`,
    pagamento,
    `Pessoa: ${nomeCurto(pessoa)}`,
    `Data: ${fmtData(ev.data_evento)}`,
    ev.obs ? `Obs.: ${ev.obs}` : null,
  ].filter(Boolean).join('\n')
}
