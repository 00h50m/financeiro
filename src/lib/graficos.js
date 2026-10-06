// Dados dos gráficos: tudo sai das mesmas contas do Dashboard e da Evolução (meses fechados usam a foto gravada).
import { addMonths, fixosAtivos, gerarParcelas, donoDoFixo, nomeCasa } from './utils.js'
import { serieMensal, resumoParaSerie } from './evolucao.js'
import { comprasLiquidas, fixosLiquidos } from './divisoes.js'
import { calendarioQuitacao } from './parcelamentos.js'
import { resumoDoMes, rendaDoMes, detalhePagamentos } from './financeiro.js'
import { situacaoDaMeta } from './metas.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Renda x despesas de cada mês (n meses até mesFim). -> [{ mes, renda, despesas, sobra, temDados }]
export function rendaXDespesas(d, mesFim, n = 12) {
  return serieMensal(d, mesFim, n).map((l) => ({ mes: l.mes, renda: r2(l.renda), despesas: r2(l.despesas), sobra: r2(l.sobra), temDados: l.temDados, fonte: l.fonte }))
}

// Gasto por categoria no mês, maior primeiro. As menores se juntam em "Outras" para o gráfico não virar poeira.
// -> { total, itens: [{ nome, valor, pct, outras? }] }
export function categoriasDoMes(d, mes, maximo = 8) {
  const por = resumoParaSerie(d, mes, new Map()).porCategoria || {}
  const ordenadas = Object.entries(por).map(([nome, valor]) => ({ nome, valor: r2(valor) })).filter((c) => c.valor > 0).sort((a, b) => b.valor - a.valor)
  const total = r2(ordenadas.reduce((t, c) => t + c.valor, 0))
  let itens = ordenadas
  if (ordenadas.length > maximo) {
    const resto = ordenadas.slice(maximo - 1)
    itens = [...ordenadas.slice(0, maximo - 1), { nome: `Outras (${resto.length})`, valor: r2(resto.reduce((t, c) => t + c.valor, 0)), outras: true }]
  }
  return { total, itens: itens.map((c) => ({ ...c, pct: total > 0 ? Math.round((c.valor / total) * 1000) / 10 : 0 })) }
}

// Evolução de UMA categoria + o teto (se houver). -> { pontos: [{ mes, valor }], teto }
export function evolucaoDaCategoria(d, categoria, mesFim, n = 12) {
  const serie = serieMensal(d, mesFim, n)
  const teto = Number((d.orcamentos || []).find((o) => o.categoria === categoria)?.valor) || 0
  return { pontos: serie.map((l) => ({ mes: l.mes, valor: r2(l.porCategoria?.[categoria] || 0), temDados: l.temDados })), teto }
}

// Categorias que aparecem em algum dos meses, da que mais gasta (soma) para a que menos gasta.
export function categoriasComGasto(d, mesFim, n = 12) {
  const soma = {}
  serieMensal(d, mesFim, n).forEach((l) => Object.entries(l.porCategoria || {}).forEach(([c, v]) => { soma[c] = (soma[c] || 0) + v }))
  return Object.entries(soma).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).map(([c]) => c)
}

// Parcelas do mês + contas fixas de cada pessoa (mesma regra da "Distribuição por pessoa" do Dashboard).
export function gastoPorPessoaNoMes(d, mes) {
  const pessoas = d.pessoas || []
  const mapa = {}
  const soma = (nome, v) => { if (v) mapa[nome] = r2((mapa[nome] || 0) + v) }
  comprasLiquidas(d).forEach((c) => soma(c.pessoa, gerarParcelas(c, d.cartoes).filter((p) => p.mes === mes).reduce((t, p) => t + p.valor, 0)))
  fixosAtivos(fixosLiquidos(d), mes).forEach((f) => soma(donoDoFixo(f, pessoas), Number(f.valor)))
  return mapa
}
// -> { nomes: [...], meses: [{ mes, valores: { nome: valor } }] } com a mesma lista de nomes em todos os meses
export function gastoPorPessoa(d, mesFim, n = 6) {
  const meses = Array.from({ length: n }, (_, i) => addMonths(mesFim, i - (n - 1))).map((mes) => ({ mes, valores: gastoPorPessoaNoMes(d, mes) }))
  const ordem = [...(d.pessoas || []).map((p) => p.nome), nomeCasa(d.pessoas || [])]
  const nomes = [...new Set([...ordem, ...meses.flatMap((m) => Object.keys(m.valores))])].filter((nome) => meses.some((m) => (m.valores[nome] || 0) > 0))
  return { nomes, meses }
}

// Composição do mês: contas fixas, contas de valor variável e compras/parcelas. -> [{ mes, fixas, variaveis, compras }]
export function composicaoDosMeses(d, mesFim, n = 6) {
  return Array.from({ length: n }, (_, i) => addMonths(mesFim, i - (n - 1))).map((mes) => {
    const fx = fixosAtivos(fixosLiquidos(d), mes)
    const compras = comprasLiquidas(d).reduce((t, c) => t + gerarParcelas(c, d.cartoes).filter((p) => p.mes === mes).reduce((s, p) => s + p.valor, 0), 0)
    return {
      mes,
      fixas: r2(fx.filter((f) => !f.variavel).reduce((t, f) => t + Number(f.valor), 0)),
      variaveis: r2(fx.filter((f) => f.variavel).reduce((t, f) => t + Number(f.valor), 0)),
      compras: r2(compras),
    }
  })
}

// Parcelas que caem em cada um dos próximos n meses (calendário de quitação). -> [{ mes, total, qtd, terminam }]
export const quitacaoDosMeses = (d, mesInicio, n = 12) => calendarioQuitacao(d.compras, d.cartoes, mesInicio, n)

// ---------- Projeção e visões extras ----------

// Compras à vista (1 parcela) que caem em cada mês: é o gasto "do dia a dia" que ainda não foi lançado nos meses futuros.
const aVistaDoMes = (d, mes) => comprasLiquidas(d).reduce((t, c) => (Number(c.parcelas) > 1 ? t : t + gerarParcelas(c, d.cartoes).filter((p) => p.mes === mes).reduce((s, p) => s + p.valor, 0)), 0)

// Projeção dos próximos meses SE nada mudar: o que já está comprometido (parcelas, contas fixas, faturas) + o gasto à vista
// médio dos 3 meses anteriores (o que você costuma gastar no dia a dia e ainda não lançou). Renda: a cadastrada; sem ela, a última conhecida.
// -> [{ mes, renda, rendaEstimada, comprometido, aVistaEstimado, despesas, sobra, acumulada }]
export function projecao(d, mesInicio, n = 6) {
  const media = r2([1, 2, 3].reduce((t, i) => t + aVistaDoMes(d, addMonths(mesInicio, -i)), 0) / 3)
  const cache = new Map()
  let ultimaRenda = 0
  for (let i = 0; i <= 12 && !ultimaRenda; i++) ultimaRenda = rendaDoMes(d.rendas, addMonths(mesInicio, -i)).valor
  let acumulada = 0
  return Array.from({ length: n }, (_, i) => addMonths(mesInicio, i)).map((mes) => {
    const r = resumoDoMes(d, mes, { usarSaldoAnterior: false, cacheDetalhes: cache })
    const renda = r.renda > 0 ? r.renda : ultimaRenda
    const aVistaEstimado = r2(Math.max(0, media - aVistaDoMes(d, mes)))
    const despesas = r2(r.comprometido + aVistaEstimado)
    const sobra = r2(renda - despesas)
    acumulada = r2(acumulada + sobra)
    return { mes, renda: r2(renda), rendaEstimada: !(r.renda > 0), comprometido: r2(r.comprometido), aVistaEstimado, despesas, sobra, acumulada }
  })
}

// Sobra acumulada ao longo dos meses (soma da sobra de cada mês com dados). -> [{ mes, sobra, acumulada }]
export function sobraAcumulada(d, mesFim, n = 12) {
  let acumulada = 0
  return serieMensal(d, mesFim, n).map((l) => { if (l.temDados) acumulada = r2(acumulada + l.sobra); return { mes: l.mes, sobra: r2(l.sobra), acumulada, temDados: l.temDados } })
}

// Despesas de cada mês do ano `ano` e do anterior, lado a lado. Meses futuros ficam null. -> [{ mes (1-12), atual, anterior }]
export function anoAAno(d, ano, hoje) {
  const cache = new Map()
  const val = (a, m) => { const mes = `${a}-${String(m).padStart(2, '0')}`; const r = resumoParaSerie(d, mes, cache); return r.renda > 0 || r.despesas > 0 ? r2(r.despesas) : null }
  return Array.from({ length: 12 }, (_, i) => ({ mes: i + 1, atual: `${ano}-${String(i + 1).padStart(2, '0')}` <= hoje ? val(ano, i + 1) : null, anterior: val(ano - 1, i + 1) }))
}

// Progresso das metas ativas (saldo contra alvo). Reserva usa o custo do mês escolhido.
export function progressoDasMetas(d, hoje) {
  if (!(d.metas || []).length) return []
  const det = detalhePagamentos(d, hoje.slice(0, 7))
  const custos = { custoFixos: det.totalFixos, custoTotal: det.comprometido }
  return d.metas.filter((m) => m.ativa !== false).map((m) => ({ nome: m.nome, ...situacaoDaMeta(m, d.metasMovimentos || [], custos, hoje) })).filter((m) => m.alvo > 0)
}
