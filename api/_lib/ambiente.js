import crypto from 'node:crypto'

// Variáveis de ambiente obrigatórias (nomes, nunca valores, podem aparecer em respostas).
export const NECESSARIAS = ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET', 'SUPABASE_SERVICE_ROLE_KEY']

export function lerAmbiente(env = process.env) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const faltando = [...NECESSARIAS.filter((k) => !env[k]), ...(url ? [] : ['SUPABASE_URL'])]
  return {
    faltando,
    url,
    token: env.TELEGRAM_BOT_TOKEN,
    segredo: env.TELEGRAM_WEBHOOK_SECRET,
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY,
    appUrl: env.APP_URL || null,
    anthropicKey: env.ANTHROPIC_API_KEY || null, // opcional: sem ela, o bot só não lê fotos
  }
}

// Comparação em tempo constante (evita descobrir o segredo pelo tempo de resposta).
export function iguais(a, b) {
  const h = (x) => crypto.createHash('sha256').update(String(x ?? '')).digest()
  return crypto.timingSafeEqual(h(a), h(b))
}
