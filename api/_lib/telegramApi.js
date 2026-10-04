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
  return {
    enviar: (chat_id, text, reply_markup) => chamar('sendMessage', { chat_id, text, ...(reply_markup ? { reply_markup } : {}) }),
    editar: (chat_id, message_id, text) => chamar('editMessageText', { chat_id, message_id, text, reply_markup: { inline_keyboard: [] } }),
    responderCallback: (callback_query_id, text) => chamar('answerCallbackQuery', { callback_query_id, ...(text ? { text } : {}) }),
    quemSou: () => chamar('getMe'),
    infoWebhook: () => chamar('getWebhookInfo'),
    definirWebhook: (url, secret_token) => chamar('setWebhook', { url, secret_token, allowed_updates: ['message', 'callback_query'] }),
  }
}
