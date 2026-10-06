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

import { projecao, sobraAcumulada, anoAAno, progressoDasMetas } from '../graficos'
describe('projeção e extras', () => {
  const base = { ...d, compras: [...d.compras, compra({ valor_total: 900, parcelas: 3, categoria: 'Casa', data_compra: '2026-10-05' })], metas: [{ id: 'm1', nome: 'Viagem', tipo: 'objetivo', valor_alvo: 1000, ativa: true }], metasMovimentos: [{ meta_id: 'm1', valor: 250 }] }
  it('projeção: comprometido + gasto à vista médio; sobra e acumulada coerentes', () => {
    const p = projecao(base, '2026-10', 3)
    expect(p.map((x) => x.mes)).toEqual(['2026-10', '2026-11', '2026-12'])
    p.forEach((x) => { expect(x.despesas).toBeCloseTo(x.comprometido + x.aVistaEstimado, 2); expect(x.sobra).toBeCloseTo(x.renda - x.despesas, 2) })
    expect(p[2].acumulada).toBeCloseTo(p.reduce((t, x) => t + x.sobra, 0), 2)
    expect(p[0].aVistaEstimado).toBeGreaterThanOrEqual(0)
  })
  it('sobra acumulada soma só meses com dados', () => {
    const s = sobraAcumulada(d, '2026-10', 3)
    expect(s[s.length - 1].acumulada).toBeCloseTo(s.reduce((t, x) => t + (x.temDados ? x.sobra : 0), 0), 2)
  })
  it('ano a ano: 12 meses, futuro nulo', () => {
    const a = anoAAno(d, 2026, '2026-10')
    expect(a).toHaveLength(12)
    expect(a[10].atual).toBeNull() // nov/2026 ainda não chegou
    expect(a[8].atual).not.toBeNull() // set/2026 tem dados
  })
  it('metas: progresso em % do alvo', () => {
    expect(progressoDasMetas(base, '2026-10-05')[0]).toMatchObject({ nome: 'Viagem', saldo: 250, alvo: 1000, pct: 25 })
  })
})

import { textoResumoMensal } from '../resumoMensal'
describe('resumo mensal em texto', () => {
  it('traz renda, despesas, sobra, categorias e comparação com o mês anterior', () => {
    const t = textoResumoMensal(d, '2026-10', '2026-10-05')
    expect(t).toMatch(/Resumo de Out\/26/)
    expect(t).toMatch(/Renda: R\$ 5\.000,00/)
    expect(t).toMatch(/Despesas:/)
    expect(t).toMatch(/Onde foi o dinheiro:\n1\./)
    expect(t).toMatch(/Contra Set\/26/)
  })
  it('mês sem dados avisa em vez de inventar', () => {
    expect(textoResumoMensal({ ...d, compras: [], fixos: [], rendas: [] }, '2026-10', '2026-10-05')).toMatch(/Ainda não há/)
  })
})
