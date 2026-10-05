import { chaveEstabelecimento, similaridadeEstabelecimento } from './estabelecimento.js'
import { normBasico } from './normalizacao.js'

// Sugestão determinística de categoria, a partir de regras aprendidas com o uso
// (tabela regras_categorizacao). Sem IA.

// Gancho para o futuro: só confirma sozinho se a regra pedir E a confiança for alta.
export const CONFIANCA_AUTO = 0.9
export const podeAutoConfirmar = (regra) => !!regra && !!regra.auto_confirmar && Number(regra.confianca) >= CONFIANCA_AUTO


// Lançar sozinho (só para quem ligou /auto): tudo conhecido pelo histórico, nada adivinhado, valor pequeno e sem compra parecida.
export const CONFIANCA_LANCAR_SOZINHO = 0.9
export const VALOR_MAX_LANCAR_SOZINHO = 300
// Devolve o motivo (texto simples) de ainda precisar do Confirmar, ou null quando pode lançar sozinho.
export const motivoNaoLancarSozinho = (ev, { cartaoSugerido = false, ambiguo = false } = {}) => {
  if (ev.status !== 'pendente' || (ev.faltando || []).length) return 'ainda falta uma informação'
  if (ambiguo) return 'não tenho certeza do cartão ou da pessoa'
  if (cartaoSugerido) return 'o cartão foi sugerido pelo histórico (diga o cartão na mensagem)'
  if (ev.match_nivel !== 'nenhum') return 'já existe uma compra parecida no Finapp'
  if (ev.confianca_categoria == null) return 'não tenho histórico suficiente desse lugar (a categoria veio só pelo nome)'
  if (Number(ev.confianca_categoria) < CONFIANCA_LANCAR_SOZINHO) return `ainda não tenho certeza da categoria desse lugar (${Math.round(Number(ev.confianca_categoria) * 100)}%, preciso de ${Math.round(CONFIANCA_LANCAR_SOZINHO * 100)}%)`
  if (Number(ev.valor) > VALOR_MAX_LANCAR_SOZINHO) return `o valor passa de R$ ${VALOR_MAX_LANCAR_SOZINHO}`
  return null
}
export const seguroLancarSozinho = (ev, o) => motivoNaoLancarSozinho(ev, o) === null

export const categoriaValida = (categorias, categoria, subcategoria) =>
  categorias.some((c) => c.nome === categoria && (c.subcategorias || []).includes(subcategoria))

const confiancaDe = (confirmacoes, rejeicoes) => confirmacoes / (confirmacoes + 2 * rejeicoes + 1)

export function sugerirCategoria({ chave, regras = [], categorias = [] }) {
  if (!chave) return null
  const candidatas = regras
    .filter((r) => r.estabelecimento_chave === chave && categoriaValida(categorias, r.categoria, r.subcategoria))
    .sort((a, b) =>
      Number(b.confianca) - Number(a.confianca) ||
      b.confirmacoes - a.confirmacoes ||
      String(b.ultima_utilizacao || '').localeCompare(String(a.ultima_utilizacao || '')))
  const r = candidatas[0]
  if (!r) return null
  return {
    categoria: r.categoria,
    subcategoria: r.subcategoria,
    regra_id: r.id || null,
    confianca: Number(r.confianca),
    cartao_id: r.cartao_id || null,
    pessoa_id: r.pessoa_id || null,
  }
}

// Cartão que a pessoa costuma usar nesse estabelecimento, visto nas compras já lançadas.
// Só sugere com pelo menos 2 compras e 70% delas no mesmo cartão (nunca um chute com pouco histórico).
export function sugerirCartao({ chave, compras = [], indiceAliases = new Map(), cartoes = [] }) {
  if (!chave) return null
  const cont = {}
  let total = 0
  compras.forEach((c) => {
    if (!c.cartao_id || similaridadeEstabelecimento(chaveEstabelecimento(c.descricao, indiceAliases).chave, chave) < 0.8) return
    cont[c.cartao_id] = (cont[c.cartao_id] || 0) + 1
    total++
  })
  const [id, n] = Object.entries(cont).sort((a, b) => b[1] - a[1])[0] || []
  return id && total >= 2 && n / total >= 0.7 && cartoes.some((c) => c.id === id) ? id : null
}

// Sem histórico, usa o nome que a pessoa falou: "mercado" bate com a subcategoria Mercado,
// "uber" com Uber/99/Táxi. Só vale se achar exatamente uma subcategoria (nunca um chute entre várias).
export function sugerirPorNome({ chave, categorias = [] }) {
  if (!chave) return null
  const tokens = ` ${chave} `
  const achadas = []
  categorias.forEach((c) => {
    ;(c.subcategorias || []).forEach((sub) => {
      const nomes = [normBasico(sub), ...String(sub).split('/').map(normBasico)].filter(Boolean)
      if (nomes.some((n) => tokens.includes(` ${n} `))) achadas.push({ categoria: c.nome, subcategoria: sub })
    })
  })
  return achadas.length === 1 ? { ...achadas[0], regra_id: null, confianca: null, cartao_id: null, pessoa_id: null } : null
}

// Regras a partir das compras já lançadas. Quando um estabelecimento aparece em
// mais de uma categoria, as minoritárias ficam com confiança menor.
export function construirRegrasDoHistorico(compras, indiceAliases = new Map()) {
  const porChave = {}
  compras.forEach((c) => {
    if (!c.categoria || !c.subcategoria) return
    const { chave } = chaveEstabelecimento(c.descricao, indiceAliases)
    if (!chave) return
    const k = `${c.categoria}|||${c.subcategoria}`
    porChave[chave] = porChave[chave] || {}
    porChave[chave][k] = (porChave[chave][k] || 0) + 1
  })
  const regras = []
  Object.entries(porChave).forEach(([chave, opcoes]) => {
    const total = Object.values(opcoes).reduce((s, n) => s + n, 0)
    Object.entries(opcoes).forEach(([k, n]) => {
      const [categoria, subcategoria] = k.split('|||')
      const rejeicoes = total - n
      regras.push({
        estabelecimento_chave: chave, categoria, subcategoria,
        confirmacoes: n, rejeicoes, confianca: confiancaDe(n, rejeicoes),
      })
    })
  })
  return regras
}

// Usa as regras do banco; se ainda não existem, aprende na hora com o histórico.
export const regrasParaSugestao = (regrasBanco, compras, indiceAliases) =>
  regrasBanco.length ? regrasBanco : construirRegrasDoHistorico(compras, indiceAliases)
