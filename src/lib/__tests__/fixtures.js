export const categorias = [
  { nome: 'Alimentação', subcategorias: ['Mercado', 'Restaurante', 'Delivery'] },
  { nome: 'Saúde', subcategorias: ['Farmácia'] },
  { nome: 'Transporte', subcategorias: ['Uber/99/Táxi'] },
  { nome: 'Animais', subcategorias: ['Ração', 'Pet shop'] },
]
export const cartoes = [
  { id: 'c-nu', nome: 'Nubank', titular: 'Giovanna', fechamento: 25 },
  { id: 'c-in', nome: 'Inter', titular: 'Sabrina', fechamento: 10 },
]
export const pessoas = [{ id: 'p-gi', nome: 'Giovanna' }, { id: 'p-sa', nome: 'Sabrina' }]
export const compra = (o) => ({
  id: 'x1', data_compra: '2026-10-04', descricao: 'IFOOD *IFOOD', categoria: 'Alimentação',
  subcategoria: 'Delivery', pessoa: 'Giovanna', cartao_id: 'c-nu', valor_total: 74.9, parcelas: 1,
  origem: 'manual', ...o,
})
export const entrada = (o) => ({
  origem: 'android_notification', id_externo: 'n1', valor: 74.9, data_evento: '2026-10-04',
  descricao_original: 'IFOOD', cartao_id: 'c-nu', pessoa_id: 'p-gi', ...o,
})
