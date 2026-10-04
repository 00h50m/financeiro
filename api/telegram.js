// Webhook do bot do Telegram. Segurança, em ordem:
//   1. só POST;  2. o Telegram envia um segredo no cabeçalho (definido ao registrar o webhook);
//   3. o bot só atende quem foi pareado (telegram_user_id -> pessoa);  4. cada update_id só uma vez.
import { lerAmbiente, iguais } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarTelegram } from './_lib/telegramApi.js'
import { processarUpdate } from './_lib/bot.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (amb.faltando.length) return res.status(503).json({ ok: false })
  if (!iguais(req.headers['x-telegram-bot-api-secret-token'], amb.segredo)) return res.status(401).end()

  const update = req.body
  if (!update || typeof update !== 'object' || !Number.isInteger(update.update_id)) return res.status(400).end()
  try {
    await processarUpdate(update, { db: criarDb({ url: amb.url, serviceKey: amb.serviceKey }), tg: criarTelegram(amb.token) })
    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('telegram: erro ao processar update', e.message) // nunca o conteúdo da mensagem
    return res.status(500).json({ ok: false })
  }
}
