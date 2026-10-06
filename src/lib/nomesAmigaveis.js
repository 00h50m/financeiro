import { chaveEstabelecimento, similaridadeEstabelecimento } from './estabelecimento.js'
import { normNome, normBasico } from './normalizacao.js'

// Nome "de gente" para o que vem na fatura ("IFOOD *IFOOD" -> "iFood"). É só uma SUGESTÃO para o campo
// Identificação: o texto original da fatura continua guardado e visível; quem decide é a pessoa.

// chave do estabelecimento (ver estabelecimento.js) -> como se escreve
const MARCAS = {
  ifood: 'iFood', 'uber eats': 'Uber Eats', uber: 'Uber', rappi: 'Rappi', 'ze delivery': 'Zé Delivery',
  'mercado livre': 'Mercado Livre', mercadolivre: 'Mercado Livre', amazon: 'Amazon', 'amazon prime': 'Amazon Prime',
  shopee: 'Shopee', aliexpress: 'AliExpress', magalu: 'Magalu', 'magazine luiza': 'Magalu', americanas: 'Americanas',
  netflix: 'Netflix', spotify: 'Spotify', 'disney plus': 'Disney+', 'prime video': 'Prime Video', youtube: 'YouTube',
  google: 'Google', apple: 'Apple', microsoft: 'Microsoft', steam: 'Steam', playstation: 'PlayStation',
  drogasil: 'Drogasil', 'droga raia': 'Droga Raia', raia: 'Droga Raia', pacheco: 'Drogaria Pacheco', 'pague menos': 'Pague Menos',
  petz: 'Petz', cobasi: 'Cobasi', renner: 'Renner', riachuelo: 'Riachuelo', zara: 'Zara', shein: 'Shein',
  carrefour: 'Carrefour', extra: 'Extra', 'pao de acucar': 'Pão de Açúcar', assai: 'Assaí', atacadao: 'Atacadão',
  'posto ipiranga': 'Posto Ipiranga', shell: 'Shell', outback: 'Outback', mcdonalds: "McDonald's", 'burger king': 'Burger King',
}

const maiusculas = (t) => t === t.toUpperCase() && /[A-ZÀ-Ú]/.test(t)

// Primeira palavra(s) da chave que batem com uma marca conhecida (a mais longa vale).
function marcaDaChave(chave) {
  const tokens = chave.split(' ')
  for (let n = Math.min(tokens.length, 3); n >= 1; n--) {
    const nome = MARCAS[tokens.slice(0, n).join(' ')]
    if (nome) return nome
  }
  return null
}

// descricao: texto como veio da fatura. compras: já lançadas (com identificacao). aliases: tabela estabelecimento_aliases.
// Devolve { nome, fonte } ou null (quando não há nada melhor que o texto original).
export function sugerirIdentificacao({ descricao, compras = [], indiceAliases = new Map() }) {
  const { chave, nome: nomeAlias } = chaveEstabelecimento(descricao, indiceAliases)
  if (!chave) return null

  // 1) a pessoa já deu um nome a esse mesmo texto (ou a um parecido): reaproveita o mais usado
  const exato = normNome(descricao)
  const contagem = {}
  for (const c of compras) {
    if (!c.identificacao) continue
    const mesmoTexto = normNome(c.descricao) === exato
    if (!mesmoTexto && similaridadeEstabelecimento(chaveEstabelecimento(c.descricao, indiceAliases).chave, chave) < 0.95) continue
    contagem[c.identificacao] = (contagem[c.identificacao] || 0) + (mesmoTexto ? 2 : 1)
  }
  const [maisUsado] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0] || []
  if (maisUsado) return { nome: maisUsado, fonte: 'historico' }

  // 2) nome de exibição cadastrado em estabelecimento_aliases
  if (nomeAlias) return { nome: nomeAlias, fonte: 'cadastro' }

  // 3) marca conhecida
  const marca = marcaDaChave(chave)
  if (marca && marca.toLowerCase() !== String(descricao).trim().toLowerCase()) return { nome: marca, fonte: 'marca' }

  // 4) texto todo em maiúsculas e com várias palavras vira "Primeira Letra Maiúscula" (mantendo acentos);
  //    palavra única colada ("PADARIAJOSE") não é mexida
  const letras = (t) => normBasico(t).replace(/[^a-z]/g, '')
  const noNome = new Set(chave.split(' '))
  const palavras = String(descricao).split(/[\s*]+/).filter((p) => noNome.has(letras(p)))
    .filter((p, i, l) => i === 0 || letras(p) !== letras(l[i - 1]))
  if (palavras.length >= 2 && maiusculas(String(descricao).replace(/[^A-Za-zÀ-ú]/g, ''))) {
    return { nome: palavras.map((p) => p[0].toUpperCase() + p.slice(1).toLowerCase()).join(' '), fonte: 'formato' }
  }
  return null
}
