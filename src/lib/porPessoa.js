// Visão por pessoa: o que cada uma tem de gasto no mês (parcelas das compras no nome dela e contas fixas dela),
// por categoria e com os maiores itens. Mesma regra do Dashboard: valor líquido (sem a parte dos outros) e fixo sem dono é da Casa.
import { gerarParcelas, fixosAtivos, tituloCompra, donoDoFixo } from './utils.js'
import { comprasLiquidas, fixosLiquidos } from './divisoes.js'

const r2 = (n) => Math.round(n * 100) / 100

// -> [{ pessoa, total, compras, fixos, porCategoria: [{ categoria, valor }], maiores: [{ nome, valor, detalhe }] }], da maior para a menor.
export function visaoPorPessoa(d, mes, maxMaiores = 5) {
  const pessoas = d.pessoas || []
  const mapa = new Map()
  const de = (nome) => {
    if (!mapa.has(nome)) mapa.set(nome, { pessoa: nome, total: 0, compras: 0, fixos: 0, cats: {}, itens: [] })
    return mapa.get(nome)
  }
  const lanca = (nome, tipo, categoria, item) => {
    const x = de(nome)
    x.total += item.valor
    x[tipo] += item.valor
    const cat = categoria || 'Sem categoria'
    x.cats[cat] = (x.cats[cat] || 0) + item.valor
    x.itens.push(item)
  }
  comprasLiquidas(d).forEach((c) => {
    const p = gerarParcelas(c, d.cartoes || []).find((x) => x.mes === mes)
    if (!p || !p.valor) return
    lanca(c.pessoa, 'compras', c.categoria, { nome: tituloCompra(c), valor: p.valor, detalhe: p.total > 1 ? `parcela ${p.num}/${p.total}` : 'à vista' })
  })
  fixosAtivos(fixosLiquidos(d), mes).forEach((f) => {
    lanca(donoDoFixo(f, pessoas), 'fixos', f.categoria, { nome: f.nome, valor: Number(f.valor), detalhe: 'conta fixa' })
  })
  // quem está cadastrada aparece sempre (mesmo com mês vazio); a Casa só quando tem conta
  pessoas.forEach((p) => de(p.nome))
  const ordemCadastro = pessoas.map((p) => p.nome)
  return [...mapa.values()]
    .filter((x) => x.total > 0 || ordemCadastro.includes(x.pessoa))
    .map((x) => ({
      pessoa: x.pessoa,
      total: r2(x.total), compras: r2(x.compras), fixos: r2(x.fixos),
      porCategoria: Object.entries(x.cats).map(([categoria, valor]) => ({ categoria, valor: r2(valor) })).sort((a, b) => b.valor - a.valor),
      maiores: x.itens.map((i) => ({ ...i, valor: r2(i.valor) })).sort((a, b) => b.valor - a.valor).slice(0, maxMaiores),
    }))
    .sort((a, b) => b.total - a.total || a.pessoa.localeCompare(b.pessoa))
}

