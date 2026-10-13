// Fechamento das aulas por aluno e ligação com a Renda. Tudo em centavos (aulas) — a conversão para reais acontece só em
// `aulasPorMes`/`rendasComAulas`, que alimentam o resto do app (que trabalha em reais).
import { aulasDoMes, contaNaPrevisao, duracaoEfetiva, mesDe, valorDaAula, diaDaSemana, DIAS, textoDuracao } from './aulas.js'

export const fechadoStatus = (f) => !!f && (f.status === 'fechado' || f.status === 'sem_cobranca')
export const achaFechamento = (fechamentos, alunoId, mes) => (fechamentos || []).find((f) => f.aluno_id === alunoId && f.mes === mes) || null

// Pendência = aula ainda "prevista" (só ela impede o fechamento; cancelada/não realizada já estão resolvidas).
export const pendenciasDoMes = (aulas, alunoId, mes) => aulasDoMes(aulas, mes, alunoId).filter((a) => a.status === 'prevista')

// Foto do mês do aluno: só aulas realizadas entram na cobrança.
export function montarFechamento(aulas, alunoId, mes) {
  const realizadas = aulasDoMes(aulas, mes, alunoId).filter((a) => a.status === 'realizada')
  const itens = realizadas.map((a) => ({ aula_id: a.id, data: a.data, horario: a.horario || null, minutos: duracaoEfetiva(a), valor_centavos: valorDaAula(a), origem: a.origem }))
  return { qtd_aulas: itens.length, minutos: itens.reduce((t, i) => t + i.minutos, 0), valor_centavos: itens.reduce((t, i) => t + i.valor_centavos, 0), itens }
}

// Valor do aluno no mês, para a Renda.
//  fechado → foto do fechamento · sem cobrança → 0 · senão → apurado + ainda previsto (competência).
//  recebido só conta se o fechamento registrou recebimento; aReceber = valor − recebido (pode ser negativo se recebeu a mais).
export function valorAlunoMes(aulas, fechamentos, alunoId, mes) {
  const f = achaFechamento(fechamentos, alunoId, mes)
  let valor
  if (f && f.status === 'sem_cobranca') valor = 0
  else if (f && f.status === 'fechado') valor = Number(f.valor_centavos) || 0
  else valor = aulasDoMes(aulas, mes, alunoId).filter(contaNaPrevisao).reduce((t, a) => t + valorDaAula(a), 0)
  const recebido = f && f.recebido ? Number(f.recebido_centavos ?? f.valor_centavos) || 0 : 0
  return { valor, recebido, aReceber: valor - recebido, fechamento: f }
}

// { 'AAAA-MM': { valor, recebido, aReceber (em reais), porAluno: [{alunoId, valor, recebido, aReceber, fechado}] } }
export function aulasPorMes(alunos, aulas, fechamentos) {
  const meses = new Set([...(aulas || []).map((a) => mesDe(a.data)), ...(fechamentos || []).map((f) => f.mes)])
  const out = {}
  for (const mes of meses) {
    const porAluno = []
    for (const al of alunos || []) {
      const v = valorAlunoMes(aulas || [], fechamentos || [], al.id, mes)
      if (v.valor || v.recebido) porAluno.push({ alunoId: al.id, nome: al.nome, valor: v.valor / 100, recebido: v.recebido / 100, aReceber: v.aReceber / 100, fechado: fechadoStatus(v.fechamento) })
    }
    if (!porAluno.length) continue
    const soma = (k) => Math.round(porAluno.reduce((t, p) => t + p[k], 0) * 100) / 100
    out[mes] = { valor: soma('valor'), recebido: soma('recebido'), aReceber: soma('aReceber'), porAluno }
  }
  return out
}

// Renda efetiva: o que foi digitado em Renda + o valor das aulas, somado em `extra_sabrina`. Mês só com aulas ganha uma linha sintética.
export function rendasComAulas(rendas, porMes) {
  const meses = Object.keys(porMes || {})
  if (!meses.length) return rendas
  const existentes = new Set(rendas.map((r) => r.mes))
  const somada = rendas.map((r) => (porMes[r.mes] ? { ...r, extra_sabrina: (Number(r.extra_sabrina) || 0) + porMes[r.mes].valor, extra_aulas: porMes[r.mes].valor } : r))
  const sinteticas = meses.filter((m) => !existentes.has(m)).map((m) => ({ id: `aulas-${m}`, mes: m, giovanna: 0, sabrina: 0, extra_sabrina: porMes[m].valor, extra_aulas: porMes[m].valor, mesada: 0, outros: 0, sintetica: true }))
  return [...somada, ...sinteticas].sort((a, b) => b.mes.localeCompare(a.mes))
}

// Mapa mes → reais ainda "a receber" (usado para tirar do "Disponível hoje").
export const aulasAReceberPorMes = (porMes) => Object.fromEntries(Object.entries(porMes || {}).filter(([, v]) => v.aReceber).map(([m, v]) => [m, v.aReceber]))

// Ao fechar de novo um mês que já tinha recebimento: diferença entre o recebido e o novo valor (em centavos; + falta receber, − recebeu a mais).
export const diferencaRecebimento = (fechamentoAnterior, novoValor) => (fechamentoAnterior && fechamentoAnterior.recebido ? novoValor - (Number(fechamentoAnterior.recebido_centavos ?? fechamentoAnterior.valor_centavos) || 0) : 0)

// ---------- mensagem para o responsável ----------

const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

// Só aulas realizadas entram na lista. Observações internas nunca entram. `resumo` acrescenta cancelamentos e reposições (opcional).
export function mensagemFechamento(aluno, mes, itens, valorCentavos, { resumo = false, aulasMes = [] } = {}) {
  const nome = aluno.responsavel ? aluno.responsavel.split(' ')[0] : null
  const linhas = [`Olá${nome ? `, ${nome}` : ''}! Segue o fechamento das aulas de ${aluno.nome} em ${MESES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}:`, '']
  for (const i of itens) linhas.push(`• ${dataCurta(i.data)} (${DIAS[diaDaSemana(i.data)].slice(0, 3)}) – ${textoDuracao(i.minutos)} – ${brl(i.valor_centavos)}`)
  linhas.push('', `Total: ${itens.length} ${itens.length === 1 ? 'aula' : 'aulas'}, ${textoDuracao(itens.reduce((t, i) => t + i.minutos, 0))} – ${brl(valorCentavos)}`)
  if (resumo) {
    const canc = aulasMes.filter((a) => a.status === 'cancelada' || a.status === 'nao_realizada')
    const repo = aulasMes.filter((a) => a.origem === 'reposicao' && a.status === 'realizada')
    if (canc.length) linhas.push('', `Aulas não realizadas no mês (sem cobrança): ${canc.map((a) => dataCurta(a.data)).join(', ')}`)
    if (repo.length) linhas.push(`Reposições realizadas: ${repo.map((a) => dataCurta(a.data)).join(', ')}`)
  }
  return linhas.join('\n')
}
