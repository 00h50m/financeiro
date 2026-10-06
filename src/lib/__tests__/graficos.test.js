import { describe, it, expect } from 'vitest'
import { rendaXDespesas, categoriasDoMes, evolucaoDaCategoria, gastoPorPessoa, composicaoDosMeses, categoriasComGasto, quitacaoDosMeses } from '../graficos'

const cartoes = [{ id: 'c1', nome: 'Nubank', fechamento: 31 }]
let n = 0
const compra = (o) => ({ id: 'k' + ++n, cartao_id: 'c1', pessoa: 'Gi', categoria: 'Mercado', subcategoria: 'x', descricao: 'X', data_compra: '2026-09-10', valor_total: 100, parcelas: 1, ...o })
const d = {
  cartoes, pessoas: [{ id: 'p1', nome: 'Gi' }, { id: 'p2', nome: 'Sabi' }],
  compras: [
    compra({ valor_total: 300, categoria: 'Mercado' }),
    compra({ valor_total: 600, parcelas: 3, categoria: 'Casa', pessoa: 'Sabi' }),
    compra({ valor_total: 50, categoria: 'Lazer' }),
    compra({ valor_total: 20, categoria: 'Saúde' }),
  ],
  fixos: [
    { id: 'f1', nome: 'Internet', valor: 100, ativo: true, categoria: 'Casa', pessoa: 'Gi' },
    { id: 'f2', nome: 'Energia', valor: 200, ativo: true, variavel: true, categoria: 'Casa' },
  ],
  faturas: [], rendas: [{ mes: '2026-09', giovanna: 5000 }, { mes: '2026-10', giovanna: 5000 }], fechamentos: [], orcamentos: [{ categoria: 'Mercado', valor: 250 }],
  divisoes: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: false, saldoAjustes: [],
}

describe('dados dos gráficos', () => {
  it('renda x despesas devolve n meses em ordem, com sobra', () => {
    const s = rendaXDespesas(d, '2026-10', 3)
    expect(s.map((x) => x.mes)).toEqual(['2026-08', '2026-09', '2026-10'])
    const set = s[1]
    expect(set.renda).toBe(5000)
    expect(set.sobra).toBeCloseTo(set.renda - set.despesas, 2)
  })
  it('categorias do mês: ordenadas, com % e "Outras" quando passa do máximo', () => {
    const c = categoriasDoMes(d, '2026-09', 3)
    expect(c.itens[0].nome).toBe('Casa') // 200 parcela + 300 fixos... maior
    expect(c.itens).toHaveLength(3)
    expect(c.itens[2].outras).toBe(true)
    expect(c.itens.reduce((t, i) => t + i.valor, 0)).toBeCloseTo(c.total, 2)
    expect(c.itens.reduce((t, i) => t + i.pct, 0)).toBeGreaterThan(99)
  })
  it('evolução de uma categoria traz o teto', () => {
    const e = evolucaoDaCategoria(d, 'Mercado', '2026-10', 3)
    expect(e.teto).toBe(250)
    expect(e.pontos).toHaveLength(3)
    expect(e.pontos.find((p) => p.mes === '2026-09').valor).toBe(300)
  })
  it('categorias com gasto: da maior para a menor', () => {
    expect(categoriasComGasto(d, '2026-10', 3)[0]).toBe('Casa')
  })
  it('gasto por pessoa: fixo sem pessoa vai para a Casa; nomes só dos que gastaram', () => {
    const g = gastoPorPessoa(d, '2026-09', 2)
    const set = g.meses.find((m) => m.mes === '2026-09').valores
    expect(set.Gi).toBe(470) // compras 300+50+20 + internet 100
    expect(set.Sabi).toBe(200)
    expect(set.Casa).toBe(200) // energia sem pessoa
    expect(g.nomes).toEqual(['Gi', 'Sabi', 'Casa'])
  })
  it('composição: fixas, variáveis e compras separadas', () => {
    const c = composicaoDosMeses(d, '2026-09', 1)[0]
    expect(c).toMatchObject({ fixas: 100, variaveis: 200, compras: 570 })
  })
  it('quitação dos meses', () => {
    const q = quitacaoDosMeses(d, '2026-09', 3)
    expect(q.map((m) => m.total)).toEqual([200, 200, 200])
  })
})
