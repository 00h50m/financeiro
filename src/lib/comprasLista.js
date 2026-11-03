// Lista de Compras: ordenação, origens para filtrar e paginação por mês. Funções puras (sem React), testáveis.
import { rotuloOrigem } from './origem.js'

export const ORDENACOES = [
  ['data_desc', 'Data (mais recentes)'], ['data_asc', 'Data (mais antigas)'], ['valor_desc', 'Maior valor'], ['valor_asc', 'Menor valor'], ['descricao', 'Descrição (A–Z)'],
]

const dia = (c) => String(c.data_compra).slice(0, 10)
const nome = (c) => String(c.identificacao || c.descricao || '').toLocaleLowerCase('pt-BR')
const val = (c) => Number(c.valor_total) || 0

// Ordena sem alterar a lista original. Empates caem na data e depois no nome, para a ordem não "pular".
export function ordenarCompras(lista, chave = 'data_desc') {
  const porData = (a, b) => dia(b).localeCompare(dia(a)) || nome(a).localeCompare(nome(b), 'pt-BR')
  const cmp = {
    data_desc: porData,
    data_asc: (a, b) => dia(a).localeCompare(dia(b)) || nome(a).localeCompare(nome(b), 'pt-BR'),
    valor_desc: (a, b) => val(b) - val(a) || porData(a, b),
    valor_asc: (a, b) => val(a) - val(b) || porData(a, b),
    descricao: (a, b) => nome(a).localeCompare(nome(b), 'pt-BR') || porData(a, b),
  }[chave] || porData
  return [...lista].sort(cmp)
}

// Origens que realmente existem nas compras (manual, Telegram, fatura…), com o rótulo para mostrar. Compra sem origem conta como "Manual".
export function origensDasCompras(compras) {
  const chaves = [...new Set(compras.map((c) => c.origem || 'manual'))]
  return chaves.map((k) => [k, rotuloOrigem(k) || (k === 'manual' ? 'Manual' : k)]).sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'))
}
export const origemDaCompra = (c) => c.origem || 'manual'

// Mostra só as primeiras `limite` compras de um mês (a lista longa não pesa no celular); o resto vem em "Mostrar mais".
export const LIMITE_POR_MES = 30
export function fatiar(itens, limite = LIMITE_POR_MES) {
  return { visiveis: itens.slice(0, limite), restantes: Math.max(0, itens.length - limite) }
}
