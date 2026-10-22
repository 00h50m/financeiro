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

// Manda o PDF da fatura (base64) para api/ler-fatura.js e devolve { ok, linhas, cartao, totalFatura, descartadas } ou { ok: false, erro }.
export async function lerFaturaPdf(pdfBase64) {
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  let r
  try {
    r = await fetch('/api/ler-fatura', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ pdf: pdfBase64 }),
    })
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor. Tente de novo.' }
  }
  const tipo = r.headers.get('content-type') || ''
  if (!tipo.includes('json')) return { ok: false, erro: 'Leitura de PDF indisponível aqui (só funciona no site publicado).' }
  const j = await r.json()
  return j.ok ? j : { ok: false, erro: j.erro || 'Não consegui ler o PDF.' }
}

// Pede ao consultor de dívidas (api/consultor-dividas.js) um plano ou a resposta de um "e se...". -> { ok, tipo, plano | resposta, impacto } ou { ok: false, erro }.
export async function pedirConsultorDividas(contexto, pergunta = '') {
  const { data } = await sb.auth.getSession()
  const token = data.session?.access_token
  let r
  try {
    r = await fetch('/api/consultor-dividas', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ contexto, pergunta }),
    })
  } catch {
    return { ok: false, erro: 'Sem conexão com o servidor. Tente de novo.' }
  }
  const tipo = r.headers.get('content-type') || ''
  if (!tipo.includes('json')) return { ok: false, erro: 'O consultor só funciona no site publicado.' }
  const j = await r.json()
  return j.ok ? j : { ok: false, erro: j.erro || 'Não consegui falar com o consultor.' }
}
