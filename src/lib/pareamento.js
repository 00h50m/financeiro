// Código de uso único para conectar Telegram / Android. O navegador gera o código e guarda só o
// hash no banco; o servidor confere o hash. Alfabeto sem 0/O/1/I para não confundir ao digitar.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const normalizarCodigo = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')

export function gerarCodigo(tamanho = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(tamanho))
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('')
}

export const formatarCodigo = (c) => c.replace(/(.{4})(?=.)/g, '$1-')

export async function hashCodigo(codigo) {
  const dados = new TextEncoder().encode(normalizarCodigo(codigo))
  const h = await crypto.subtle.digest('SHA-256', dados)
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('')
}
