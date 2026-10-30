import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import Orcamento from '../../components/Orcamento'

const mes = new Date().toISOString().slice(0, 7)
const hoje = `${mes}-05`
const base = {
  compras: [{ id: 1, data_compra: hoje, descricao: 'x', categoria: 'Moradia', valor_total: 3000, parcelas: 1 }, { id: 2, data_compra: hoje, descricao: 'y', categoria: 'Alimentação', valor_total: 800, parcelas: 1 }, { id: 3, data_compra: hoje, descricao: 'z', categoria: 'Lazer', valor_total: 300, parcelas: 1 }],
  cartoes: [], fixos: [], divisoes: [], faturas: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: true, adiamentos: [], dividas: [], fixosValores: [], rendaSazonal: [], rendas: [{ mes, giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }], orcamentosOk: true,
  categorias: [{ id: 1, nome: 'Moradia', subcategorias: [] }, { id: 2, nome: 'Alimentação', subcategorias: [] }, { id: 3, nome: 'Lazer', subcategorias: [] }, { id: 4, nome: 'Viagens', subcategorias: [] }],
  definirOrcamento: () => {}, definirOrcamentos: () => {},
}
describe('Orçamento (render)', () => {
  it('sem tetos: explica, sugere por onde começar e lista as categorias sem teto do maior para o menor', () => {
    const html = renderToString(<Orcamento store={{ ...base, orcamentos: [] }} />).replace(/<!-- -->/g, '')
    expect(html).toContain('Você ainda não definiu nenhum teto')
    expect(html).toContain('Sugerir tetos pelo gasto de')
    expect(html).not.toContain('Sugerir tetos pelo histórico')
    expect(html).toContain('Moradia, Alimentação, Lazer')
    expect(html.indexOf('Moradia')).toBeLessThan(html.indexOf('Lazer'))
    expect(html).toContain('Definir teto mensal de Moradia')
    expect(html).toContain('1 categoria sem gasto')
  })
  it('com tetos: cards das categorias com teto, status e a lista das sem teto à parte', () => {
    const html = renderToString(<Orcamento store={{ ...base, orcamentos: [{ categoria: 'Alimentação', valor: 700 }, { categoria: 'Moradia', valor: 4000 }] }} />).replace(/<!-- -->/g, '')
    expect(html).not.toContain('Você ainda não definiu nenhum teto')
    expect(html).toContain('Estourou')
    expect(html).toContain('Teto mensal de Alimentação')
    expect(html).toContain('Definir teto mensal de Lazer')
    expect(html).toContain('Alimentação')
  })
})

describe('menu lateral', () => {
  it('toda aba tem ícone', () => {
    const src = readFileSync(new URL('../../App.jsx', import.meta.url), 'utf8')
    const icones = src.slice(src.indexOf('const ICONES = {'), src.indexOf('function Icone'))
    const ids = [...src.matchAll(/\{ id: '(\w+)', label/g)].map((m) => m[1])
    expect(ids.length).toBeGreaterThan(20)
    expect(ids.filter((id) => !new RegExp(`\\b${id}:`).test(icones))).toEqual([])
  })
})
