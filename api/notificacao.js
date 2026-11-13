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

// Modo "só Inbox": a notificação vira um lançamento pendente no Inbox do app, sem mandar nada no Telegram e sem lançar sozinha.
// Quem toca no Confirmar é a pessoa, no app. O Telegram só entra se a pessoa escolher (Automações › notificações › Perguntar no Telegram).
const tgMudo = new Proxy({}, { get: () => async () => ({ message_id: 0, ok: true, result: { message_id: 0 } }) })

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  // Só o banco é obrigatório: o Telegram é opcional (modo "só Inbox"), então a falta das variáveis do bot não derruba mais a leitura.
  if (!amb.url || !amb.serviceKey) return res.status(503).json({ ok: false })
  const corpo = await lerCorpo(req)
  if (!corpo || typeof corpo !== 'object') return res.status(400).json({ ok: false, erro: 'corpo inválido' })
  // O MacroDroid nem sempre deixa mexer no cabeçalho: o token também pode ir no corpo.
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim() || String(req.headers['x-token'] || corpo.token || '').trim()
  if (!token) return res.status(401).json({ ok: false })
  const ehTeste = corpo.teste === true || String(corpo.teste || '').toLowerCase() === 'true'
  const notificacao = { app: corte(corpo.app ?? corpo.aplicativo, 60), titulo: corte(corpo.titulo ?? corpo.title, 200), texto: corte(corpo.texto ?? corpo.text, 600) }
  if (!notificacao.texto && !ehTeste) return res.status(400).json({ ok: false, erro: 'sem texto' })

  try {
    const db = deps.db || criarDb({ url: amb.url, serviceKey: amb.serviceKey })
    const dispositivo = await db.dispositivoPorHash(await hashToken(token))
    if (!dispositivo) return res.status(401).json({ ok: false })
    // "Testar conexão" do app: só confirma que o endereço e o token funcionam (e marca o celular como visto); não cria lançamento.
    if (ehTeste) { await db.tocarDispositivo?.(dispositivo.id); return res.status(200).json({ ok: true, teste: true }) }
    const permitidos = dispositivo.apps_permitidos || []
    if (permitidos.length && !permitidos.some((a) => a.toLowerCase() === notificacao.app.toLowerCase())) return res.status(200).json({ ok: true, ignorado: 'app_nao_permitido' })
    const config = typeof db.configMapa === 'function' ? await db.configMapa().catch(() => ({})) : {}
    const querTelegram = String(config?.notificacao_modo || 'inbox') === 'telegram' && !!amb.token
    const integ = querTelegram ? await db.integracaoDaPessoa(dispositivo.pessoa_id) : null
    db.tocarDispositivo(dispositivo.id)?.catch?.(() => {})
    // Sem Telegram (modo Inbox, ou Telegram escolhido mas não conectado): a leitura fica no Inbox, sem mensagem e sem lançamento automático.
    const soInbox = !integ
    const r = await lancarNotificacao({
      db, tg: soInbox ? tgMudo : (deps.tg || criarTelegram(amb.token)),
      integ: integ || { pessoa_id: dispositivo.pessoa_id, chat_id: null, telegram_user_id: null, auto_lancar: false },
      dispositivo, notificacao, quando: corte(corpo.quando ?? corpo.hora, 40) || new Date().toISOString().slice(0, 16),
      agora: deps.agora, appUrl: amb.appUrl,
    })
    return res.status(200).json({ ok: true, ...(r.ignorado ? { ignorado: r.ignorado } : { acao: r.acao, destino: soInbox ? 'inbox' : 'telegram' }) })
  } catch (e) {
    console.error('notificacao: erro', e?.message) // nunca o texto da notificação
    return res.status(500).json({ ok: false })
  }
}
