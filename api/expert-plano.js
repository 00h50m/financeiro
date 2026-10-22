// Expert de mudança financeira (aba Meu plano). Exige usuário logado (token do Supabase Auth no cabeçalho Authorization).
// O corpo traz o contexto já calculado pelo app. Devolve o plano validado; quem grava o histórico é o app.
import { lerAmbiente } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarExpert, MAX_CONTEXTO } from './_lib/expertPlano.js'

export default async function handler(req, res, { expert } = {}) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (!amb.url || !amb.serviceKey) return res.status(503).json({ ok: false, erro: 'Servidor sem configuração do banco.' })

  const db = criarDb({ url: amb.url, serviceKey: amb.serviceKey })
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data, error } = jwt ? await db.sb.auth.getUser(jwt) : { error: true }
  if (error || !data?.user) return res.status(401).json({ ok: false, erro: 'login necessário' })

  if (!amb.anthropicKey && !expert) return res.status(503).json({ ok: false, erro: 'O expert ainda não está ligado (falta a chave da Anthropic na Vercel).' })
  const contexto = req.body?.contexto
  if (!contexto || typeof contexto !== 'object' || !Array.isArray(contexto.meses)) return res.status(400).json({ ok: false, erro: 'Faltam os dados do mês.' })
  if (JSON.stringify(contexto).length > MAX_CONTEXTO) return res.status(413).json({ ok: false, erro: 'Dados grandes demais.' })

  try {
    const plano = await (expert || criarExpert(amb.anthropicKey)).plano(contexto)
    return plano ? res.status(200).json({ ok: true, plano }) : res.status(422).json({ ok: false, erro: 'Não consegui montar o plano agora. Tente de novo.' })
  } catch (e) {
    console.error('expert-plano:', e?.message)
    return res.status(502).json({ ok: false, erro: 'O expert não respondeu agora. Tente de novo em instantes.' })
  }
}
