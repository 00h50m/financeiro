// Relatório anual das aulas: mês a mês e por aluno. Valores em centavos. Só conta o que existe (aulas geradas / fechamentos), sem projeção.
import { aulasDoMes, duracaoEfetiva, mesDe } from './aulas.js'
import { valorAlunoMes, fechadoStatus } from './aulasFechamento.js'

const mesesDoAno = (ano) => Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, '0')}`)

export function linhaAlunoMes(aulas, fechamentos, alunoId, mes) {
  const doMes = aulasDoMes(aulas, mes, alunoId)
  const realizadas = doMes.filter((a) => a.status === 'realizada')
  const v = valorAlunoMes(aulas, fechamentos, alunoId, mes)
  return {
    realizadas: realizadas.length,
    minutos: realizadas.reduce((t, a) => t + duracaoEfetiva(a), 0),
    canceladas: doMes.filter((a) => a.status === 'cancelada' || a.status === 'nao_realizada').length,
    previstas: doMes.filter((a) => a.status === 'prevista').length,
    valor: doMes.length || v.fechamento ? v.valor : 0,
    recebido: v.recebido,
    aReceber: fechadoStatus(v.fechamento) ? v.aReceber : 0,
    fechado: fechadoStatus(v.fechamento),
    temAulas: doMes.length > 0 || !!v.fechamento,
  }
}

const somar = (linhas) => linhas.reduce((t, l) => ({
  realizadas: t.realizadas + l.realizadas, minutos: t.minutos + l.minutos, canceladas: t.canceladas + l.canceladas, previstas: t.previstas + l.previstas,
  valor: t.valor + l.valor, recebido: t.recebido + l.recebido, aReceber: t.aReceber + l.aReceber,
}), { realizadas: 0, minutos: 0, canceladas: 0, previstas: 0, valor: 0, recebido: 0, aReceber: 0 })

// -> { ano, meses: [{ mes, ...linha, fraco }], total, porAluno: [{ alunoId, nome, ...total }], media, fracos }
export function relatorioAnual(alunos, aulas, fechamentos, ano, alunoId = null) {
  const lista = alunos.filter((a) => !alunoId || a.id === alunoId)
  const meses = mesesDoAno(ano).map((mes) => {
    const ls = lista.map((a) => linhaAlunoMes(aulas, fechamentos, a.id, mes))
    return { mes, ...somar(ls), temAulas: ls.some((l) => l.temAulas), fechado: ls.some((l) => l.temAulas) && ls.filter((l) => l.temAulas).every((l) => l.fechado) }
  })
  const comValor = meses.filter((m) => m.valor > 0)
  const media = comValor.length ? Math.round(comValor.reduce((t, m) => t + m.valor, 0) / comValor.length) : 0
  const comFraco = meses.map((m) => ({ ...m, fraco: m.temAulas && media > 0 && m.valor < media * 0.6 }))
  const porAluno = lista.map((a) => ({ alunoId: a.id, nome: a.nome, ...somar(mesesDoAno(ano).map((mes) => linhaAlunoMes(aulas, fechamentos, a.id, mes))) }))
    .filter((p) => p.realizadas || p.canceladas || p.valor)
  return { ano, meses: comFraco, total: somar(meses), porAluno, media, fracos: comFraco.filter((m) => m.fraco).map((m) => m.mes) }
}

// Anos em que há aulas (para o seletor). Sempre inclui o ano informado.
export function anosComAulas(aulas, anoAtual) {
  return [...new Set([...aulas.map((a) => Number(mesDe(a.data).slice(0, 4))), anoAtual])].sort((a, b) => a - b)
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const num = (c) => (c / 100).toFixed(2).replace('.', ',')
const horas = (min) => (min / 60).toFixed(2).replace('.', ',')
// CSV com ponto e vírgula (abre direto no Excel em português).
export function csvRelatorio(r) {
  const cab = ['Mês', 'Aulas realizadas', 'Horas', 'Canceladas/não realizadas', 'Valor', 'Recebido', 'A receber']
  const linhas = r.meses.map((m, i) => [`${MESES[i]}/${r.ano}`, m.realizadas, horas(m.minutos), m.canceladas, num(m.valor), num(m.recebido), num(m.aReceber)])
  linhas.push(['Total', r.total.realizadas, horas(r.total.minutos), r.total.canceladas, num(r.total.valor), num(r.total.recebido), num(r.total.aReceber)])
  return [cab, ...linhas].map((l) => l.join(';')).join('\n')
}
