// Resumo automático de domingo à noite para quem ligou com /avisos on. Só lê o banco e manda mensagem.
import { hojeSP, fmt } from '../../src/lib/utils.js'
import { periodoDe, calcularResumo, formatarResumo } from '../../src/lib/resumo.js'

export function montarResumoSemanal({ compras, hoje }) {
  const semana = periodoDe('semana', hoje)
  const mes = periodoDe('', hoje)
  const s = calcularResumo(compras, semana)
  const m = calcularResumo(compras, mes)
  const linhas = ['📅 Resumo da semana', '', formatarResumo(s, { ...semana, aviso: false })]
  linhas.push('', `No mês (${mes.nome}): ${fmt(m.total)} em ${m.n} compra${m.n === 1 ? '' : 's'}.`)
  linhas.push('', 'Para parar de receber: /avisos off')
  return linhas.join('\n')
}

export async function enviarResumosSemanais({ db, tg, agora = () => new Date() }) {
  const destinatarios = await db.destinatariosResumo()
  if (!destinatarios.length) return { enviados: 0, falhas: 0 }
  const hoje = hojeSP(agora())
  const de = periodoDe('', hoje).de < periodoDe('semana', hoje).de ? periodoDe('', hoje).de : periodoDe('semana', hoje).de
  const texto = montarResumoSemanal({ compras: await db.comprasPeriodo(de, hoje), hoje })
  let enviados = 0, falhas = 0
  for (const d of destinatarios) {
    try { await tg.enviar(d.chat_id, texto); enviados++ } catch (e) { falhas++; console.error('resumo semanal: falha ao enviar', e?.message) }
  }
  return { enviados, falhas }
}
