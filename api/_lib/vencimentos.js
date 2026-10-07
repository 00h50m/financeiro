// Lembrete diário no Telegram: o que vence hoje e amanhã (contas fixas, faturas e parcelas ainda não pagas).
// Vai para quem ligou os avisos com /avisos on. Só lê o banco e manda mensagem; os dados vêm do mesmo calendário do app.
import { hojeSP, addMonths, fmt } from '../../src/lib/utils.js'
import { anexarValores } from '../../src/lib/fixosVersoes.js'
import { eventosDoMes } from '../../src/lib/calendario.js'

const somarDia = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

export function vencimentosProximos(dados, hoje) {
  const d = { ...dados, fixos: anexarValores(dados.fixos, dados.fixosValores) }
  const amanha = somarDia(hoje, 1)
  const doDia = (iso) => eventosDoMes(d, iso.slice(0, 7)).eventos.filter((e) => e.dia === Number(iso.slice(8, 10)) && !e.pago)
  return { hoje: doDia(hoje), amanha: doDia(amanha) }
}

export function textoVencimentos({ hoje, amanha }) {
  if (!hoje.length && !amanha.length) return null
  const linha = (e) => `• ${e.titulo}: ${fmt(e.valor)}${e.estimada ? ' (estimado)' : ''}`
  const partes = ['🔔 Vencimentos']
  if (hoje.length) partes.push('', 'Hoje:', ...hoje.map(linha))
  if (amanha.length) partes.push('', 'Amanhã:', ...amanha.map(linha))
  partes.push('', 'Para parar de receber avisos: /avisos off')
  return partes.join('\n')
}

export async function enviarLembretesVencimento({ db, tg, agora = () => new Date() }) {
  const destinatarios = await db.destinatariosResumo()
  if (!destinatarios.length) return { enviados: 0, falhas: 0 }
  const hoje = hojeSP(agora())
  const texto = textoVencimentos(vencimentosProximos(await db.dadosResumoMensal(), hoje))
  if (!texto) return { enviados: 0, falhas: 0 }
  let enviados = 0, falhas = 0
  for (const dest of destinatarios) {
    try { await tg.enviar(dest.chat_id, texto); enviados++ } catch (e) { falhas++; console.error('vencimentos: falha ao enviar', e?.message) }
  }
  return { enviados, falhas }
}
