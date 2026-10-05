// Ações de administração do bot, chamadas pela tela Automações do Finapp.
// Exigem um usuário logado (token do Supabase Auth no cabeçalho Authorization).
import { lerAmbiente } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarTelegram } from './_lib/telegramApi.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (!amb.url || !amb.serviceKey) return res.status(503).json({ ok: false, faltando: amb.faltando })

  const db = criarDb({ url: amb.url, serviceKey: amb.serviceKey })
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data, error } = jwt ? await db.sb.auth.getUser(jwt) : { error: true }
  if (error || !data?.user) return res.status(401).json({ ok: false, erro: 'login necessário' })

  const { acao, integracao_id } = req.body || {}
  if (acao === 'status' && amb.faltando.length) return res.status(200).json({ ok: true, configurado: false, faltando: amb.faltando })
  if (amb.faltando.length) return res.status(503).json({ ok: false, faltando: amb.faltando })
  const tg = criarTelegram(amb.token)

  try {
    if (acao === 'status') {
      const [eu, wh] = await Promise.all([tg.quemSou(), tg.infoWebhook()])
      // Repete o primeiro acesso ao banco que o webhook faz, para mostrar o motivo quando ele falha (só para quem está logado).
      let banco_erro = null
      try { await db.registrarUpdate(-1, 0); await db.esquecerUpdate(-1) } catch (e) { banco_erro = e.message }
      return res.status(200).json({
        ok: true, configurado: true, bot: eu.username, webhook_ativo: !!wh.url, webhook_url: wh.url || null,
        pendentes_telegram: wh.pending_update_count || 0, ultimo_erro: wh.last_error_message || null,
        banco_erro,
      })
    }
    if (acao === 'configurar') {
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const base = amb.appUrl || `https://${host}`
      await tg.definirWebhook(`${base.replace(/\/$/, '')}/api/telegram`, amb.segredo)
      return res.status(200).json({ ok: true, webhook_url: `${base.replace(/\/$/, '')}/api/telegram` })
    }
    if (acao === 'testar') {
      const r = await db.sb.from('integracoes_telegram').select('chat_id').eq('id', integracao_id).maybeSingle()
      if (!r.data) return res.status(404).json({ ok: false, erro: 'integração não encontrada' })
      await tg.enviar(r.data.chat_id, '✅ Teste do Finapp: o bot está funcionando.')
      return res.status(200).json({ ok: true })
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' })
  } catch (e) {
    console.error('telegram-admin:', e.message)
    return res.status(502).json({ ok: false, erro: e.message })
  }
}
