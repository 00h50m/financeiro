// Resumo do mês em texto simples (cabe em WhatsApp/Telegram): números do Dashboard, sem inventar nada.
import { fmt, mesLabel, addMonths, statusTeto } from './utils.js'
import { serieMensal } from './evolucao.js'
import { categoriasDoMes } from './graficos.js'
import { resumoDoMes } from './financeiro.js'
import { terminandoLogo } from './parcelamentos.js'
import { pendenciasValorVariavel } from './fixosVariaveis.js'

export function textoResumoMensal(d, mes, hoje) {
  const [ant, atual] = serieMensal(d, mes, 2)
  const linhas = [`📊 Resumo de ${mesLabel(mes)}`]
  if (!atual.temDados) return [...linhas, 'Ainda não há renda nem gastos neste mês.'].join('\n')
  const pctSobra = atual.renda > 0 ? Math.round((atual.sobra / atual.renda) * 100) : null
  linhas.push('', `Renda: ${fmt(atual.renda)}`, `Despesas: ${fmt(atual.despesas)}`, `${atual.sobra >= 0 ? 'Sobra' : 'Faltam'}: ${fmt(Math.abs(atual.sobra))}${pctSobra != null ? ` (${pctSobra}% da renda)` : ''}`)
  if (ant.temDados && ant.despesas > 0) {
    const dif = Math.round((atual.despesas - ant.despesas) * 100) / 100
    linhas.push(`Contra ${mesLabel(addMonths(mes, -1))}: despesas ${dif > 0 ? 'subiram' : dif < 0 ? 'caíram' : 'iguais'}${dif ? ` ${fmt(Math.abs(dif))} (${Math.round((Math.abs(dif) / ant.despesas) * 100)}%)` : ''}`)
  }
  const cats = categoriasDoMes(d, mes, 5)
  if (cats.itens.length) {
    linhas.push('', 'Onde foi o dinheiro:')
    cats.itens.forEach((c, i) => linhas.push(`${i + 1}. ${c.nome}: ${fmt(c.valor)} (${String(c.pct).replace('.', ',')}%)`))
  }
  const tetos = (d.orcamentos || []).map((o) => ({ cat: o.categoria, teto: Number(o.valor), gasto: Object.entries(atual.porCategoria || {}).find(([k]) => k === o.categoria)?.[1] || 0 }))
  const estourados = tetos.filter((t) => t.teto > 0 && statusTeto(t.gasto, t.teto) === 'estourou')
  const perto = tetos.filter((t) => t.teto > 0 && statusTeto(t.gasto, t.teto) === 'perto')
  if (estourados.length || perto.length) {
    linhas.push('', 'Orçamento:')
    estourados.forEach((t) => linhas.push(`⚠️ ${t.cat} passou do teto: ${fmt(t.gasto)} de ${fmt(t.teto)}`))
    perto.forEach((t) => linhas.push(`• ${t.cat} perto do teto: ${fmt(t.gasto)} de ${fmt(t.teto)}`))
  }
  const r = resumoDoMes(d, mes, { usarSaldoAnterior: false })
  if (r.aPagar > 0.005) linhas.push('', `Ainda a pagar neste mês: ${fmt(r.aPagar)}`)
  const acabam = terminandoLogo(d.compras, d.cartoes, mes, 0)
  if (acabam.length) linhas.push('', `🎉 Última parcela este mês: ${acabam.map((a) => a.compra.identificacao || a.compra.descricao).join(', ')} (libera ${fmt(acabam.reduce((t, a) => t + a.libera, 0))}/mês).`)
  const pend = pendenciasValorVariavel(d.fixos, hoje).filter((p) => p.mes === mes)
  if (pend.length) linhas.push('', `Contas variáveis ainda com valor estimado: ${pend.map((p) => p.fixo.nome).join(', ')}.`)
  return linhas.join('\n')
}
