// Lê o texto da notificação de compra de um app de banco (ex.: Nubank) e devolve o que o Finapp precisa.
// Determinístico e conservador: o que não parece compra aprovada (recusada, estorno, pix, promoção) é ignorado.
import { normBasico } from './normalizacao.js'

const VALOR = /R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)/i
const paraNumero = (s) => Number(s.replace(/\./g, '').replace(',', '.'))
const limpar = (s) => String(s || '').replace(/\s+/g, ' ').trim()

// { app, titulo, texto } -> { valor, estabelecimento, final } ou { ignorar: motivo }
export function lerNotificacao({ app = '', titulo = '', texto = '' }) {
  const corpo = limpar(texto)
  const tudo = normBasico(`${titulo} ${corpo}`)
  if (!corpo) return { ignorar: 'vazia' }
  if (/recusad|negad|nao aprovad|estorn|cancelad|reembols|devolu|pix|transfer|fatura fechou|fatura venceu|boleto/.test(tudo)) return { ignorar: 'nao_e_compra' }
  if (!/compra|pagamento|comprou|debito|credito/.test(tudo)) return { ignorar: 'nao_e_compra' }
  const v = corpo.match(VALOR)
  if (!v) return { ignorar: 'sem_valor' }
  const valor = paraNumero(v[1])
  if (!(valor > 0)) return { ignorar: 'sem_valor' }
  // "Compra de R$ 19,90 APROVADA em MP *MELIMAIS para o cartão com final 9017."
  const final = corpo.match(/final\s*(\d{4})/i)?.[1] || null
  let local = corpo.match(/\b(?:aprovada|realizada|efetuada)\s+(?:em|no|na)\s+(.+?)(?:\s+para\s+o\s+cart|\s+no\s+cart|\s+com\s+final|\.\s|\.$|$)/i)?.[1]
    || corpo.match(/\b(?:em|no|na)\s+(.+?)(?:\s+para\s+o\s+cart|\s+no\s+cart|\s+com\s+final|\.\s|\.$|$)/i)?.[1]
  local = limpar(local).replace(/[.\s]+$/, '').slice(0, 80)
  if (!local) return { ignorar: 'sem_local' }
  return { valor, estabelecimento: local, final, app: limpar(app).slice(0, 40) }
}

// Cartão pelo nome do app (ex.: app "Nubank" -> cartão "Nubank"). Com vários, prefere o da própria pessoa; sem certeza, null.
export function cartaoDaNotificacao(app, cartoes, pessoa) {
  const a = normBasico(app)
  if (!a) return null
  const dobra = cartoes.filter((c) => c.ativo !== false && (normBasico(c.nome).includes(a) || a.includes(normBasico(c.nome))))
  if (dobra.length === 1) return dobra[0]
  const nomePessoa = normBasico(pessoa?.nome || '')
  const dela = dobra.filter((c) => nomePessoa && normBasico(c.titular) === nomePessoa)
  return dela.length === 1 ? dela[0] : null
}
