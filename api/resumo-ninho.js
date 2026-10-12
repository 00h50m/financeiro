// Resumo do mês para o Ninho (app da casa). Só leitura. O servidor do Ninho manda "Authorization: Bearer NINHO_RESUMO_TOKEN";
// sem essa variável cadastrada aqui, ou com cabeçalho diferente, nada é devolvido.
import { iguais } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { resumoParaNinho } from './_lib/resumoNinho.js'
import { hojeSP } from '../src/lib/utils.js'

export default async function handler(req, res, { agora = () => new Date(), db: dbTeste } = {}) {
  if (req.method !== 'GET') return res.status(405).end()
  const segredo = process.env.NINHO_RESUMO_TOKEN
  if (!segredo || segredo.length < 24) return res.status(503).json({ ok: false, faltando: ['NINHO_RESUMO_TOKEN'] })
  if (!iguais(req.headers.authorization, `Bearer ${segredo}`)) return res.status(401).end()
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  if (!dbTeste && (!url || !process.env.SUPABASE_SERVICE_ROLE_KEY)) return res.status(503).json({ ok: false, faltando: ['SUPABASE_SERVICE_ROLE_KEY'] })
  try {
    const db = dbTeste || criarDb({ url, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY })
    const resumo = resumoParaNinho(await db.dadosResumoMensal(), hojeSP(agora()))
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ ok: true, resumo })
  } catch (e) {
    console.error('resumo-ninho: erro', e.message)
    return res.status(500).json({ ok: false })
  }
}
