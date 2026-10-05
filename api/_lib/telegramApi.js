// Cliente mínimo da API do Telegram. O token nunca aparece em mensagens de erro nem em logs.
export function criarTelegram(token, fetchImpl = fetch) {
  async function chamar(metodo, corpo) {
    let r
    try {
      r = await fetchImpl(`https://api.telegram.org/bot${token}/${metodo}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(corpo || {}),
        signal: AbortSignal.timeout(8000),
      })
    } catch {
      throw new Error(`Telegram ${metodo}: falha de rede`)
    }
    const j = await r.json().catch(() => ({}))
    if (!r.ok || !j.ok) throw new Error(`Telegram ${metodo}: ${j.description || r.status}`)
    return j.result
  }
  const IMAGENS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  const AUDIOS = { oga: 'audio/ogg', ogg: 'audio/ogg', opus: 'audio/ogg', mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' }
  // Baixa um arquivo enviado ao bot. Devolve { base64, mediaType, extensao } ou null se o tipo não for aceito / for grande demais.
  async function baixar(file_id, tipos, max) {
    const f = await chamar('getFile', { file_id })
    const extensao = String(f.file_path || '').split('.').pop().toLowerCase()
    const mediaType = tipos[extensao]
    if (!mediaType || (f.file_size && f.file_size > max)) return null
    let r
    try {
      r = await fetchImpl(`https://api.telegram.org/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(15000) })
    } catch {
      throw new Error('Telegram download: falha de rede')
    }
    if (!r.ok) throw new Error(`Telegram download: ${r.status}`)
    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length > max) return null
    return { base64: bytes.toString('base64'), mediaType, extensao }
  }
  const baixarArquivo = (file_id) => baixar(file_id, IMAGENS, 5 * 1024 * 1024) // foto de notinha
  const baixarAudio = (file_id) => baixar(file_id, AUDIOS, 10 * 1024 * 1024) // recado de voz
  return {
    baixarArquivo,
    baixarAudio,
    enviar: (chat_id, text, reply_markup) => chamar('sendMessage', { chat_id, text, ...(reply_markup ? { reply_markup } : {}) }),
    editar: (chat_id, message_id, text) => chamar('editMessageText', { chat_id, message_id, text, reply_markup: { inline_keyboard: [] } }),
    responderCallback: (callback_query_id, text) => chamar('answerCallbackQuery', { callback_query_id, ...(text ? { text } : {}) }),
    quemSou: () => chamar('getMe'),
    infoWebhook: () => chamar('getWebhookInfo'),
    definirWebhook: (url, secret_token) => chamar('setWebhook', { url, secret_token, allowed_updates: ['message', 'callback_query'] }),
  }
}
