// Simulador de novo aluno / novo horário: quanto rende, se cabe na agenda e no limite de horas por semana. Valores em centavos.
import { programacaoVigente, DIAS } from './aulas.js'

export const CHAVE_LIMITE_HORAS = 'aulas_limite_horas_semana'
export const SEMANAS_POR_MES = 52 / 12
const DIA_INICIO = 6 * 60, DIA_FIM = 22 * 60

// config → minutos por semana (0 = sem limite)
export function lerLimite(config) {
  const n = Number(String(config?.[CHAVE_LIMITE_HORAS] ?? '').replace(',', '.'))
  return n > 0 ? Math.round(n * 60) : 0
}

const paraMin = (h) => { const m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
const paraHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// Agenda recorrente de hoje: uma entrada por dia/horário de cada aluno ativo.
// -> [{ alunoId, nome, dia, horario, inicio (min | null), duracao, valorHora, saida }]
export function agendaSemanal(alunos = [], programacoes = [], hoje) {
  const slots = []
  for (const a of alunos) {
    if (a.ativo === false) continue
    for (const p of programacaoVigente(programacoes.filter((x) => x.aluno_id === a.id), hoje)) {
      slots.push({ alunoId: a.id, nome: a.nome, dia: p.dia_semana, horario: p.horario || null, inicio: paraMin(p.horario), duracao: Number(p.duracao_min), valorHora: Number(a.valor_hora_centavos), saida: a.saida_prevista || null })
    }
  }
  return slots
}

export const cargaMinutos = (slots) => slots.reduce((t, s) => t + s.duracao, 0)
export const receitaMensal = (slots) => Math.round(slots.reduce((t, s) => t + (s.valorHora * s.duracao) / 60, 0) * SEMANAS_POR_MES)
export const mediaHora = (slots) => { const m = cargaMinutos(slots); return m ? Math.round(slots.reduce((t, s) => t + s.valorHora * s.duracao, 0) / m) : 0 }

// Novos horários que batem com aulas já existentes no mesmo dia. Sem horário informado não dá para checar.
export function conflitos(slots, novos) {
  const lista = []
  for (const n of novos) {
    if (n.inicio == null) continue
    for (const s of slots) {
      if (s.dia !== n.dia || s.inicio == null) continue
      if (n.inicio < s.inicio + s.duracao && s.inicio < n.inicio + n.duracao) lista.push({ novo: n, existente: s })
    }
  }
  return lista
}

// Janelas livres de um dia (entre 06:00 e 22:00), descontando as aulas com horário. -> [{ de: 'HH:MM', ate: 'HH:MM', minutos }]
export function janelasLivres(slots, dia, { de = DIA_INICIO, ate = DIA_FIM, minimo = 30 } = {}) {
  const ocupados = slots.filter((s) => s.dia === dia && s.inicio != null).map((s) => [s.inicio, s.inicio + s.duracao]).sort((a, b) => a[0] - b[0])
  const livres = []
  let cursor = de
  for (const [i, f] of ocupados) {
    if (i - cursor >= minimo) livres.push([cursor, Math.min(i, ate)])
    cursor = Math.max(cursor, f)
  }
  if (ate - cursor >= minimo) livres.push([cursor, ate])
  return livres.map(([a, b]) => ({ de: paraHora(a), ate: paraHora(b), minutos: b - a }))
}

// novos: [{ dia, horario|null, duracao }] · valorHora em centavos · limiteMin 0 = sem limite · metaCentavos 0 = sem meta
export function simularNovoAluno({ slots, novos, valorHora, limiteMin = 0, metaCentavos = 0, hoje }) {
  const novosN = novos.map((n) => ({ ...n, inicio: paraMin(n.horario), duracao: Number(n.duracao) }))
  const minNovos = cargaMinutos(novosN)
  const ganhoMensal = Math.round(((valorHora * minNovos) / 60) * SEMANAS_POR_MES)
  const antesMin = cargaMinutos(slots), depoisMin = antesMin + minNovos
  const receitaAntes = receitaMensal(slots), receitaDepois = receitaAntes + ganhoMensal
  const conf = conflitos(slots, novosN)
  const media = mediaHora(slots)
  // se os alunos com saída prevista saírem, sobra isto:
  const ficam = slots.filter((s) => !s.saida)
  const saem = slots.filter((s) => s.saida)
  const receitaSemSaidas = receitaMensal(ficam) + ganhoMensal
  const pontos = []
  if (conf.length) pontos.push({ tipo: 'ruim', texto: `Bate com ${conf.length === 1 ? 'uma aula' : `${conf.length} aulas`} já marcada${conf.length > 1 ? 's' : ''}: ${conf.map((c) => `${DIAS[c.novo.dia]} ${c.novo.horario} (${c.existente.nome} ${c.existente.horario})`).join(', ')}.` })
  if (novosN.some((n) => n.inicio == null)) pontos.push({ tipo: 'aviso', texto: 'Sem horário definido em algum dia: não dá para checar conflito.' })
  if (limiteMin > 0) {
    if (depoisMin > limiteMin) pontos.push({ tipo: 'ruim', texto: `Passa do seu limite: ${(depoisMin / 60).toFixed(1).replace('.', ',')} h/semana contra ${(limiteMin / 60).toFixed(1).replace('.', ',')} h.` })
    else if (depoisMin > limiteMin * 0.9) pontos.push({ tipo: 'atencao', texto: 'Ficaria acima de 90% do seu limite de horas: quase sem folga para reposições.' })
    else pontos.push({ tipo: 'bom', texto: `Cabe no limite: sobram ${((limiteMin - depoisMin) / 60).toFixed(1).replace('.', ',')} h/semana.` })
  }
  if (media > 0 && valorHora > 0) {
    if (valorHora < media * 0.85) pontos.push({ tipo: 'atencao', texto: 'Esse valor/hora fica abaixo da sua média atual: cada hora rende menos que as de hoje.' })
    else if (valorHora > media * 1.1) pontos.push({ tipo: 'bom', texto: 'Esse valor/hora fica acima da sua média atual.' })
  }
  if (metaCentavos > 0) {
    if (receitaAntes < metaCentavos && receitaDepois >= metaCentavos) pontos.push({ tipo: 'bom', texto: 'Com esse aluno a agenda passa a atingir a sua meta mensal.' })
    else if (receitaDepois < metaCentavos) pontos.push({ tipo: 'atencao', texto: 'Mesmo com esse aluno, a agenda ainda fica abaixo da meta mensal.' })
  }
  if (saem.length) {
    const nomes = [...new Set(saem.map((s) => s.nome))]
    pontos.push({ tipo: 'aviso', texto: `${nomes.join(', ')} ${nomes.length > 1 ? 'têm' : 'tem'} saída prevista: veja abaixo quanto a agenda rende sem ${nomes.length > 1 ? 'eles' : 'essa pessoa'}.` })
  }
  const ruim = conf.length > 0 || (limiteMin > 0 && depoisMin > limiteMin)
  const folgado = !ruim && (limiteMin === 0 || depoisMin <= limiteMin * 0.9) && (media === 0 || valorHora >= media * 0.85)
  return {
    veredito: !(valorHora > 0) || !novosN.length ? 'incompleto' : ruim ? 'nao' : folgado ? 'compensa' : 'apertado',
    ganhoMensal, ganhoAnual: ganhoMensal * 11, // 11 meses: descontando ~1 mês de férias
    minNovos, antesMin, depoisMin, limiteMin, pctLimiteDepois: limiteMin ? depoisMin / limiteMin : null,
    receitaAntes, receitaDepois, receitaSemSaidas, metaCentavos, mediaHora: media, conflitos: conf, pontos, hoje,
  }
}
