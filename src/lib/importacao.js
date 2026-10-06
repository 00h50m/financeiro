import { chaveEstabelecimento, indexarAliases } from './estabelecimento.js'
import { construirRegrasDoHistorico, sugerirCategoria, sugerirPorNome, categoriaValida } from './categorizacao.js'
import { pontuar } from './reconciliacao.js'
import { normBasico, normNome, round2 } from './normalizacao.js'
import { sugerirIdentificacao } from './nomesAmigaveis.js'

// Inteligência da importação de fatura (CSV): reconhecer o que já está lançado, sugerir categoria e nome.
// Tudo puro e testável; a tela só mostra o resultado.

const TOLERANCIA_VALOR = 0.02

// modo: 'parcela' = a coluna valor do CSV é o valor de UMA parcela (padrão de fatura de cartão);
//       'total'   = a coluna valor é o valor total da compra parcelada.
export function valorParcelaLinha(l, modo) {
  const v = Number(l.valor)
  const n = Number(l.parcela_total) || 1
  return n > 1 && modo === 'total' ? v / n : v
}
export function valorTotalLinha(l, modo) {
  const v = Number(l.valor)
  const n = Number(l.parcela_total) || 1
  return n > 1 && modo === 'parcela' ? round2(v * n) : v
}

// "Nubank Roxinho" -> cartão "Nubank" (só quando um único cartão combina; nunca escolhe entre vários).
export function resolverCartaoPorNome(nome, cartoes) {
  const n = normBasico(nome)
  if (!n) return null
  const exato = cartoes.filter((c) => normBasico(c.nome) === n)
  if (exato.length === 1) return exato[0]
  const parecidos = cartoes.filter((c) => { const cn = normBasico(c.nome); return cn && (n.includes(cn) || cn.includes(n)) })
  return parecidos.length === 1 ? parecidos[0] : null
}

// Para cada linha: com qual compra já lançada ela provavelmente coincide?
//   exata        mesmo cartão, mesmo nome, mesmo valor, até 1 dia de diferença
//   parecida     parecida o bastante (nome parecido e/ou alguns dias de diferença, ex.: veio do Telegram)
//   parcelamento linha de parcela em andamento cujo parcelamento já está em Compras
// Cada compra existente só "absorve" UMA linha: duas linhas iguais no arquivo e uma compra lançada
// = uma já lançada e uma nova (antes, as duas eram marcadas como já lançadas).
export function analisarLinhas(linhas, { compras = [], aliases = [] } = {}, modo = 'parcela') {
  const indice = indexarAliases(aliases)
  const usadas = new Set()
  return linhas.map((l) => {
    const { chave } = chaveEstabelecimento(l.descricao, indice)
    const n = Number(l.parcela_total) || 1
    const k = Number(l.parcela_atual) || 1
    const livres = compras.filter((c) => !usadas.has(c.id))

    if (k > 1 && l.cartao_id) {
      const valorParcela = valorParcelaLinha(l, modo)
      const achada = livres.find((c) =>
        Number(c.parcelas) === n && c.cartao_id === l.cartao_id &&
        (normNome(c.descricao) === normNome(l.descricao) || chaveEstabelecimento(c.descricao, indice).chave === chave) &&
        Math.abs(Number(c.valor_total) / Number(c.parcelas) - valorParcela) < TOLERANCIA_VALOR)
      if (achada) { usadas.add(achada.id); return { chave, correspondencia: { tipo: 'parcelamento', compra: achada, score: 1 } } }
      return { chave, correspondencia: null }
    }

    const ev = {
      valor: valorTotalLinha(l, modo), data_evento: l.data, parcelas: n,
      cartao_id: l.cartao_id || null, estabelecimento_chave: chave,
    }
    let melhor = null
    for (const c of livres) {
      const p = pontuar(ev, c, indice)
      if (p && p.score >= 0.5 && (!melhor || p.score > melhor.score)) melhor = p
    }
    if (!melhor) return { chave, correspondencia: null }
    usadas.add(melhor.compra.id)
    return { chave, correspondencia: { tipo: melhor.exato ? 'exata' : 'parecida', compra: melhor.compra, score: melhor.score } }
  })
}

// Regras de categoria prontas para uso (calcula o histórico uma vez por arquivo, não por linha).
export const prepararRegras = ({ regras = [], compras = [], aliases = [] }) => ({
  banco: regras,
  historico: construirRegrasDoHistorico(compras, indexarAliases(aliases)),
})

// Categoria sugerida para a linha: regra aprendida (tabela) > histórico de compras > nome do lugar.
// Devolve null se não souber (nunca chuta).
export function sugerirCategoriaLinha(chave, { categorias = [], preparadas = { banco: [], historico: [] } } = {}) {
  const r = sugerirCategoria({ chave, regras: preparadas.banco, categorias }) || sugerirCategoria({ chave, regras: preparadas.historico, categorias })
  if (r) return { categoria: r.categoria, subcategoria: r.subcategoria, fonte: 'historico' }
  const n = sugerirPorNome({ chave, categorias })
  return n ? { categoria: n.categoria, subcategoria: n.subcategoria, fonte: 'nome' } : null
}

// O que impede a linha de ser importada (lista vazia = pronta).
export function problemasDaLinha(l, categorias, mesFatura, { normalizarData }) {
  const erros = []
  const atual = Number(l.parcela_atual) || 1
  const total = Number(l.parcela_total) || 1
  if (!normalizarData(l.data) || normalizarData(l.data) !== l.data) erros.push('data inválida')
  if (atual < 1 || atual > total) erros.push('parcela inválida')
  if (!l.descricao) erros.push('sem descrição')
  if (l.valor === '' || isNaN(Number(l.valor))) erros.push('valor inválido')
  if (!l.categoria || !categorias.some((c) => c.nome === l.categoria)) erros.push('falta a categoria')
  else if (!l.subcategoria || !categoriaValida(categorias, l.categoria, l.subcategoria)) erros.push('falta a subcategoria')
  if (!l.pessoa) erros.push('falta a pessoa')
  if (!l.cartao_id) erros.push('falta o cartão')
  if (atual > 1 && !mesFatura) erros.push('falta o mês da fatura')
  return erros
}

// Resumo do arquivo para o aviso do topo.
export function resumirAnalise(linhas) {
  const ja = (l) => l.correspondencia && ['exata', 'parecida', 'parcelamento'].includes(l.correspondencia.tipo)
  const total = linhas.length
  const jaLancadas = linhas.filter(ja).length
  return {
    total,
    jaLancadas,
    exatas: linhas.filter((l) => l.correspondencia?.tipo === 'exata').length,
    parecidas: linhas.filter((l) => l.correspondencia?.tipo === 'parecida').length,
    parcelamentos: linhas.filter((l) => l.correspondencia?.tipo === 'parcelamento').length,
    novas: total - jaLancadas,
    repetidasNoArquivo: linhas.filter((l) => l.duplicataCsv).length,
    // quase tudo já está em Compras: provavelmente o mesmo arquivo (ou outro do mesmo período) já foi importado
    pareceJaImportado: total >= 3 && jaLancadas / total >= 0.7,
  }
}

// Sugestão de nome para a coluna Identificação.
export const sugerirNomeLinha = (descricao, { compras = [], aliases = [] } = {}) =>
  sugerirIdentificacao({ descricao, compras, indiceAliases: indexarAliases(aliases) })
