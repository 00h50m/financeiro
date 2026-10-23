// Resumo automático de domingo à noite para quem ligou com /avisos on. Só lê o banco e manda mensagem.
import { hojeSP, fmt } from '../../src/lib/utils.js'
import { periodoDe, calcularResumo, formatarResumo } from '../../src/lib/resumo.js'
import { montarCheckinPlano } from '../../src/lib/checkinPlano.js'
import { addMonths } from '../../src/lib/utils.js'

export function montarResumoSemanal({ compras, hoje, inicio = null }) {
  const noInicio = (p) => (inicio && p.de < `${inicio}-01` ? { ...p, de: `${inicio}-01` } : p)
  const semana = noInicio(periodoDe('semana', hoje))
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
  const inicio = db.inicioApp ? await db.inicioApp() : null
  const antes = periodoDe('', hoje).de < periodoDe('semana', hoje).de ? periodoDe('', hoje).de : periodoDe('semana', hoje).de
  const de = inicio && antes < `${inicio}-01` ? `${inicio}-01` : antes // não conta compras de antes do início do app
  const texto = montarResumoSemanal({ compras: await db.comprasPeriodo(de, hoje), hoje, inicio })
  // Check-in do plano (Meu plano): a semana contra os tetos. Falhar aqui nunca derruba o resumo.
  let checkin = null
  try {
    const plano = db.planoVidaAtivo ? await db.planoVidaAtivo() : null
    const desde = `${addMonths(hoje.slice(0, 7), -3)}-01`
    const compras = await db.comprasPeriodo(inicio && desde < `${inicio}-01` ? `${inicio}-01` : desde, hoje)
    checkin = montarCheckinPlano({ plano: plano?.plano || null, compras, hoje, planoDe: plano ? String(plano.criado_em).slice(0, 10) : null })
  } catch (e) { console.error('check-in do plano: não consegui montar', e?.message) }
  let enviados = 0, falhas = 0
  for (const d of destinatarios) {
    try { await tg.enviar(d.chat_id, texto); if (checkin) await tg.enviar(d.chat_id, checkin); enviados++ } catch (e) { falhas++; console.error('resumo semanal: falha ao enviar', e?.message) }
  }
  return { enviados, falhas }
}
