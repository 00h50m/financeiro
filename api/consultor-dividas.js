// Consultor de dívidas com IA (tela Plano de dívidas). Exige usuário logado (token do Supabase Auth no cabeçalho Authorization).
// O corpo traz o contexto já calculado pelo app e, opcionalmente, uma pergunta ("e se eu cortar R$ 300 de lazer?").
import { lerAmbiente } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarConsultor, MAX_CONTEXTO } from './_lib/consultorDividas.js'

export default async function handler(req, res, { consultor } = {}) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (!amb.url || !amb.serviceKey) return res.status(503).json({ ok: false, erro: 'Servidor sem configuração do banco.' })

  const db = criarDb({ url: amb.url, serviceKey: amb.serviceKey })
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data, error } = jwt ? await db.sb.auth.getUser(jwt) : { error: true }
  if (error || !data?.user) return res.status(401).json({ ok: false, erro: 'login necessário' })

  if (!amb.anthropicKey && !consultor) return res.status(503).json({ ok: false, erro: 'O consultor ainda não está ligado (falta a chave da Anthropic na Vercel).' })
  const contexto = req.body?.contexto
  if (!contexto || typeof contexto !== 'object' || !Array.isArray(contexto.dividas)) return res.status(400).json({ ok: false, erro: 'Faltam os dados das dívidas.' })
  if (JSON.stringify(contexto).length > MAX_CONTEXTO) return res.status(413).json({ ok: false, erro: 'Dados grandes demais.' })
  const pergunta = typeof req.body?.pergunta === 'string' ? req.body.pergunta.trim() : ''

  try {
    const c = consultor || criarConsultor(amb.anthropicKey)
    if (pergunta) {
      const r = await c.perguntar(contexto, pergunta)
      return r ? res.status(200).json({ ok: true, tipo: 'resposta', ...r }) : res.status(422).json({ ok: false, erro: 'Não consegui responder essa pergunta. Tente reescrever.' })
    }
    const plano = await c.plano(contexto)
    return plano ? res.status(200).json({ ok: true, tipo: 'plano', plano }) : res.status(422).json({ ok: false, erro: 'Não consegui montar o plano agora. Tente de novo.' })
  } catch (e) {
    console.error('consultor-dividas:', e?.message)
    return res.status(502).json({ ok: false, erro: 'O consultor não respondeu agora. Tente de novo em instantes.' })
  }
}
