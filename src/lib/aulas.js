// Aulas particulares: regras de calendário, valores e estados. Tudo determinístico e testável, sem tela.
// Convenções: valores em CENTAVOS inteiros · duração em MINUTOS · datas como texto 'AAAA-MM-DD' (data local, sem fuso).

export const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
export const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
export const DURACOES = [30, 45, 60, 90, 120]
export const STATUS = { prevista: 'Prevista', realizada: 'Realizada', cancelada: 'Cancelada', nao_realizada: 'Não realizada' }

const pad = (n) => String(n).padStart(2, '0')
const utc = (iso) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))))
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`

export const mesDe = (data) => String(data).slice(0, 7)
export const diaDaSemana = (data) => utc(data).getUTCDay()
export const somarDias = (data, n) => { const d = utc(data); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
export const ultimoDiaDoMes = (mes) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate()

// Todas as datas de um dia da semana dentro do mês (4 ou 5 ocorrências).
export function datasDaSemanaNoMes(mes, dow) {
  const out = []
  for (let d = 1; d <= ultimoDiaDoMes(mes); d++) {
    const data = `${mes}-${pad(d)}`
    if (diaDaSemana(data) === dow) out.push(data)
  }
  return out
}

// ---------- dinheiro e duração ----------

// valor da aula = valor por hora × minutos ÷ 60, em centavos inteiros (arredonda para o centavo mais próximo)
export const valorAula = (valorHoraCentavos, minutos) => Math.round((Number(valorHoraCentavos) * Number(minutos)) / 60)

export const reaisParaCentavos = (reais) => {
  let t = String(reais ?? '').trim().replace(/\s|R\$/g, '')
  if (!t) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.') // 1.234,56
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '') // 1.234 (milhar)
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}
export const centavosParaReais = (c) => Number(c || 0) / 100

export function textoDuracao(min) {
  const m = Math.max(0, Math.round(Number(min) || 0))
  const h = Math.floor(m / 60)
  const r = m % 60
  if (h && r) return `${h}h${pad(r)}`
  if (h) return `${h}h`
  return `${r}min`
}

// duração digitada: "90", "1h30", "1,5" (horas), "45min", "1h" → minutos (ou null)
export function lerDuracao(texto) {
  const t = String(texto ?? '').trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let m = t.match(/^(\d+)h(\d{1,2})?(?:min)?$/)
  if (m) return Number(m[1]) * 60 + Number(m[2] || 0) || null
  m = t.match(/^(\d+)(?:min|m)?$/)
  if (m) return Number(m[1]) > 0 ? Number(m[1]) : null
  m = t.match(/^(\d+)[,.](\d+)h?$/)
  if (m) { const h = Number(`${m[1]}.${m[2]}`); return h > 0 ? Math.round(h * 60) : null }
  return null
}

// ---------- geração das aulas previstas ----------

// Última data em que ainda se geram aulas do aluno (fim das aulas ou inativação), ou null.
function limiteDoAluno(aluno) {
  const lim = []
  if (aluno.fim) lim.push(aluno.fim)
  if (aluno.ativo === false) lim.push(aluno.inativado_em || '0000-00-00') // inativo sem data: não gera mais nada
  return lim.length ? lim.sort()[0] : null
}

// Ocorrências recorrentes de um aluno num mês, conforme programação, vigências, início e término. Ordenadas por data/horário.
// Períodos sem aula (férias, feriados). `pausas`: { inicio, fim, aluno_id (null = todos os alunos), motivo }.
export const emPausa = (pausas, alunoId, data) => (pausas || []).some((p) => (!p.aluno_id || p.aluno_id === alunoId) && data >= p.inicio && data <= p.fim)
// Aulas ainda previstas que caem num período sem aula (para cancelar quando o período é criado).
export const previstasNaPausa = (aulas, pausa) => aulas.filter((a) => a.status === 'prevista' && (!pausa.aluno_id || a.aluno_id === pausa.aluno_id) && a.data >= pausa.inicio && a.data <= pausa.fim)

export function gerarOcorrencias(aluno, programacoes, mes, pausas = []) {
  const limite = limiteDoAluno(aluno)
  const out = []
  for (const p of programacoes) {
    for (const data of datasDaSemanaNoMes(mes, Number(p.dia_semana))) {
      if (data < aluno.inicio || data < p.vigencia_inicio) continue
      if (p.vigencia_fim && data > p.vigencia_fim) continue
      if (limite && data > limite) continue
      if (emPausa(pausas, aluno.id, data)) continue
      out.push({ programacao_id: p.id, data, data_original: data, horario: p.horario || null, duracao_min: Number(p.duracao_min) })
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || ''))
}

// O que falta criar: ocorrências do mês que ainda não existem (por programação + data original). Uma aula remarcada
// continua "ocupando" a data original, então não é recriada. Nunca mexe no que já existe.
export function planejarGeracao(aluno, programacoes, aulasExistentes, mes, pausas = []) {
  const feitas = new Set(aulasExistentes.filter((a) => a.programacao_id).map((a) => `${a.programacao_id}|${a.data_original}`))
  return gerarOcorrencias(aluno, programacoes, mes, pausas)
    .filter((o) => !feitas.has(`${o.programacao_id}|${o.data_original}`))
    .map((o) => ({
      aluno_id: aluno.id, ...o, valor_hora_centavos: Number(aluno.valor_hora_centavos), valor_hora_manual: false,
      status: 'prevista', origem: 'recorrente', historico: [],
    }))
}

// Aulas do mês (pela data atual da aula, não pela original).
export const aulasDoMes = (aulas, mes, alunoId = null) => aulas.filter((a) => mesDe(a.data) === mes && (!alunoId || a.aluno_id === alunoId))
  .sort((a, b) => a.data.localeCompare(b.data) || (a.horario || '').localeCompare(b.horario || ''))

// ---------- valores de uma aula ----------

export const duracaoEfetiva = (a) => (a.status === 'realizada' ? Number(a.duracao_real_min || a.duracao_min) : Number(a.duracao_min))
// Realizada: valor gravado na confirmação (não muda se o valor padrão do aluno mudar). Outras: calculado.
export function valorDaAula(a) {
  if (a.status === 'realizada') return a.valor_centavos != null ? Number(a.valor_centavos) : valorAula(a.valor_hora_centavos, duracaoEfetiva(a))
  return valorAula(a.valor_hora_centavos, a.duracao_min)
}
export const contaNaPrevisao = (a) => a.status === 'prevista' || a.status === 'realizada'

// ---------- mudanças de estado (devolvem o patch a gravar) ----------

const registro = (a, tipo, extra = {}, agora) => [...(a.historico || []), { em: agora, tipo, ...extra }]

export function patchRealizar(a, minutos, agora) {
  const min = Number(minutos || a.duracao_min)
  return {
    status: 'realizada', duracao_real_min: min, valor_centavos: valorAula(a.valor_hora_centavos, min),
    confirmada_em: agora, status_em: agora, quem: null, motivo: null,
    historico: registro(a, 'realizada', { minutos: min }, agora),
  }
}

export function patchEncerrar(a, status, { quem = null, motivo = null } = {}, agora) {
  if (status !== 'cancelada' && status !== 'nao_realizada') throw new Error('status inválido')
  return {
    status, quem, motivo: motivo || null, status_em: agora,
    duracao_real_min: null, valor_centavos: null, confirmada_em: null,
    historico: registro(a, status, { quem, motivo: motivo || null }, agora),
  }
}

export function patchDesfazer(a, agora) {
  return {
    status: 'prevista', duracao_real_min: null, valor_centavos: null, confirmada_em: null, quem: null, motivo: null, status_em: agora,
    historico: registro(a, 'reaberta', { de: a.status }, agora),
  }
}

// Remarcar mantém a mesma aula (e a data original), só muda a data/horário; nunca cria outra cobrança.
export function patchRemarcar(a, novaData, { horario, motivo } = {}, agora) {
  if (a.status !== 'prevista') throw new Error('só aula prevista pode ser remarcada')
  const patch = { data: novaData, historico: registro(a, 'remarcada', { de: a.data, para: novaData, motivo: motivo || null }, agora) }
  if (horario !== undefined) patch.horario = horario || null
  return patch
}

export function patchEditar(a, campos, agora) {
  const patch = {}
  const mudou = []
  if (campos.data !== undefined && campos.data !== a.data) { patch.data = campos.data; mudou.push('data') }
  if (campos.horario !== undefined && (campos.horario || null) !== (a.horario || null)) { patch.horario = campos.horario || null; mudou.push('horario') }
  if (campos.duracao_min !== undefined && Number(campos.duracao_min) !== Number(a.duracao_min)) { patch.duracao_min = Number(campos.duracao_min); mudou.push('duracao') }
  if (campos.duracao_real_min !== undefined && a.status === 'realizada' && Number(campos.duracao_real_min) !== Number(a.duracao_real_min)) {
    patch.duracao_real_min = Number(campos.duracao_real_min)
    mudou.push('duracao_real')
  }
  if (campos.valor_hora_centavos !== undefined && Number(campos.valor_hora_centavos) !== Number(a.valor_hora_centavos)) {
    patch.valor_hora_centavos = Number(campos.valor_hora_centavos)
    patch.valor_hora_manual = true
    mudou.push('valor_hora')
  }
  if (campos.observacao !== undefined && (campos.observacao || null) !== (a.observacao || null)) { patch.observacao = campos.observacao || null; mudou.push('observacao') }
  if (!mudou.length) return null
  // aula realizada: recalcula o valor com a duração efetiva e a hora desta aula
  if (a.status === 'realizada' && (patch.duracao_real_min || patch.valor_hora_centavos !== undefined)) {
    patch.valor_centavos = valorAula(patch.valor_hora_centavos ?? a.valor_hora_centavos, patch.duracao_real_min ?? a.duracao_real_min)
  }
  patch.historico = registro(a, 'editada', { campos: mudou }, agora)
  return patch
}

// Reposição: nova aula ligada à original (cancelada ou não realizada). Só a reposição é cobrada, quando realizada.
export function novaReposicao(original, aluno, { data, horario = null, duracao_min }) {
  if (original.status !== 'cancelada' && original.status !== 'nao_realizada') throw new Error('só cancelada ou não realizada tem reposição')
  return {
    aluno_id: original.aluno_id, data, data_original: data, horario: horario || null, duracao_min: Number(duracao_min || original.duracao_min),
    valor_hora_centavos: Number(aluno.valor_hora_centavos), valor_hora_manual: false, status: 'prevista', origem: 'reposicao',
    reposicao_de: original.id, programacao_id: null, historico: [],
  }
}
export const reposicaoAtiva = (original, aulas) => aulas.find((a) => a.reposicao_de === original.id && a.status !== 'cancelada') || null

export function novaAvulsa(aluno, { data, horario = null, duracao_min, observacao = null }) {
  return {
    aluno_id: aluno.id, data, data_original: data, horario: horario || null, duracao_min: Number(duracao_min),
    valor_hora_centavos: Number(aluno.valor_hora_centavos), valor_hora_manual: false, status: 'prevista', origem: 'avulsa',
    programacao_id: null, observacao: observacao || null, historico: [],
  }
}

// ---------- pendências ----------

// Prevista com data passada: não vira "não realizada" sozinha, fica pendente de atualização.
export const pendenteDeAtualizacao = (a, hoje) => a.status === 'prevista' && a.data < hoje

// ---------- mudança de valor/hora e de programação ----------

// Novo valor/hora do aluno vale para as previstas futuras que não tiveram o valor alterado à mão. Realizadas ficam como estão.
export function aulasParaNovoValor(aulas, alunoId, desde) {
  return aulas.filter((a) => a.aluno_id === alunoId && a.status === 'prevista' && !a.valor_hora_manual && a.data >= desde)
}

const tocada = (a) => (a.historico || []).length > 0
// Aulas futuras afetadas ao mudar a programação a partir de `desde`: as intactas podem ser recriadas; as editadas/remarcadas ficam.
export function afetadasPorMudanca(aulas, alunoId, programacaoIds, desde) {
  const ids = new Set(programacaoIds)
  const lista = aulas.filter((a) => a.aluno_id === alunoId && a.status === 'prevista' && a.origem === 'recorrente'
    && ids.has(a.programacao_id) && a.data_original >= desde)
  return { removiveis: lista.filter((a) => !tocada(a)), preservadas: lista.filter(tocada) }
}

// Compara a programação atual (linhas vigentes) com a nova e diz quais linhas saem e quais entram.
const chaveLinha = (l) => `${l.dia_semana}|${l.horario || ''}|${l.duracao_min}`
export function diferencaProgramacao(atuais, novas) {
  const a = new Map(atuais.map((l) => [chaveLinha(l), l]))
  const n = new Map(novas.map((l) => [chaveLinha(l), l]))
  return {
    sai: atuais.filter((l) => !n.has(chaveLinha(l))),
    entra: novas.filter((l) => !a.has(chaveLinha(l))),
    fica: atuais.filter((l) => n.has(chaveLinha(l))),
  }
}

// Programação vigente numa data (as linhas cuja vigência cobre a data).
export const programacaoVigente = (programacoes, data) => programacoes.filter((p) => p.vigencia_inicio <= data && (!p.vigencia_fim || p.vigencia_fim >= data))

// ---------- resumo do mês ----------

export function resumoMes(aulas, previsaoInicial = []) {
  const por = (s) => aulas.filter((a) => a.status === s)
  const realizadas = por('realizada')
  const previstas = por('prevista')
  const minutosRealizados = realizadas.reduce((t, a) => t + duracaoEfetiva(a), 0)
  const apurado = realizadas.reduce((t, a) => t + valorDaAula(a), 0)
  const aindaPrevisto = previstas.reduce((t, a) => t + valorDaAula(a), 0)
  const inicial = previsaoInicial.reduce((t, p) => ({ qtd: t.qtd + Number(p.qtd), minutos: t.minutos + Number(p.minutos), valor: t.valor + Number(p.valor_centavos) }), { qtd: 0, minutos: 0, valor: 0 })
  const remarcacoes = aulas.reduce((t, a) => t + (a.historico || []).filter((h) => h.tipo === 'remarcada').length, 0)
  return {
    previstas: previstas.length,
    realizadas: realizadas.length,
    canceladas: por('cancelada').length,
    naoRealizadas: por('nao_realizada').length,
    minutosRealizados,
    apurado,                                   // aulas realizadas, ainda sem fechamento
    previsto: apurado + aindaPrevisto,         // previsão atual: realizadas + ainda previstas
    inicial,                                   // previsão do começo do mês (não muda)
    avulsas: aulas.filter((a) => a.origem === 'avulsa').length,
    reposicoes: aulas.filter((a) => a.origem === 'reposicao').length,
    remarcacoes,
    pendentes: previstas.length,
  }
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
// Frase de comparação: planejado × realizado. Ex.: "Você começou o mês com 5 aulas previstas. Foram realizadas 3, cancelada 1 e não realizada 1."
export function frasePrevistoRealizado(r) {
  const partes = []
  if (r.realizadas) partes.push(`${r.realizadas === 1 ? 'foi realizada' : 'foram realizadas'} ${r.realizadas}`)
  if (r.canceladas) partes.push(`${r.canceladas === 1 ? 'cancelada' : 'canceladas'} ${r.canceladas}`)
  if (r.naoRealizadas) partes.push(`${r.naoRealizadas === 1 ? 'não realizada' : 'não realizadas'} ${r.naoRealizadas}`)
  if (r.previstas) partes.push(`${r.previstas === 1 ? 'ainda prevista' : 'ainda previstas'} ${r.previstas}`)
  if (!r.inicial.qtd && !partes.length) return ''
  const abertura = r.inicial.qtd ? `Você começou o mês com ${plural(r.inicial.qtd, 'aula prevista', 'aulas previstas')}.` : ''
  const meio = partes.length ? ` ${partes.join(', ').replace(/^./, (c) => c.toUpperCase())}.` : ''
  const valor = r.inicial.qtd
    ? ` O valor inicialmente previsto era ${brl(r.inicial.valor)} e a previsão atual é ${brl(r.previsto)}.`
    : ` A previsão atual é ${brl(r.previsto)}.`
  return `${abertura}${meio}${valor}`.trim()
}

// Horário digitado como "15", "1530", "15:30", "9h" ou "9h30" -> "HH:MM" (ou null se não for um horário).
export function lerHorario(texto) {
  const t = String(texto ?? '').trim().toLowerCase().replace(/\s+/g, '')
  if (!t) return null
  let h, m
  let x = t.match(/^(\d{1,2})(?::|h)(\d{2})?$/)
  if (x) { h = Number(x[1]); m = Number(x[2] || 0) }
  else if ((x = t.match(/^(\d{1,2})(\d{2})$/))) { h = Number(x[1]); m = Number(x[2]) }
  else if ((x = t.match(/^(\d{1,2})$/))) { h = Number(x[1]); m = 0 }
  else return null
  if (h > 23 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
