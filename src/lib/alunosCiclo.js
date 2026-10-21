// Série do aluno, saída prevista e follow-up de pausas (aulas particulares). Datas AAAA-MM-DD.
export const SERIES = [
  ['6ef', '6º ano (fundamental)'], ['7ef', '7º ano (fundamental)'], ['8ef', '8º ano (fundamental)'], ['9ef', '9º ano (fundamental)'],
  ['1em', '1º ano (médio)'], ['2em', '2º ano (médio)'], ['3em', '3º ano (médio)'],
  ['pre', 'Pré-vestibular / cursinho'], ['fac', 'Faculdade'], ['outro', 'Outro'],
]
const NOME_SERIE = new Map(SERIES)
export const nomeSerie = (k) => NOME_SERIE.get(k) || ''
export const nomeSerieCurto = (k) => nomeSerie(k).replace(/ \((fundamental|médio)\)/, (_, g) => (g === 'médio' ? ' médio' : ' fund.'))

// Séries em que o aluno costuma encerrar as aulas particulares no fim do ano.
const FIM_DE_CICLO = new Set(['3em', 'pre'])
export const riscoDeSaida = (serie) => FIM_DE_CICLO.has(serie)

// Sugestão de saída: dezembro do ano em curso para quem termina o ciclo; nada para as demais séries.
export function saidaSugerida(serie, hoje) {
  return FIM_DE_CICLO.has(serie) ? `${hoje.slice(0, 4)}-12-20` : ''
}

const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

// Pausas de um aluno ativo a acompanhar: volta em até `antes` dias (ou já passou) e o follow-up ainda não foi feito.
// -> [{ pausa, aluno, retorno (1º dia de volta), dias (até o retorno; negativo = atrasado) }] ordenado pelo retorno.
export function followupsPausa(pausas = [], alunos = [], hoje, antes = 7) {
  const porId = new Map(alunos.map((a) => [a.id, a]))
  const lista = []
  for (const p of pausas) {
    const al = p.aluno_id ? porId.get(p.aluno_id) : null
    if (!al || al.ativo === false || p.followup_feito_em) continue
    const retorno = somarDias(p.fim, 1)
    const dias = diasEntre(hoje, retorno)
    if (dias > antes) continue
    if (dias < -60) continue // pausa muito antiga que ninguém marcou
    lista.push({ pausa: p, aluno: al, retorno, dias })
  }
  return lista.sort((a, b) => a.retorno.localeCompare(b.retorno))
}

// Alunos ativos que devem sair em até `dias` dias (ou já passou a data e ainda estão ativos).
export function saidasProximas(alunos = [], hoje, dias = 60) {
  return alunos
    .filter((a) => a.ativo !== false && a.saida_prevista)
    .map((a) => ({ aluno: a, saida: a.saida_prevista, dias: diasEntre(hoje, a.saida_prevista) }))
    .filter((x) => x.dias <= dias)
    .sort((a, b) => a.saida.localeCompare(b.saida))
}
