// Lê o PDF da fatura (tela Importar fatura). Exige usuário logado (token do Supabase Auth no cabeçalho Authorization).
// O PDF chega em base64 no corpo; a Vercel aceita até ~4,5 MB por requisição.
import { lerAmbiente } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarLeitorFatura } from './_lib/leitorFatura.js'
import { hojeSP } from '../src/lib/utils.js'

const MAX_BASE64 = 4_300_000

export default async function handler(req, res, { leitor } = {}) {
  if (req.method !== 'POST') return res.status(405).end()
  const amb = lerAmbiente()
  if (!amb.url || !amb.serviceKey) return res.status(503).json({ ok: false, erro: 'Servidor sem configuração do banco.' })

  const db = criarDb({ url: amb.url, serviceKey: amb.serviceKey })
  const jwt = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const { data, error } = jwt ? await db.sb.auth.getUser(jwt) : { error: true }
  if (error || !data?.user) return res.status(401).json({ ok: false, erro: 'login necessário' })

  if (!amb.anthropicKey && !leitor) return res.status(503).json({ ok: false, erro: 'A leitura de PDF ainda não está ligada (falta a chave da Anthropic na Vercel).' })
  const pdf = req.body?.pdf
  if (typeof pdf !== 'string' || !pdf) return res.status(400).json({ ok: false, erro: 'Envie o PDF da fatura.' })
  if (pdf.length > MAX_BASE64) return res.status(413).json({ ok: false, erro: 'PDF grande demais (limite de uns 3 MB). Tente um PDF menor.' })

  try {
    const lido = await (leitor || criarLeitorFatura(amb.anthropicKey)).ler(pdf, hojeSP())
    if (!lido) return res.status(422).json({ ok: false, erro: 'Não consegui ler lançamentos nesse PDF. Confira se é a fatura do cartão.' })
    return res.status(200).json({ ok: true, ...lido })
  } catch (e) {
    console.error('ler-fatura:', e?.message)
    return res.status(502).json({ ok: false, erro: 'Não consegui ler o PDF agora. Tente de novo em instantes.' })
  }
}
