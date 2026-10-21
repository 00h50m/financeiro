// Relatório detalhado das aulas particulares: por aluno, por mês, por série e risco de perda, num período livre de meses.
// Valores em centavos. Só conta o que existe (aulas geradas / fechamentos), sem projeção, exceto o risco (média dos últimos meses).
import { addMonths } from './utils.js'
import { linhaAlunoMes } from './aulasRelatorio.js'
import { SERIES, nomeSerie, riscoDeSaida } from './alunosCiclo.js'

export const mesesEntre = (de, ate) => {
  const l = []
  for (let m = de; m <= ate && l.length < 120; m = addMonths(m, 1)) l.push(m)
  return l
}
const meses = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7))

const zero = () => ({ realizadas: 0, minutos: 0, canceladas: 0, previstas: 0, valor: 0, recebido: 0, aReceber: 0 })
const soma = (t, l) => ({
  realizadas: t.realizadas + l.realizadas, minutos: t.minutos + l.minutos, canceladas: t.canceladas + l.canceladas, previstas: t.previstas + l.previstas,
  valor: t.valor + l.valor, recebido: t.recebido + l.recebido, aReceber: t.aReceber + l.aReceber,
})
// valor por hora efetivamente rendido (valor ÷ horas realizadas); null sem horas
const porHora = (valor, minutos) => (minutos > 0 ? Math.round((valor * 60) / minutos) : null)

export function relatorioDetalhado({ alunos = [], aulas = [], fechamentos = [], pausas = [], de, ate, hoje, metaCentavos = 0 }) {
  const lista = mesesEntre(de, ate)
  const mesAtual = hoje.slice(0, 7)

  // aluno × mês
  const matriz = new Map(alunos.map((a) => [a.id, lista.map((mes) => ({ mes, ...linhaAlunoMes(aulas, fechamentos, a.id, mes) }))]))

  const porAluno = alunos.map((a) => {
    const ls = matriz.get(a.id)
    const t = ls.reduce(soma, zero())
    const doPeriodo = aulas.filter((x) => x.aluno_id === a.id && x.data.slice(0, 7) >= de && x.data.slice(0, 7) <= ate)
    const remarcacoes = doPeriodo.reduce((n, x) => n + (x.historico || []).filter((h) => h.tipo === 'remarcada').length, 0)
    const planejadas = t.realizadas + t.canceladas
    const pausadoAgora = pausas.some((p) => p.aluno_id === a.id && p.inicio <= hoje && p.fim >= hoje)
    return {
      alunoId: a.id, nome: a.nome, serie: a.serie || '', ativo: a.ativo !== false, pausado: pausadoAgora, saida: a.saida_prevista || '', motivoEncerramento: a.motivo_encerramento || '',
      ...t, porHora: porHora(t.valor, t.minutos), taxaCancel: planejadas ? t.canceladas / planejadas : 0, remarcacoes,
      avulsas: doPeriodo.filter((x) => x.origem === 'avulsa').length,
      mesesDeCasa: Math.max(0, meses(a.inicio.slice(0, 7), mesAtual)),
    }
  }).filter((p) => p.realizadas || p.canceladas || p.valor || p.previstas)
  const total = porAluno.reduce(soma, zero())
  porAluno.forEach((p) => { p.pctReceita = total.valor ? p.valor / total.valor : 0 })
  porAluno.sort((a, b) => b.valor - a.valor)

  // mês a mês
  const mesesLinhas = lista.map((mes, i) => {
    const ls = alunos.map((a) => matriz.get(a.id)[i])
    const t = ls.reduce(soma, zero())
    return { mes, ...t, alunos: ls.filter((l) => l.valor > 0 || l.realizadas > 0).length, porHora: porHora(t.valor, t.minutos), temAulas: ls.some((l) => l.temAulas), abaixoDaMeta: metaCentavos > 0 && ls.some((l) => l.temAulas) && t.valor < metaCentavos }
  })
  mesesLinhas.forEach((m, i) => { const ant = mesesLinhas[i - 1]; m.variacao = ant && ant.valor > 0 && m.temAulas ? (m.valor - ant.valor) / ant.valor : null })

  // por série
  const grupos = new Map()
  for (const p of porAluno) {
    const k = p.serie || ''
    const g = grupos.get(k) || { serie: k, nome: nomeSerie(k) || 'Sem série informada', alunos: 0, ...zero() }
    Object.assign(g, soma(g, p), { alunos: g.alunos + 1 })
    grupos.set(k, g)
  }
  const ordem = new Map([...SERIES.map(([k], i) => [k, i]), ['', 99]])
  const porSerie = [...grupos.values()].map((g) => ({ ...g, porHora: porHora(g.valor, g.minutos), pctReceita: total.valor ? g.valor / total.valor : 0 })).sort((a, b) => (ordem.get(a.serie) ?? 98) - (ordem.get(b.serie) ?? 98))

  // risco de perda: média mensal dos últimos 3 meses (até o mês atual) dos alunos ativos que tendem a sair
  const ult = [addMonths(mesAtual, -2), addMonths(mesAtual, -1), mesAtual]
  const mediaMensal = (id) => {
    const vs = ult.map((m) => linhaAlunoMes(aulas, fechamentos, id, m).valor).filter((v) => v > 0)
    return vs.length ? Math.round(vs.reduce((t, v) => t + v, 0) / vs.length) : 0
  }
  const ativos = alunos.filter((a) => a.ativo !== false)
  const receitaMensalTotal = ativos.reduce((t, a) => t + mediaMensal(a.id), 0)
  const risco = []
  for (const a of ativos) {
    const dias = a.saida_prevista ? Math.round((Date.parse(`${a.saida_prevista}T12:00:00Z`) - Date.parse(`${hoje}T12:00:00Z`)) / 86400000) : null
    const pausadoAgora = pausas.some((p) => p.aluno_id === a.id && p.inicio <= hoje && p.fim >= hoje)
    const motivos = []
    if (dias != null && dias <= 90) motivos.push(dias < 0 ? 'passou da saída prevista' : `sai em ${dias} dias`)
    else if (dias != null && dias <= 200) motivos.push('saída prevista este ano')
    if (riscoDeSaida(a.serie) && dias == null) motivos.push(`${nomeSerie(a.serie)}: costuma encerrar no fim do ano`)
    if (pausadoAgora) motivos.push('pausado agora')
    if (!motivos.length) continue
    const nivel = dias != null && dias <= 90 ? 'alto' : 'medio'
    risco.push({ alunoId: a.id, nome: a.nome, serie: a.serie || '', saida: a.saida_prevista || '', dias, pausado: pausadoAgora, motivos, nivel, mediaMensal: mediaMensal(a.id) })
  }
  risco.sort((a, b) => (a.dias ?? 9999) - (b.dias ?? 9999) || b.mediaMensal - a.mediaMensal)
  const emRisco = risco.reduce((t, r) => t + r.mediaMensal, 0)

  return {
    de, ate, meses: mesesLinhas, porAluno, porSerie, total: { ...total, porHora: porHora(total.valor, total.minutos), alunos: porAluno.length },
    risco: { lista: risco, valorMensal: emRisco, pct: receitaMensalTotal ? emRisco / receitaMensalTotal : 0, receitaMensalTotal },
  }
}

const num = (c) => (c / 100).toFixed(2).replace('.', ',')
const horas = (min) => (min / 60).toFixed(2).replace('.', ',')
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%'
// CSV (ponto e vírgula) de cada visão.
export function csvDetalhado(r, visao) {
  let linhas
  if (visao === 'aluno') {
    linhas = [['Aluno', 'Série', 'Situação', 'Aulas', 'Horas', 'Valor', 'R$/hora', '% da receita', 'Canceladas', 'Taxa de cancelamento', 'Remarcações', 'Avulsas', 'Meses de casa', 'A receber'],
      ...r.porAluno.map((p) => [p.nome, nomeSerie(p.serie), !p.ativo ? 'encerrado' : p.pausado ? 'pausado' : 'ativo', p.realizadas, horas(p.minutos), num(p.valor), p.porHora == null ? '' : num(p.porHora), pct(p.pctReceita), p.canceladas, pct(p.taxaCancel), p.remarcacoes, p.avulsas, p.mesesDeCasa, num(p.aReceber)])]
  } else if (visao === 'mes') {
    linhas = [['Mês', 'Alunos', 'Aulas', 'Horas', 'Valor', 'R$/hora', 'Variação', 'Recebido', 'A receber'],
      ...r.meses.map((m) => [m.mes, m.alunos, m.realizadas, horas(m.minutos), num(m.valor), m.porHora == null ? '' : num(m.porHora), m.variacao == null ? '' : pct(m.variacao), num(m.recebido), num(m.aReceber)])]
  } else if (visao === 'serie') {
    linhas = [['Série', 'Alunos', 'Aulas', 'Horas', 'Valor', 'R$/hora', '% da receita'],
      ...r.porSerie.map((g) => [g.nome, g.alunos, g.realizadas, horas(g.minutos), num(g.valor), g.porHora == null ? '' : num(g.porHora), pct(g.pctReceita)])]
  } else {
    linhas = [['Aluno', 'Série', 'Saída prevista', 'Média mensal', 'Motivo'], ...r.risco.lista.map((x) => [x.nome, nomeSerie(x.serie), x.saida, num(x.mediaMensal), x.motivos.join(' / ')])]
  }
  return linhas.map((l) => l.join(';')).join('\n')
}
