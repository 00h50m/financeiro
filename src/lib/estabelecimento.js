import { normHistorico, limparDescricao } from './normalizacao.js'

// Chave de comparação de um estabelecimento. Nunca substitui o texto original:
// "IFOOD *IFOOD", "IFOOD.COM" e "PG *IFOOD" viram a mesma chave ("ifood").

const INTERMEDIARIOS = new Set(['pg', 'pag', 'mp', 'ec', 'zp', 'sumup', 'paypal', 'pagseguro', 'mercadopago', 'picpay'])
const RUIDO = new Set(['ltda', 'sa', 'me', 'epp', 'eireli', 'www', 'com', 'br', 'brasil'])

// aliases: linhas da tabela estabelecimento_aliases ({ alias, chave, nome_exibicao }).
export function indexarAliases(aliases = []) {
  return new Map(aliases.map((a) => [a.alias, a]))
}

export function chaveEstabelecimento(texto, indice = new Map()) {
  const base = normHistorico(limparDescricao(texto)).replace(/[^a-z\s]/g, ' ')
  let tokens = base.split(/\s+/).filter(Boolean)
  while (tokens.length > 1 && INTERMEDIARIOS.has(tokens[0])) tokens = tokens.slice(1)
  const semRuido = tokens.filter((t) => !RUIDO.has(t))
  if (semRuido.length) tokens = semRuido
  tokens = tokens.filter((t, i) => t !== tokens[i - 1])
  const bruta = tokens.join(' ')
  const alias = indice.get(bruta)
  return { chave: alias ? alias.chave : bruta, nome: alias ? alias.nome_exibicao : null }
}

// 0 a 1: quão provável é que duas chaves sejam o mesmo estabelecimento.
export function similaridadeEstabelecimento(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return 0.95
  const ta = a.split(' ')
  const tb = b.split(' ')
  const [menor, maior] = ta.length <= tb.length ? [ta, tb] : [tb, ta]
  if (menor.every((t) => maior.includes(t))) return 0.8
  const jaccard = menor.filter((t) => maior.includes(t)).length / new Set([...ta, ...tb]).size
  return jaccard >= 0.5 ? Math.round(jaccard * 80) / 100 : 0
}
