// Resumo do mês: dados estruturados (para a tela) e texto simples (para colar no WhatsApp/Telegram). Mesmos números do Dashboard.
import { fmt, mesLabel, addMonths, statusTeto } from './utils.js'
import { serieMensal } from './evolucao.js'
import { categoriasDoMes } from './graficos.js'
import { resumoDoMes } from './financeiro.js'
import { terminandoLogo } from './parcelamentos.js'
import { pendenciasValorVariavel } from './fixosVariaveis.js'

// -> { mes, titulo, vazio, kpis: [{ rotulo, valor, tom }], comparativo, categorias: [{ nome, valor, pct }], avisos: [{ tom, texto }] }
export function montarResumoMensal(d, mes, hoje) {
  const [ant, atual] = serieMensal(d, mes, 2)
  const base = { mes, titulo: `Resumo de ${mesLabel(mes)}`, vazio: !atual.temDados, kpis: [], comparativo: null, categorias: [], avisos: [] }
  if (base.vazio) return base
  const pctSobra = atual.renda > 0 ? Math.round((atual.sobra / atual.renda) * 100) : null
  base.kpis = [
    { rotulo: 'Renda', valor: fmt(atual.renda), tom: 'neutro' },
    { rotulo: 'Despesas', valor: fmt(atual.despesas), tom: 'neutro' },
    { rotulo: atual.sobra >= 0 ? 'Sobra' : 'Faltam', valor: fmt(Math.abs(atual.sobra)), tom: atual.sobra >= 0 ? 'bom' : 'ruim', nota: pctSobra != null ? `${pctSobra}% da renda` : '' },
  ]
  if (ant.temDados && ant.despesas > 0) {
    const dif = Math.round((atual.despesas - ant.despesas) * 100) / 100
    base.comparativo = { contra: mesLabel(addMonths(mes, -1)), dif, pct: Math.round((Math.abs(dif) / ant.despesas) * 100), texto: `Contra ${mesLabel(addMonths(mes, -1))}: despesas ${dif > 0 ? 'subiram' : dif < 0 ? 'caíram' : 'iguais'}${dif ? ` ${fmt(Math.abs(dif))} (${Math.round((Math.abs(dif) / ant.despesas) * 100)}%)` : ''}` }
  }
  base.categorias = categoriasDoMes(d, mes, 5).itens
  const tetos = (d.orcamentos || []).map((o) => ({ cat: o.categoria, teto: Number(o.valor), gasto: (atual.porCategoria || {})[o.categoria] || 0 }))
  tetos.filter((t) => t.teto > 0 && statusTeto(t.gasto, t.teto) === 'estourou').forEach((t) => base.avisos.push({ tom: 'ruim', texto: `${t.cat} passou do teto: ${fmt(t.gasto)} de ${fmt(t.teto)}` }))
  tetos.filter((t) => t.teto > 0 && statusTeto(t.gasto, t.teto) === 'perto').forEach((t) => base.avisos.push({ tom: 'atencao', texto: `${t.cat} perto do teto: ${fmt(t.gasto)} de ${fmt(t.teto)}` }))
  const r = resumoDoMes(d, mes, { usarSaldoAnterior: false })
  if (r.aPagar > 0.005) base.avisos.push({ tom: 'info', texto: `Ainda a pagar neste mês: ${fmt(r.aPagar)}` })
  const acabam = terminandoLogo(d.compras, d.cartoes, mes, 0)
  if (acabam.length) base.avisos.push({ tom: 'bom', texto: `Última parcela este mês: ${acabam.map((a) => a.compra.identificacao || a.compra.descricao).join(', ')} (libera ${fmt(acabam.reduce((t, a) => t + a.libera, 0))}/mês)` })
  const pend = pendenciasValorVariavel(d.fixos, hoje).filter((p) => p.mes === mes)
  if (pend.length) base.avisos.push({ tom: 'atencao', texto: `Contas variáveis ainda com valor estimado: ${[...new Set(pend.map((p) => p.fixo.nome))].join(', ')}` })
  return base
}

export function textoDoResumo(r) {
  const linhas = [`📊 ${r.titulo}`]
  if (r.vazio) return [...linhas, 'Ainda não há renda nem gastos neste mês.'].join('\n')
  linhas.push('', ...r.kpis.map((k) => `${k.rotulo}: ${k.valor}${k.nota ? ` (${k.nota})` : ''}`))
  if (r.comparativo) linhas.push(r.comparativo.texto)
  if (r.categorias.length) { linhas.push('', 'Onde foi o dinheiro:'); r.categorias.forEach((c, i) => linhas.push(`${i + 1}. ${c.nome}: ${fmt(c.valor)} (${String(c.pct).replace('.', ',')}%)`)) }
  if (r.avisos.length) { linhas.push(''); r.avisos.forEach((a) => linhas.push(`${a.tom === 'ruim' ? '⚠️' : a.tom === 'bom' ? '🎉' : '•'} ${a.texto}`)) }
  return linhas.join('\n')
}

export const textoResumoMensal = (d, mes, hoje) => textoDoResumo(montarResumoMensal(d, mes, hoje))
