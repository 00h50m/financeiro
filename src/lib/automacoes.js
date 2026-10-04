import { sb } from './supabase.js'

// Chama as funções de servidor de administração do bot (api/telegram-admin.js), levando o login atual.
export async function chamarAdminTelegram(acao, extra = {}) {
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  let r
  try {
    r = await fetch('/api/telegram-admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ acao, ...extra }),
    })
  } catch {
    return { ok: false, indisponivel: true }
  }
  const tipo = r.headers.get('content-type') || ''
  if (!tipo.includes('json')) return { ok: false, indisponivel: true } // ex.: `npm run dev` não tem /api
  return { status: r.status, ...(await r.json()) }
}
