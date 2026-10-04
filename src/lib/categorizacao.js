import { chaveEstabelecimento } from './estabelecimento'

// Sugestão determinística de categoria, a partir de regras aprendidas com o uso
// (tabela regras_categorizacao). Sem IA.

// Gancho para o futuro: só confirma sozinho se a regra pedir E a confiança for alta.
export const CONFIANCA_AUTO = 0.9
export const podeAutoConfirmar = (regra) => !!regra && !!regra.auto_confirmar && Number(regra.confianca) >= CONFIANCA_AUTO

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
