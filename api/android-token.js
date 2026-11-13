// Conectar o celular Android pelo app (Automações): gera o token das notificações do banco sem precisar do Telegram.
// Exige usuário logado (token do Supabase Auth no cabeçalho Authorization). O token aparece UMA vez; no banco fica só o hash.
import { lerAmbiente } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { gerarTokenAndroid, hashToken } from './_lib/tokenAndroid.js'

export default async function handler(req, res, deps = {}) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (!amb.url || !amb.serviceKey) return res.status(503).json({ ok: false, erro: 'Falta configurar o servidor (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel).' })
  const db = deps.db || criarDb({ url: amb.url, serviceKey: amb.serviceKey })
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const autenticar = deps.autenticar || (async (t) => { const { data, error } = t ? await db.sb.auth.getUser(t) : { error: true }; return !error && !!data?.user })
  if (!(await autenticar(jwt))) return res.status(401).json({ ok: false, erro: 'login necessário' })

  const { acao, pessoa_id, nome } = req.body || {}
  try {
    if (acao === 'revogar') {
      if (!pessoa_id) return res.status(400).json({ ok: false, erro: 'pessoa_id obrigatório' })
      await db.revogarDispositivos(pessoa_id)
      return res.status(200).json({ ok: true })
    }
    if (acao === 'gerar') {
      if (!pessoa_id) return res.status(400).json({ ok: false, erro: 'pessoa_id obrigatório' })
      const token = gerarTokenAndroid()
      await db.revogarDispositivos(pessoa_id) // um celular por vez: gerar de novo desconecta o anterior (começar do zero)
      await db.criarDispositivo({ pessoa_id, nome: String(nome || 'Celular Android').slice(0, 60), token_hash: await hashToken(token) })
      return res.status(200).json({ ok: true, token })
    }
    return res.status(400).json({ ok: false, erro: 'ação desconhecida' })
  } catch (e) {
    console.error('android-token:', e?.message)
    return res.status(500).json({ ok: false, erro: /dispositivos_android/.test(e?.message || '') ? 'Falta rodar o arquivo inbox/04_telegram_android.sql no Supabase.' : 'Não consegui gerar o token agora.' })
  }
}
