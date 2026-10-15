// Aulas particulares pelo Telegram: lista das aulas para atualizar e registro por texto ("/aula Lucas hoje 1h").
import { lerDuracao, somarDias, mesDe, diaDaSemana, DIAS_CURTOS, textoDuracao, planejarGeracao, gerarOcorrencias, valorAula } from './aulas.js'
import { achaFechamento, fechadoStatus } from './aulasFechamento.js'
import { antesDoInicio } from './inicioApp.js'

const dobrar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const dataBr = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
export const rotuloAula = (aula, aluno) => `${aluno?.nome || 'Aluno'} · ${DIAS_CURTOS[diaDaSemana(aula.data)]} ${dataBr(aula.data)} · ${textoDuracao(aula.duracao_min)}`

export const mesFechadoDoAluno = (aulasFech, alunoId, data) => fechadoStatus(achaFechamento(aulasFech, alunoId, mesDe(data)))

// Aulas ainda "previstas" de hoje para trás, as mais recentes primeiro. `total` é quantas existem (a lista mostra até `limite`).
export function aulasParaAtualizar({ alunos = [], aulas = [], aulasFech = [], inicioApp = null }, hoje, { limite = 10 } = {}) {
  const porId = new Map(alunos.map((a) => [a.id, a]))
  const todas = aulas
    .filter((a) => a.status === 'prevista' && a.data <= hoje && porId.has(a.aluno_id) && !antesDoInicio(mesDe(a.data), inicioApp) && !mesFechadoDoAluno(aulasFech, a.aluno_id, a.data))
    .sort((a, b) => b.data.localeCompare(a.data) || (a.horario || '').localeCompare(b.horario || ''))
  return { itens: todas.slice(0, limite).map((aula) => ({ aula, aluno: porId.get(aula.aluno_id) })), total: todas.length }
}

// Aluno pelo nome digitado (sem acento, início ou parte do nome). { aluno } | { erro: 'nenhum' | 'varios', candidatos }
export function acharAluno(alunos, nome) {
  const q = dobrar(nome).trim()
  if (!q) return { erro: 'nenhum', candidatos: [] }
  const ativos = alunos.filter((a) => a.ativo !== false)
  const nomeInteiro = ativos.filter((a) => dobrar(a.nome) === q)
  const primeiroNome = ativos.filter((a) => dobrar(a.nome).split(/\s+/)[0] === q)
  const lista = nomeInteiro.length ? nomeInteiro : primeiroNome.length ? primeiroNome : ativos.filter((a) => dobrar(a.nome).includes(q))
  if (lista.length === 1) return { aluno: lista[0] }
  return { erro: lista.length ? 'varios' : 'nenhum', candidatos: lista }
}

// "Lucas hoje 1h30" · "ana ontem 90" · "lucas 13/10" -> { nome, data, minutos|null }. Data padrão: hoje.
export function lerComandoAula(texto, hoje) {
  let t = dobrar(texto).replace(/^\/?aulas?(?:@\w+)?\s*/, ' ').trim()
  let data = hoje
  const dm = t.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/)
  if (dm) {
    const ano = dm[3] ? (dm[3].length === 2 ? `20${dm[3]}` : dm[3]) : hoje.slice(0, 4)
    data = `${ano}-${dm[2].padStart(2, '0')}-${dm[1].padStart(2, '0')}`
    t = t.replace(dm[0], ' ')
  } else if (/\banteontem\b/.test(t)) { data = somarDias(hoje, -2); t = t.replace(/\banteontem\b/, ' ') }
  else if (/\bontem\b/.test(t)) { data = somarDias(hoje, -1); t = t.replace(/\bontem\b/, ' ') }
  else if (/\bhoje\b/.test(t)) t = t.replace(/\bhoje\b/, ' ')
  let minutos = null
  const palavras = t.split(/\s+/).filter(Boolean)
  const resto = []
  for (const p of palavras) {
    if (minutos == null && /^\d+(?:h\d{0,2}|[,.]\d+h?|min|m)?$/.test(p)) {
      const n = /^\d+$/.test(p) ? Number(p) : null
      const m = n != null ? (n <= 8 ? n * 60 : n) : lerDuracao(p) // "1" e "2" são horas; "45" e "90" são minutos
      if (m) { minutos = m; continue }
    }
    resto.push(p)
  }
  return { nome: resto.join(' '), data, minutos }
}

// Aulas ainda previstas de hoje (as do dia), por horário. Aulas sem horário vão no fim.
export function aulasDeHoje({ alunos = [], aulas = [], aulasFech = [], inicioApp = null }, hoje) {
  const porId = new Map(alunos.filter((a) => a.ativo !== false).map((a) => [a.id, a]))
  return aulas
    .filter((a) => a.status === 'prevista' && a.data === hoje && porId.has(a.aluno_id) && !antesDoInicio(mesDe(a.data), inicioApp) && !mesFechadoDoAluno(aulasFech, a.aluno_id, a.data))
    .sort((a, b) => (a.horario || '99:99').localeCompare(b.horario || '99:99'))
    .map((aula) => ({ aula, aluno: porId.get(aula.aluno_id) }))
}

// Teclado do Telegram: por aula, [✓ registrar como realizada] [✕ cancelar]. Os botões são tratados por tratarAula (callback "au").
export const tecladoAulas = (itens) => ({
  inline_keyboard: itens.map(({ aula, aluno }) => [
    { text: `✓ ${rotuloAula(aula, aluno)}`, callback_data: ['au', aula.id, 'r'].join('|') },
    { text: '✕', callback_data: ['au', aula.id, 'c'].join('|') },
  ]),
})

// O que falta criar no mês de `hoje` (aulas previstas pela programação e a previsão inicial), igual ao que o app faz ao abrir o mês.
export function planejarMesDoDia({ alunos = [], aulasProg = [], aulas = [], pausas = [], previsoes = [] }, hoje) {
  const mes = hoje.slice(0, 7)
  const novas = []
  const prev = []
  for (const al of alunos) {
    const progs = aulasProg.filter((p) => p.aluno_id === al.id)
    novas.push(...planejarGeracao(al, progs, aulas.filter((a) => a.aluno_id === al.id), mes, pausas))
    if (!previsoes.some((p) => p.aluno_id === al.id && p.mes === mes)) {
      const oc = gerarOcorrencias(al, progs, mes, pausas)
      if (oc.length) prev.push({ aluno_id: al.id, mes, qtd: oc.length, minutos: oc.reduce((s, o) => s + o.duracao_min, 0), valor_centavos: oc.reduce((s, o) => s + valorAula(al.valor_hora_centavos, o.duracao_min), 0) })
    }
  }
  return { novas, previsoes: prev }
}
