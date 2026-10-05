// Chamado pela Vercel (cron de domingo, ver vercel.json). A Vercel manda "Authorization: Bearer CRON_SECRET";
// sem essa variável cadastrada, ou com cabeçalho diferente, ninguém dispara os envios.
import { lerAmbiente, iguais } from './_lib/ambiente.js'
import { criarDb } from './_lib/db.js'
import { criarTelegram } from './_lib/telegramApi.js'
import { enviarResumosSemanais } from './_lib/resumoSemanal.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end()
  const segredo = process.env.CRON_SECRET
  if (!segredo) return res.status(503).json({ ok: false, faltando: ['CRON_SECRET'] })
  if (!iguais(req.headers.authorization, `Bearer ${segredo}`)) return res.status(401).end()
  const amb = lerAmbiente()
  if (amb.faltando.length) return res.status(503).json({ ok: false, faltando: amb.faltando })
  try {
    const r = await enviarResumosSemanais({ db: criarDb({ url: amb.url, serviceKey: amb.serviceKey }), tg: criarTelegram(amb.token) })
    return res.status(200).json({ ok: true, ...r })
  } catch (e) {
    console.error('cron-resumo: erro', e.message)
    return res.status(500).json({ ok: false })
  }
}
