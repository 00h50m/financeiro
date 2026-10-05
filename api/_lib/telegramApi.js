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
  const TIPOS = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }
  const MAX_ARQUIVO = 5 * 1024 * 1024
  // Baixa uma foto enviada ao bot. Devolve { base64, mediaType } ou null se não for imagem aceita / for grande demais.
  async function baixarArquivo(file_id) {
    const f = await chamar('getFile', { file_id })
    const tipo = TIPOS[String(f.file_path || '').split('.').pop().toLowerCase()]
    if (!tipo || (f.file_size && f.file_size > MAX_ARQUIVO)) return null
    let r
    try {
      r = await fetchImpl(`https://api.telegram.org/file/bot${token}/${f.file_path}`, { signal: AbortSignal.timeout(15000) })
    } catch {
      throw new Error('Telegram download: falha de rede')
    }
    if (!r.ok) throw new Error(`Telegram download: ${r.status}`)
    const bytes = Buffer.from(await r.arrayBuffer())
    if (bytes.length > MAX_ARQUIVO) return null
    return { base64: bytes.toString('base64'), mediaType: tipo }
  }
  return {
    baixarArquivo,
    enviar: (chat_id, text, reply_markup) => chamar('sendMessage', { chat_id, text, ...(reply_markup ? { reply_markup } : {}) }),
    editar: (chat_id, message_id, text) => chamar('editMessageText', { chat_id, message_id, text, reply_markup: { inline_keyboard: [] } }),
    responderCallback: (callback_query_id, text) => chamar('answerCallbackQuery', { callback_query_id, ...(text ? { text } : {}) }),
    quemSou: () => chamar('getMe'),
    infoWebhook: () => chamar('getWebhookInfo'),
    definirWebhook: (url, secret_token) => chamar('setWebhook', { url, secret_token, allowed_updates: ['message', 'callback_query'] }),
  }
}
