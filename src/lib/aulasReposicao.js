// Reposição de saídas: quanto a agenda perde quando os alunos de fim de ciclo saírem e quantos alunos novos repõem isso.
// Valores em centavos. Usa a agenda fixa de hoje (sem avulsas/reposições); a saída conta a partir do mês seguinte à data prevista.
import { addMonths } from './utils.js'
import { DIAS } from './aulas.js'
import { agendaSemanal, cargaMinutos, receitaMensal, mediaHora, SEMANAS_POR_MES } from './aulasSimulador.js'
import { riscoDeSaida } from './alunosCiclo.js'

// Saída efetiva: a prevista no cadastro; sem ela, quem está em série de fim de ciclo sai em dezembro (estimada).
export function saidaEfetiva(aluno, hoje) {
  if (aluno.saida_prevista) return { data: aluno.saida_prevista, estimada: false }
  if (riscoDeSaida(aluno.serie)) {
    const ano = Number(hoje.slice(0, 4))
    return { data: `${hoje > `${ano}-12-20` ? ano + 1 : ano}-12-20`, estimada: true }
  }
  return null
}

export function planoReposicao({ alunos = [], programacoes = [], hoje, valorHora = 0, horasPorAluno = 120, antecedenciaMeses = 2, horizonte = 12 }) {
  const slots = agendaSemanal(alunos, programacoes, hoje)
  const porId = new Map(alunos.map((a) => [a.id, a]))
  const saidas = new Map() // alunoId -> { data, estimada, mesSaida (último mês com aulas) }
  for (const a of alunos) {
    if (a.ativo === false) continue
    const s = saidaEfetiva(a, hoje)
    if (s && slots.some((x) => x.alunoId === a.id)) saidas.set(a.id, { ...s, ultimoMes: s.data.slice(0, 7) })
  }
  const mesAtual = hoje.slice(0, 7)
  const receitaHoje = receitaMensal(slots)
  const linhas = []
  for (let i = 0; i <= horizonte; i++) {
    const mes = addMonths(mesAtual, i)
    const ficam = slots.filter((s) => { const x = saidas.get(s.alunoId); return !x || x.ultimoMes >= mes })
    linhas.push({ mes, receita: receitaMensal(ficam), minutos: cargaMinutos(ficam), alunos: new Set(ficam.map((s) => s.alunoId)).size })
  }
  linhas.forEach((l) => { l.perda = receitaHoje - l.receita })

  const lista = [...saidas.entries()].map(([id, x]) => {
    const meus = slots.filter((s) => s.alunoId === id)
    const aluno = porId.get(id)
    return {
      alunoId: id, nome: aluno.nome, serie: aluno.serie || '', saida: x.data, estimada: x.estimada, ultimoMes: x.ultimoMes,
      receitaMensal: receitaMensal(meus), minutos: cargaMinutos(meus), slots: meus.map((s) => ({ dia: s.dia, nomeDia: DIAS[s.dia], horario: s.horario, duracao: s.duracao })),
      captarAte: addMonths(x.ultimoMes, -Number(antecedenciaMeses || 0)),
    }
  }).sort((a, b) => a.saida.localeCompare(b.saida))

  const perdaTotal = lista.reduce((t, x) => t + x.receitaMensal, 0)
  const minutosVagos = lista.reduce((t, x) => t + x.minutos, 0)
  const ganhoPorAluno = Math.round(((valorHora * horasPorAluno) / 60) * SEMANAS_POR_MES)
  const alunosNecessarios = ganhoPorAluno > 0 ? Math.ceil(perdaTotal / ganhoPorAluno) : 0
  // cada saída vira "N alunos para repor" na mesma data (para saber quando começar a captar)
  const porSaida = lista.map((x) => ({ ...x, alunosParaRepor: ganhoPorAluno > 0 ? Math.ceil(x.receitaMensal / ganhoPorAluno) : 0 }))
  const base = cargaMinutos(slots)
  return {
    receitaHoje, receitaDepois: receitaHoje - perdaTotal, perdaTotal, pctPerda: receitaHoje ? perdaTotal / receitaHoje : 0,
    minutosHoje: base, minutosDepois: base - minutosVagos, minutosVagos, mediaHora: mediaHora(slots),
    linhas, saidas: porSaida, ganhoPorAluno, alunosNecessarios, horasNovasPorSemana: valorHora > 0 ? (perdaTotal * 60) / (valorHora * SEMANAS_POR_MES) / 60 : 0,
    semSaidas: lista.length === 0,
    semDataOuSerie: alunos.filter((a) => a.ativo !== false && !a.serie && !a.saida_prevista).length,
  }
}
