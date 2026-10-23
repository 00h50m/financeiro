// Check-in de domingo do "Meu plano" (Telegram): a semana contra os tetos, a próxima semana e os próximos passos do plano.
import { fmt, mesLabel, addMonths } from './utils.js'
import { reservaVariavel } from './gastoVariavel.js'
import { tetosDaSemana, acompanhamentoSemana } from './semanaPlano.js'

const ICONE = { ok: '✅', atencao: '⚠️', estourou: '🔴' }
const dm = (iso) => iso.split('-').reverse().slice(0, 2).join('/')

// `plano`: o JSON do plano ativo (ou null). `compras`: compras dos últimos ~4 meses até hoje. -> texto ou null (nada a dizer: sem plano e sem histórico).
export function montarCheckinPlano({ plano, compras, hoje, planoDe = null }) {
  const reserva = reservaVariavel(compras, hoje.slice(0, 7))
  const tetos = tetosDaSemana(plano, reserva)
  if (!tetos.length) return null
  const a = acompanhamentoSemana({ compras, tetos, hoje })
  const linhas = [`🎯 Check-in do plano · semana ${dm(a.semana.inicio)} a ${dm(a.semana.fim)}`, '']
  const t = a.total
  linhas.push(`${ICONE[t.status]} Dia a dia: ${fmt(t.gasto)} de ${fmt(t.teto)}${t.restante >= 0 ? ` (sobraram ${fmt(t.restante)})` : ` (passou ${fmt(-t.restante)})`}`)
  const estourados = a.itens.filter((i) => i.status === 'estourou')
  const aoLimite = a.itens.filter((i) => i.status === 'atencao')
  for (const i of [...estourados, ...aoLimite].slice(0, 5)) linhas.push(`${ICONE[i.status]} ${i.categoria}: ${fmt(i.gasto)} de ${fmt(i.teto)}`)
  const bem = a.itens.filter((i) => i.status === 'ok' && i.teto > 0)
  if (bem.length && estourados.length + aoLimite.length < a.itens.length) linhas.push(`✅ Dentro do teto: ${bem.slice(0, 5).map((i) => i.categoria).join(', ')}`)
  if (a.semTeto.length) linhas.push(`Sem teto: ${a.semTeto.slice(0, 3).map((x) => `${x.categoria} ${fmt(x.gasto)}`).join(' · ')}`)

  const ant = a.anteriores.filter((x) => x.gasto > 0)
  if (ant.length) {
    const media = ant.reduce((s, x) => s + x.gasto, 0) / ant.length
    linhas.push('', `Nas últimas ${ant.length} semanas você gastou em média ${fmt(media)} por semana${t.teto ? ` (teto ${fmt(t.teto)})` : ''}.`)
  }

  linhas.push('', 'Próxima semana (tetos):')
  for (const x of tetos.slice(0, 6)) linhas.push(`• ${x.categoria}: ${fmt(x.valor)}`)

  const limite = addMonths(hoje.slice(0, 7), 1)
  const passos = (plano?.acoes || []).filter((x) => !x.quando || !/^\d{4}-\d{2}$/.test(x.quando) || x.quando <= limite).slice(0, 3)
  if (passos.length) {
    linhas.push('', 'Próximos passos do plano:')
    for (const p of passos) linhas.push(`• ${p.acao}${p.valor != null ? ` (${fmt(p.valor)})` : ''}${p.quando && /^\d{4}-\d{2}$/.test(p.quando) ? ` · ${mesLabel(p.quando)}` : ''}`)
  }
  if (plano) {
    if (plano.meta?.mes_de_volta_ao_azul) linhas.push('', `Meta: voltar ao azul em ${mesLabel(plano.meta.mes_de_volta_ao_azul)}.`)
    if (planoDe) linhas.push(`Plano de ${planoDe.split('-').reverse().join('/')}: revise no app se a vida mudou.`)
  } else linhas.push('', 'Tetos pela média dos seus últimos 3 meses. Gere o seu plano no app, em Meu plano, para ajustar.')
  return linhas.join('\n')
}
