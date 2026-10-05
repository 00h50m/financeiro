import { fmt } from './utils.js'

// Resumo de gastos para o bot do Telegram: "/resumo", "/resumo semana", "quanto gastei em mercado este mês?".
// Soma o valor total das compras lançadas no período (compra parcelada conta inteira, na data da compra).

const dobrar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const somarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const fmtDia = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

// Período dito no texto; sem nada, vale o mês atual. Devolve { de, ate, nome, resto } (resto = texto sem o período).
export function periodoDe(texto, hoje) {
  let t = ` ${dobrar(texto)} `
  const tira = (re) => { const m = t.match(re); if (m) t = t.replace(re, ' '); return !!m }
  const mes = (iso) => iso.slice(0, 7)
  const mesAnterior = () => { const d = new Date(Date.parse(hoje.slice(0, 7) + '-15T12:00:00Z')); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10) }
  const doMes = (iso) => {
    const ini = mes(iso) + '-01'
    const fim = mes(iso) === mes(hoje) ? hoje : new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10)
    return { de: ini, ate: fim, nome: MESES[+iso.slice(5, 7) - 1] }
  }
  let p
  if (tira(/\s(?:no\s+)?mes\s+passado\s/)) p = doMes(mesAnterior())
  else if (tira(/\s(?:na\s+)?semana\s+passada\s/)) {
    const dow = (new Date(hoje + 'T12:00:00Z').getUTCDay() + 6) % 7 // 0 = segunda
    const seg = somarDias(hoje, -dow - 7)
    p = { de: seg, ate: somarDias(seg, 6), nome: 'semana passada' }
  } else if (tira(/\s(?:nesta|esta|na)?\s*semana\s/)) {
    const dow = (new Date(hoje + 'T12:00:00Z').getUTCDay() + 6) % 7
    p = { de: somarDias(hoje, -dow), ate: hoje, nome: 'esta semana' }
  } else if (tira(/\s(?:de\s+)?hoje\s/)) p = { de: hoje, ate: hoje, nome: 'hoje' }
  else if (tira(/\s(?:de\s+)?ontem\s/)) { const o = somarDias(hoje, -1); p = { de: o, ate: o, nome: 'ontem' } }
  else { tira(/\s(?:neste|este|no|do)?\s*mes(?:\s+atual)?\s/); p = doMes(hoje) }
  return { ...p, resto: t.replace(/\s+/g, ' ').trim() }
}

// "quanto gastei em mercado este mês?" -> { texto } com o que sobrou depois do verbo; null se não for pergunta.
export function interpretarPergunta(texto) {
  const m = dobrar(texto).trim().match(/^quanto\s+(?:eu\s+|a\s+gente\s+|nos\s+)?(?:gast(?:ei|amos|ou|o)|foi\s+gasto)\b\s*(.*)$/)
  return m ? { texto: m[1].replace(/[?!.]+$/, '').trim() } : null
}

const LIGACAO = new Set(['em', 'no', 'na', 'nos', 'nas', 'com', 'de', 'do', 'da', 'dos', 'das', 'o', 'a', 'os', 'as', 'pra', 'para', 'por', 'so', 'ja', 'ate', 'agora', 'tudo', 'total'])

// O que sobrou do texto vira filtro: categoria, subcategoria, descrição ou pessoa (nome/apelido).
export function filtroDe(resto, pessoas = []) {
  const palavras = dobrar(resto).split(/\s+/).filter((w) => w && !LIGACAO.has(w))
  if (!palavras.length) return null
  const termo = palavras.join(' ')
  const pessoa = pessoas.find((p) => [p.nome, ...(p.apelidos || [])].some((n) => dobrar(n) === termo))
  return pessoa ? { tipo: 'pessoa', termo, pessoa } : { tipo: 'termo', termo }
}

export function calcularResumo(compras, { de, ate, filtro = null }) {
  const noPeriodo = compras.filter((c) => {
    const d = String(c.data_compra || '').slice(0, 10)
    return d >= de && d <= ate && Number(c.valor_total) > 0
  })
  const casa = (c) => {
    if (!filtro) return true
    if (filtro.tipo === 'pessoa') return dobrar(c.pessoa) === dobrar(filtro.pessoa.nome)
    return [c.categoria, c.subcategoria, c.descricao, c.identificacao].some((x) => dobrar(x).includes(filtro.termo))
  }
  const lista = noPeriodo.filter(casa)
  const soma = (xs) => Math.round(xs.reduce((s, c) => s + Number(c.valor_total), 0) * 100) / 100
  const agrupar = (chave) => {
    const g = {}
    lista.forEach((c) => { const k = chave(c) || 'Sem categoria'; g[k] = (g[k] || 0) + Number(c.valor_total) })
    return Object.entries(g).map(([nome, v]) => [nome, Math.round(v * 100) / 100]).sort((a, b) => b[1] - a[1])
  }
  return { total: soma(lista), n: lista.length, porCategoria: agrupar((c) => c.categoria), porSubcategoria: agrupar((c) => c.subcategoria) }
}

export function formatarResumo(r, { nome, de, ate, filtro = null, aviso = true }) {
  const quando = de === ate ? `${nome}, ${fmtDia(de)}` : `${nome} (${fmtDia(de)} a ${fmtDia(ate)})`
  const quem = filtro ? ` com "${filtro.tipo === 'pessoa' ? filtro.pessoa.nome : filtro.termo}"` : ''
  if (!r.n) return `Não achei compras${quem} em ${quando}.`
  const linhas = [`Gastos${quem} em ${quando}: ${fmt(r.total)} em ${r.n} compra${r.n > 1 ? 's' : ''}.`]
  const detalhe = filtro && filtro.tipo === 'termo' && r.porSubcategoria.length > 1 ? r.porSubcategoria : r.porCategoria
  if (detalhe.length > 1 || !filtro) {
    linhas.push('', filtro && filtro.tipo === 'termo' ? 'Por subcategoria:' : 'Por categoria:')
    detalhe.slice(0, 6).forEach(([n, v]) => linhas.push(`• ${n}: ${fmt(v)}`))
    if (detalhe.length > 6) linhas.push(`• outras: ${fmt(detalhe.slice(6).reduce((s, [, v]) => s + v, 0))}`)
  }
  if (aviso) linhas.push('', 'Soma o valor total das compras lançadas (parceladas contam inteiras).')
  return linhas.join('\n')
}
