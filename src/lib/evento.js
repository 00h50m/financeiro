import { chaveEstabelecimento, indexarAliases } from './estabelecimento.js'
import { sugerirCategoria, regrasParaSugestao, categoriaValida } from './categorizacao.js'
import { encontrarCorrespondencia } from './reconciliacao.js'

// Porta de entrada comum a qualquer fonte (Telegram, notificação Android, CSV, ...):
//   entrada bruta -> validação -> normalização -> sugestão de categoria -> correspondência
//   -> linha pronta para a tabela eventos_financeiros.
// Não grava nada e não confia na fonte: tudo é conferido contra categorias, cartões e pessoas.

export const FORMAS_SEM_CARTAO = ['pix', 'dinheiro', 'boleto', 'outro']
const FORMATO_ORIGEM = /^[a-z][a-z0-9_]*$/
const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(Date.parse(s + 'T12:00:00Z'))

// ctx: { categorias, cartoes, pessoas, regras, aliases, compras, eventos }
export function prepararEvento(entrada, ctx) {
  const { categorias = [], cartoes = [], pessoas = [], regras = [], aliases = [], compras = [], eventos = [] } = ctx
  const erros = []
  const valor = Number(entrada.valor)
  const descricao = String(entrada.descricao_original || '').trim()
  if (!FORMATO_ORIGEM.test(entrada.origem || '')) erros.push('origem inválida')
  if (!String(entrada.id_externo || '').trim()) erros.push('id_externo obrigatório')
  if (!Number.isFinite(valor) || valor <= 0) erros.push('valor inválido')
  if (!dataValida(entrada.data_evento)) erros.push('data inválida')
  if (!descricao) erros.push('descrição obrigatória')
  const parcelas = entrada.parcelas == null ? 1 : Number(entrada.parcelas)
  if (!Number.isInteger(parcelas) || parcelas < 1) erros.push('parcelas inválidas')
  if (erros.length) return { evento: null, erros }

  const indice = indexarAliases(aliases)
  const { chave, nome } = chaveEstabelecimento(descricao, indice)
  const sugestao = sugerirCategoria({ chave, regras: regrasParaSugestao(regras, compras, indice), categorias })

  // Só aceita o que existe no cadastro; o resto vira "falta informar", nunca um chute.
  const cartao = cartoes.find((c) => c.id === entrada.cartao_id)
  const pessoaId = pessoas.some((p) => p.id === entrada.pessoa_id) ? entrada.pessoa_id
    : pessoas.find((p) => p.id === sugestao?.pessoa_id)?.id || null
  // O cartão padrão da regra só entra se a pessoa não disse que foi sem cartão (pix, dinheiro...).
  const cartaoId = cartao ? cartao.id
    : entrada.forma_pagamento ? null : cartoes.find((c) => c.id === sugestao?.cartao_id)?.id || null
  const forma = cartaoId ? 'cartao' : FORMAS_SEM_CARTAO.includes(entrada.forma_pagamento) ? entrada.forma_pagamento : null
  const infoCat = entrada.categoria && categoriaValida(categorias, entrada.categoria, entrada.subcategoria)
    ? { categoria: entrada.categoria, subcategoria: entrada.subcategoria, regra_id: null, confianca: null }
    : sugestao
  const pago = cartaoId ? null : typeof entrada.pago === 'boolean' ? entrada.pago : null

  const faltando = []
  if (!pessoaId) faltando.push('pessoa')
  if (!cartaoId && !forma) faltando.push('cartao')
  if (!cartaoId && forma && pago === null) faltando.push('pago')
  if (!infoCat) faltando.push('categoria')

  const base = {
    origem: entrada.origem, id_externo: String(entrada.id_externo),
    valor, data_evento: entrada.data_evento, parcelas, descricao_original: descricao,
    estabelecimento_chave: chave || null, forma_pagamento: forma, cartao_id: cartaoId, pessoa_id: pessoaId, pago,
  }
  const match = encontrarCorrespondencia({ ...base }, compras, { indiceAliases: indice, eventos })
  return {
    erros,
    evento: {
      ...base,
      app_origem: entrada.app_origem || null,
      dispositivo_id: entrada.dispositivo_id || null,
      descricao_normalizada: nome || chave || null,
      categoria: infoCat?.categoria || null,
      subcategoria: infoCat?.subcategoria || null,
      regra_id: infoCat?.regra_id || null,
      confianca_categoria: infoCat?.confianca ?? null,
      confianca_origem: entrada.confianca_origem ?? null,
      obs: entrada.obs || null,
      match_compra_id: match.compra?.id || null,
      match_nivel: match.nivel,
      match_score: match.nivel === 'nenhum' ? null : match.score,
      faltando,
      status: faltando.length ? 'aguardando_dados' : 'pendente',
    },
  }
}
