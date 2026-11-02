// Da leitura do arquivo (CSV ou PDF) às linhas de trabalho do assistente de importação. Tudo puro (a tela só chama).
// Porta fiel da lógica que estava dentro da tela de importação: preparar cada linha (categoria, nome, cartão, pessoa, parcela),
// inferir o mês da fatura e casar as linhas com o que já está lançado.
import { normalizarData, normalizarValor } from './csvFormato.js'
import { calcMesInicio, nowYM } from './utils.js'
import { extrairParcela, limparDescricao, normBasico } from './normalizacao.js'
import { chaveEstabelecimento, indexarAliases } from './estabelecimento.js'
import { analisarLinhas, prepararRegras, sugerirCategoriaLinha, sugerirNomeLinha, resolverCartaoPorNome } from './importacao.js'

export const COLUNAS_ESPERADAS = ['data', 'descricao', 'valor', 'categoria', 'parcela_atual', 'parcela_total', 'cartao', 'observacao']

function marcarDuplicatasNoCsv(linhas) {
  const contagem = {}
  const chaveDe = (l) => `${l.data}|${normBasico(l.descricao)}|${Number(l.valor)}|${l.cartao_id || normBasico(l.cartaoNome)}`
  linhas.forEach((l) => { const k = chaveDe(l); contagem[k] = (contagem[k] || 0) + 1 })
  return linhas.map((l) => ({ ...l, duplicataCsv: contagem[chaveDe(l)] > 1 }))
}

// Reavalia o que já está lançado (exata / parecida / parcelamento) e o que falta em cada linha,
// sem desfazer o que a pessoa marcou ou editou. "É outra compra" (decisao === 'outra') tira a linha da análise.
export function reanalisar(linhas, compras, aliases, modo, ctx = {}) {
  const indiceDecididas = linhas.map((l, i) => i).filter((i) => linhas[i].decisao !== 'outra')
  const parciais = analisarLinhas(indiceDecididas.map((i) => linhas[i]), { compras, aliases, ...ctx }, modo)
  const achados = linhas.map((l) => ({ chave: chaveEstabelecimento(l.descricao, indexarAliases(aliases)).chave, correspondencia: null }))
  indiceDecididas.forEach((i, j) => { achados[i] = parciais[j] })
  const comFlags = linhas.map((l, i) => {
    const { chave, correspondencia } = achados[i]
    const emAndamento = Number(l.parcela_atual) > 1
    const tipo = correspondencia?.tipo
    const jaLancada = tipo === 'exata' || tipo === 'parecida' || tipo === 'valor_diferente'
    const parcelamentoJa = tipo === 'parcelamento'
    return {
      ...l,
      chave,
      correspondencia,
      parcelaEmAndamento: emAndamento,
      duplicataExistente: jaLancada,
      parcelaEncontrada: emAndamento ? parcelamentoJa : null,
      parcelaCompra: parcelamentoJa ? correspondencia.compra : null,
      incluir: l.incluirManual ? l.incluir : l.decisao === 'outra' || !(jaLancada || parcelamentoJa),
    }
  })
  return marcarDuplicatasNoCsv(comFlags)
}


export function prepararLinhas(registros, { categorias, cartoes, pessoas, aliases, regras, compras }) {
  const indiceAliases = indexarAliases(aliases)
  const preparadas = prepararRegras({ regras, compras, aliases })

  const base = registros
    .filter((r) => Object.values(r).some((v) => (v || '').toString().trim() !== ''))
    .map((r, i) => {
      const nomeCategoriaCsv = (r.categoria || '').trim()
      const catCsvObj = categorias.find((c) => c.nome === nomeCategoriaCsv)
      const cartaoNome = (r.cartao || '').trim()
      const cartao = resolverCartaoPorNome(cartaoNome, cartoes)
      const descricaoBruta = (r.descricao || '').trim()
      const noTexto = extrairParcela(descricaoBruta)
      const parcelaAtual = (r.parcela_atual || '').trim() || noTexto?.atual || ''
      const parcelaTotal = (r.parcela_total || '').trim() || noTexto?.total || ''
      const descricao = limparDescricao(descricaoBruta)

      const { chave } = chaveEstabelecimento(descricao, indiceAliases)
      const sugestao = sugerirCategoriaLinha(chave, { categorias, preparadas })
      let categoria = ''
      let subcategoria = ''
      let fonteSugestao = ''

      if (catCsvObj) {
        categoria = nomeCategoriaCsv
        if (sugestao && sugestao.categoria === categoria && catCsvObj.subcategorias.includes(sugestao.subcategoria)) {
          subcategoria = sugestao.subcategoria
          fonteSugestao = sugestao.fonte
        } else {
          subcategoria = catCsvObj.subcategorias[0] || ''
        }
      } else if (sugestao) {
        categoria = sugestao.categoria
        subcategoria = sugestao.subcategoria
        fonteSugestao = sugestao.fonte
      }

      // nome "de gente" sugerido para Identificação (o texto original da fatura continua em "No cartão")
      const nomeSug = sugerirNomeLinha(descricao, { compras, aliases })

      return {
        _id: i,
        data: normalizarData(r.data) || (r.data || '').trim(),
        descricao,
        descricaoOriginal: descricaoBruta,
        identificacao: nomeSug?.nome || '',
        identificacaoSugerida: !!nomeSug,
        valor: normalizarValor(r.valor),
        categoria,
        subcategoria,
        sugerida: !!fonteSugestao,
        fonteSugestao,
        parcela_atual: parcelaAtual,
        parcela_total: parcelaTotal,
        cartaoNome,
        cartao_id: cartao?.id || '',
        pessoa: cartao?.titular || pessoas[0]?.nome || '',
        observacao: (r.observacao || '').trim(),
      }
    })

  // Mês da fatura: o mais comum entre as linhas que não são parcela em andamento
  const contarMeses = (incluirEmAndamento) => {
    const contagem = {}
    base.forEach((l) => {
      if (!l.cartao_id || !l.data) return
      if (!incluirEmAndamento && Number(l.parcela_atual) > 1) return
      const m = calcMesInicio(l.data, cartoes.find((c) => c.id === l.cartao_id))
      contagem[m] = (contagem[m] || 0) + 1
    })
    return Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0]
  }
  const inferido = contarMeses(false) || contarMeses(true) || nowYM()
  return { base, mesInferido: inferido }
}

