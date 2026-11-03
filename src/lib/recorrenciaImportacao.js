// Cobrança recorrente dentro da importação de fatura: uma linha nova que se repete todo mês (assinatura, mensalidade)
// pode virar conta fixa (de valor variável quando o preço muda). Usa a mesma detecção da tela Contas fixas, mas já a
// partir de 2 meses de histórico: a linha da fatura é a 3ª ocorrência.
import { detectarRecorrencias } from './recorrencias.js'
import { chaveEstabelecimento, similaridadeEstabelecimento } from './estabelecimento.js'
import { addMonths } from './utils.js'

// Recorrências conhecidas ANTES do mês da fatura (compras dos meses anteriores) que ainda não são conta fixa.
export function recorrenciasAntesDaFatura({ compras = [], fixos = [], mesFatura, aliases = new Map(), ignoradas = [] }) {
  if (!mesFatura) return []
  return detectarRecorrencias(compras, fixos, addMonths(mesFatura, -1), { janela: 6, minimo: 2, aliases, ignoradas })
}

// A linha da fatura é uma nova ocorrência de alguma recorrência? (mesmo lugar, mesmo cartão e valor compatível)
export function recorrenciaDaLinha(linha, recorrencias, aliases = new Map()) {
  if (!recorrencias.length || linha.natureza === 'credito' || linha.natureza === 'encargo' || linha.natureza === 'pagamento') return null
  if ((Number(linha.parcela_total) || 1) > 1) return null // parcelada não é assinatura
  const valor = Number(linha.valor)
  if (!(valor > 0)) return null
  const chave = chaveEstabelecimento(linha.descricaoOriginal || linha.descricao || '', aliases).chave
  if (!chave) return null
  const r = recorrencias.find((x) => (x.cartao_id || '') === (linha.cartao_id || '') && similaridadeEstabelecimento(x.chave, chave) >= 0.9)
  if (!r) return null
  const base = r.medio || r.ultimo
  if (Math.abs(valor - base) > base * 0.3 + 0.01) return null // preço muito diferente: é outra compra, não a assinatura
  return { ...r, valorLinha: valor, variavel: !r.valorFixo, ocorrencias: r.meses.length }
}

// Dados da conta fixa a cadastrar a partir da linha. Começa no mês SEGUINTE ao da fatura: a cobrança desta fatura entra como compra
// normal na importação, e a conta fixa só passa a valer depois (senão contaria duas vezes).
export function contaFixaDaLinha(linha, rec, mesFatura, { colunaCartaoOk = false, colunaVariavelOk = false } = {}) {
  return {
    nome: rec.nome, valor: Number(linha.valor), pessoa: linha.pessoa || rec.pessoa || null,
    categoria: linha.categoria || rec.categoria, subcategoria: linha.subcategoria || rec.subcategoria,
    ativo: true, mes_inicio: addMonths(mesFatura, 1),
    ...(colunaCartaoOk && linha.cartao_id ? { cartao_id: linha.cartao_id } : {}),
    ...(colunaVariavelOk && rec.variavel !== false && !rec.valorFixo ? { variavel: true } : {}),
  }
}
