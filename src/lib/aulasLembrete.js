// Lembretes das aulas particulares (Telegram). Regras sem estado, para o cron diário:
//  · aulas de dias passados ainda como "prevista": todo dia, enquanto houver;
//  · mês anterior de aluno sem fechar: nos dias 1, 3, 5 e 7;
//  · fechamento sem recebimento há mais de 7 dias: às segundas.
import { fmt, mesLabel, addMonths } from './utils.js'
import { mesDe } from './aulas.js'
import { achaFechamento, fechadoStatus } from './aulasFechamento.js'
import { antesDoInicio } from './inicioApp.js'

const DIAS_FECHAR = [1, 3, 5, 7]
const dataBr = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export function pendenciasDeAulas({ alunos = [], aulas = [], aulasFech = [], inicioApp = null }, hoje) {
  const nome = new Map(alunos.map((a) => [a.id, a.nome]))
  const mesAtual = hoje.slice(0, 7)

  const atrasadas = []
  for (const al of alunos) {
    const lista = aulas.filter((a) => a.aluno_id === al.id && a.status === 'prevista' && a.data < hoje && !antesDoInicio(mesDe(a.data), inicioApp))
    if (lista.length) atrasadas.push({ aluno: al.nome, qtd: lista.length, desde: lista.map((a) => a.data).sort()[0] })
  }

  const dia = Number(hoje.slice(8, 10))
  const mesAnt = addMonths(mesAtual, -1)
  const fechar = []
  if (DIAS_FECHAR.includes(dia) && !antesDoInicio(mesAnt, inicioApp)) {
    const nomes = alunos.filter((al) => aulas.some((a) => a.aluno_id === al.id && mesDe(a.data) === mesAnt) && !fechadoStatus(achaFechamento(aulasFech, al.id, mesAnt))).map((al) => al.nome)
    if (nomes.length) fechar.push({ mes: mesAnt, alunos: nomes })
  }

  const receber = []
  const segunda = new Date(`${hoje}T12:00:00Z`).getUTCDay() === 1
  if (segunda) {
    const limite = somarDias(hoje, -7)
    for (const f of aulasFech) {
      if (f.status === 'fechado' && !f.recebido && Number(f.valor_centavos) > 0 && f.fechado_em && f.fechado_em.slice(0, 10) <= limite && nome.has(f.aluno_id)) {
        receber.push({ aluno: nome.get(f.aluno_id), mes: f.mes, valor: Number(f.valor_centavos) / 100 })
      }
    }
  }
  return { atrasadas, fechar, receber }
}

export function textoLembreteAulas(p) {
  if (!p.atrasadas.length && !p.fechar.length && !p.receber.length) return null
  const linhas = ['🎓 Aulas particulares']
  if (p.atrasadas.length) {
    linhas.push('', 'Para atualizar (a data já passou):')
    p.atrasadas.forEach((a) => linhas.push(`• ${a.aluno}: ${a.qtd} ${a.qtd === 1 ? 'aula ainda como prevista' : 'aulas ainda como previstas'} (desde ${dataBr(a.desde)})`))
  }
  if (p.fechar.length) {
    linhas.push('', 'Para fechar:')
    p.fechar.forEach((f) => linhas.push(`• ${mesLabel(f.mes)}: ${f.alunos.join(', ')}`))
  }
  if (p.receber.length) {
    linhas.push('', 'Fechado e ainda sem recebimento:')
    p.receber.forEach((r) => linhas.push(`• ${r.aluno} (${mesLabel(r.mes)}): ${fmt(r.valor)}`))
  }
  if (p.atrasadas.length) linhas.push('', 'Para atualizar por aqui: /aulas')
  linhas.push('', 'Para parar de receber avisos: /avisos off')
  return linhas.join('\n')
}
