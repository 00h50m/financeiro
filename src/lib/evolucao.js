// EVOLUÇÃO E INSIGHTS: séries, comparações e observações explicáveis, só com contas do motor financeiro.
// Mês fechado usa a foto gravada (nunca muda); mês aberto usa o cálculo ao vivo.
import { addMonths, gastosPorCategoria, gerarParcelas, mesLabel } from './utils.js'
import { resumoDoMes } from './financeiro.js'
import { comprasLiquidas, fixosLiquidos } from './divisoes.js'
import { fechamentoDe } from './fechamento.js'

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100 + 0

// Percentual só quando a base é relevante: base zero (ou quase) não gera "aumento de 1000%".
export function variacao(atual, referencia, { baseMinima = 1 } = {}) {
  const delta = arred(atual - referencia)
  if (!(Math.abs(referencia) >= baseMinima)) return { delta, pct: null }
  return { delta, pct: Math.round((delta / Math.abs(referencia)) * 100) }
}

export function resumoParaSerie(d, mes, cacheDetalhes) {
  const fech = fechamentoDe(d.fechamentos, mes)
  if (fech?.status === 'fechado') {
    return { mes, renda: Number(fech.renda), despesas: Number(fech.despesas), sobra: Number(fech.sobra), fonte: 'fechado', porCategoria: fech.por_categoria || {} }
  }
  const r = resumoDoMes(d, mes, { usarSaldoAnterior: false, cacheDetalhes })
  const mapa = gastosPorCategoria(comprasLiquidas(d), d.cartoes, fixosLiquidos(d), mes)
  return {
    mes, renda: arred(r.renda), despesas: arred(r.comprometido), sobra: arred(r.sobraDoMes), fonte: 'ao vivo',
    porCategoria: Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, arred(v.total)])),
  }
}

// Últimos `n` meses até `mesFim` (inclusive), do mais antigo ao mais novo. `temDados` evita linhas vazias enganosas.
export function serieMensal(d, mesFim, n = 12) {
  const cache = new Map()
  return Array.from({ length: n }, (_, i) => addMonths(mesFim, i - (n - 1))).map((m) => {
    const r = resumoParaSerie(d, m, cache)
    const taxa = r.renda > 0 ? Math.round((r.sobra / r.renda) * 100) : null
    return { ...r, taxaPoupanca: taxa, temDados: r.renda > 0 || r.despesas > 0 }
  })
}

export const mediaDe = (linhas, campo) => {
  const v = linhas.filter((l) => l.temDados).map((l) => Number(l[campo]) || 0)
  return v.length ? arred(v.reduce((s, x) => s + x, 0) / v.length) : null
}

// Comparativos de um campo ('despesas', 'renda', 'sobra') do mês contra: mês anterior, média de 3 e 6 meses
// anteriores e mesmo mês do ano passado. Referência sem dados vira null (a tela mostra "sem dados").
export function comparativos(d, mes, campo = 'despesas') {
  const cache = new Map()
  const val = (m) => resumoParaSerie(d, m, cache)
  const atual = val(mes)
  const anteriores = (n) => Array.from({ length: n }, (_, i) => val(addMonths(mes, -(i + 1)))).map((r) => ({ ...r, temDados: r.renda > 0 || r.despesas > 0 }))
  const ant = anteriores(1)[0]
  const ano = val(addMonths(mes, -12))
  const montar = (rotulo, ref) => (ref == null ? { rotulo, referencia: null } : { rotulo, referencia: ref, ...variacao(atual[campo], ref) })
  return {
    atual: atual[campo],
    itens: [
      montar('Mês anterior', ant.renda > 0 || ant.despesas > 0 ? ant[campo] : null),
      montar('Média dos 3 meses anteriores', mediaDe(anteriores(3), campo)),
      montar('Média dos 6 meses anteriores', mediaDe(anteriores(6), campo)),
      montar('Mesmo mês do ano passado', ano.renda > 0 || ano.despesas > 0 ? ano[campo] : null),
    ],
  }
}

const brl = (v) => 'R$ ' + Math.abs(v).toFixed(2).replace('.', ',')

// Observações explicáveis: cada uma traz o cálculo (`porque`). Sem opinião sem número.
export function insights(d, mes) {
  const lista = []
  const serie = serieMensal(d, mes, 7) // 6 anteriores + atual
  const atual = serie[serie.length - 1]
  const anteriores = serie.slice(0, -1)
  const ultimos3 = anteriores.slice(-3)

  // 1. Categorias que subiram frente à média dos 3 meses anteriores (mínimo de 30% e R$ 50)
  const cats = new Set(Object.keys(atual.porCategoria))
  for (const cat of cats) {
    const refs = ultimos3.filter((l) => l.temDados).map((l) => l.porCategoria[cat] || 0)
    if (refs.length < 2) continue
    const media = arred(refs.reduce((s, x) => s + x, 0) / refs.length)
    const v = variacao(atual.porCategoria[cat], media, { baseMinima: 50 })
    if (v.pct != null && v.pct >= 30 && v.delta >= 50) {
      lista.push({ id: `cat-${cat}`, nivel: 'atencao', texto: `${cat} subiu ${v.pct}% em ${mesLabel(mes)}.`, porque: `${brl(atual.porCategoria[cat])} neste mês contra média de ${brl(media)} nos ${refs.length} meses anteriores (+${brl(v.delta)}).` })
    }
  }

  // 2. Despesas acima da média de 6 meses
  const refDesp = mediaDe(anteriores, 'despesas')
  if (refDesp != null && atual.despesas > 0) {
    const v = variacao(atual.despesas, refDesp, { baseMinima: 100 })
    if (v.pct != null && v.pct >= 15) lista.push({ id: 'despesas-acima', nivel: 'atencao', texto: `As despesas de ${mesLabel(mes)} estão ${v.pct}% acima da média.`, porque: `${brl(atual.despesas)} contra média de ${brl(refDesp)} dos meses anteriores com dados.` })
    if (v.pct != null && v.pct <= -15) lista.push({ id: 'despesas-abaixo', nivel: 'bom', texto: `As despesas de ${mesLabel(mes)} estão ${Math.abs(v.pct)}% abaixo da média.`, porque: `${brl(atual.despesas)} contra média de ${brl(refDesp)} dos meses anteriores com dados.` })
  }

  // 3. Taxa de poupança
  if (atual.taxaPoupanca != null) {
    const refTaxa = mediaDe(anteriores.filter((l) => l.taxaPoupanca != null), 'taxaPoupanca')
    if (atual.taxaPoupanca < 0) lista.push({ id: 'negativo', nivel: 'atencao', texto: `${mesLabel(mes)} gasta mais do que entra.`, porque: `Renda ${brl(atual.renda)} − despesas ${brl(atual.despesas)} = −${brl(atual.sobra)}.` })
    else if (refTaxa != null && atual.taxaPoupanca >= refTaxa + 10) lista.push({ id: 'poupanca-boa', nivel: 'bom', texto: `Você está guardando mais que o normal em ${mesLabel(mes)}.`, porque: `Sobra de ${atual.taxaPoupanca}% da renda, contra média de ${Math.round(refTaxa)}% nos meses anteriores.` })
  }

  // 4. Parcelas que terminam no mês que vem: liberam orçamento
  const proximo = addMonths(mes, 1)
  let libera = 0
  const nomes = []
  for (const c of d.compras) {
    if (!(Number(c.parcelas) > 1)) continue
    const ps = gerarParcelas(c, d.cartoes)
    if (ps[ps.length - 1].mes === mes) { libera += ps[ps.length - 1].valor; nomes.push(c.descricao) }
  }
  if (libera > 0) lista.push({ id: 'parcelas-terminam', nivel: 'info', texto: `${nomes.length} ${nomes.length === 1 ? 'parcelamento termina' : 'parcelamentos terminam'} em ${mesLabel(mes)} e liberam ${brl(libera)} em ${mesLabel(proximo)}.`, porque: `Última parcela de: ${nomes.slice(0, 5).join(', ')}${nomes.length > 5 ? '...' : ''}.` })

  // 5. Maior categoria
  const top = Object.entries(atual.porCategoria).sort((a, b) => b[1] - a[1])[0]
  if (top && atual.despesas > 0) lista.push({ id: 'maior-categoria', nivel: 'info', texto: `A maior categoria de ${mesLabel(mes)} é ${top[0]}.`, porque: `${brl(top[1])}, ${Math.round((top[1] / atual.despesas) * 100)}% das despesas de ${brl(atual.despesas)}.` })

  return lista
}

// Evolução por categoria: mês escolhido x mês anterior.
export function evolucaoPorCategoria(d, mes) {
  const cache = new Map()
  const a = resumoParaSerie(d, mes, cache).porCategoria
  const b = resumoParaSerie(d, addMonths(mes, -1), cache).porCategoria
  return [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .map((cat) => ({ categoria: cat, atual: a[cat] || 0, anterior: b[cat] || 0, ...variacao(a[cat] || 0, b[cat] || 0, { baseMinima: 50 }) }))
    .sort((x, y) => y.atual - x.atual)
}
