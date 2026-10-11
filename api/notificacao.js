// Recebe a notificação de compra do celular Android (app de automação como o MacroDroid) e manda o Confirmar para o Telegram.
// Segurança: só POST; o celular manda o token gerado por /android no bot (no banco fica só o hash); token revogado não vale.
import { lerAmbiente } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarTelegram } from './_lib/telegramApi.js'
import { lancarNotificacao } from './_lib/bot.js'
import { hashToken } from './_lib/tokenAndroid.js'
import { lerCorpo } from './_lib/corpoNotificacao.js'

// Corpo lido aqui (tolerante a aspas no texto da notificação), não pela plataforma.
export const config = { api: { bodyParser: false } }

const corte = (v, n) => String(v ?? '').slice(0, n)

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (amb.faltando.length) return res.status(503).json({ ok: false })
  const corpo = await lerCorpo(req)
  if (!corpo || typeof corpo !== 'object') return res.status(400).json({ ok: false, erro: 'corpo inválido' })
  // O MacroDroid nem sempre deixa mexer no cabeçalho: o token também pode ir no corpo.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || String(req.headers['x-token'] || corpo.token || '').trim()
  if (!token) return res.status(401).json({ ok: false })
  const notificacao = { app: corte(corpo.app ?? corpo.aplicativo, 60), titulo: corte(corpo.titulo ?? corpo.title, 200), texto: corte(corpo.texto ?? corpo.text, 600) }
  if (!notificacao.texto) return res.status(400).json({ ok: false, erro: 'sem texto' })

  try {
    const db = deps.db || criarDb({ url: amb.url, serviceKey: amb.serviceKey })
    const dispositivo = await db.dispositivoPorHash(await hashToken(token))
    if (!dispositivo) return res.status(401).json({ ok: false })
    const permitidos = dispositivo.apps_permitidos || []
    if (permitidos.length && !permitidos.some((a) => a.toLowerCase() === notificacao.app.toLowerCase())) return res.status(200).json({ ok: true, ignorado: 'app_nao_permitido' })
    const integ = await db.integracaoDaPessoa(dispositivo.pessoa_id)
    if (!integ) return res.status(409).json({ ok: false, erro: 'Telegram não conectado' })
    db.tocarDispositivo(dispositivo.id)?.catch?.(() => {})
    const r = await lancarNotificacao({
      db, tg: deps.tg || criarTelegram(amb.token), integ, dispositivo, notificacao, quando: corte(corpo.quando ?? corpo.hora, 40) || new Date().toISOString().slice(0, 16),
      agora: deps.agora, appUrl: amb.appUrl,
    })
    return res.status(200).json({ ok: true, ...(r.ignorado ? { ignorado: r.ignorado } : { acao: r.acao }) })
  } catch (e) {
    console.error('notificacao: erro', e?.message) // nunca o texto da notificação
    return res.status(500).json({ ok: false })
  }
}
