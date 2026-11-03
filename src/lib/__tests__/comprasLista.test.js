import { describe, it, expect } from 'vitest'
import { ordenarCompras, origensDasCompras, origemDaCompra, fatiar, ORDENACOES } from '../comprasLista'

const c = (id, data, desc, valor, extra = {}) => ({ id, data_compra: data, descricao: desc, valor_total: valor, ...extra })
const lista = [c('1', '2026-10-05', 'Mercado', 100), c('2', '2026-10-20', 'Padaria', 30), c('3', '2026-10-05', 'Açaí', 100), c('4', '2026-10-12', 'Zeca', 500)]

describe('ordenação das compras', () => {
  it('data: mais recentes primeiro (empate pelo nome) e mais antigas primeiro', () => {
    expect(ordenarCompras(lista, 'data_desc').map((x) => x.id)).toEqual(['2', '4', '3', '1']) // 05/10: Açaí antes de Mercado
    expect(ordenarCompras(lista, 'data_asc').map((x) => x.id)).toEqual(['3', '1', '4', '2'])
  })
  it('valor: maior e menor, empate pela data mais recente', () => {
    expect(ordenarCompras(lista, 'valor_desc').map((x) => x.id)).toEqual(['4', '3', '1', '2'])
    expect(ordenarCompras(lista, 'valor_asc').map((x) => x.id)).toEqual(['2', '3', '1', '4'])
  })
  it('descrição A–Z usa a identificação quando existe e ignora acentos/maiúsculas na ordem', () => {
    const l = [c('a', '2026-10-01', 'zebra', 1), c('b', '2026-10-01', 'Água', 1, { identificacao: 'Conta de luz' }), c('c', '2026-10-01', 'barco', 1)]
    expect(ordenarCompras(l, 'descricao').map((x) => x.id)).toEqual(['c', 'b', 'a']) // barco, Conta de luz, zebra
  })
  it('não altera a lista original e chave desconhecida cai em data desc', () => {
    const copia = [...lista]
    ordenarCompras(lista, 'valor_asc')
    expect(lista).toEqual(copia)
    expect(ordenarCompras(lista, 'xxx').map((x) => x.id)).toEqual(ordenarCompras(lista, 'data_desc').map((x) => x.id))
    expect(ORDENACOES.map((o) => o[0])).toContain('valor_desc')
  })
})

describe('origens e paginação', () => {
  it('lista só as origens que existem; sem origem vale "manual"', () => {
    const o = origensDasCompras([c('1', '2026-10-01', 'a', 1), c('2', '2026-10-01', 'b', 1, { origem: 'telegram' }), c('3', '2026-10-01', 'c', 1, { origem: 'telegram' })])
    expect(o.map(([k]) => k).sort()).toEqual(['manual', 'telegram'])
    expect(origemDaCompra({})).toBe('manual')
    expect(origemDaCompra({ origem: 'pdf' })).toBe('pdf')
  })
  it('fatiar mostra o limite e conta o que falta', () => {
    const itens = Array.from({ length: 75 }, (_, i) => i)
    expect(fatiar(itens)).toEqual({ visiveis: itens.slice(0, 30), restantes: 45 })
    expect(fatiar(itens, 100)).toEqual({ visiveis: itens, restantes: 0 })
    expect(fatiar([], 30)).toEqual({ visiveis: [], restantes: 0 })
  })
})
