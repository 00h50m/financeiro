// Lembrete das aulas particulares no Telegram (vai junto do cron diário). Só lê o banco e manda mensagem.
import { hojeSP } from '../../src/lib/utils.js'
import { pendenciasDeAulas, textoLembreteAulas } from '../../src/lib/aulasLembrete.js'

export async function enviarLembretesAulas({ db, tg, agora = () => new Date() }) {
  const destinatarios = await db.destinatariosResumo()
  if (!destinatarios.length) return { enviados: 0, falhas: 0 }
  const dados = await db.dadosAulas()
  if (!dados) return { enviados: 0, falhas: 0 }
  const texto = textoLembreteAulas(pendenciasDeAulas(dados, hojeSP(agora())))
  if (!texto) return { enviados: 0, falhas: 0 }
  let enviados = 0, falhas = 0
  for (const d of destinatarios) {
    try { await tg.enviar(d.chat_id, texto); enviados++ } catch (e) { falhas++; console.error('lembrete de aulas: falha ao enviar', e?.message) }
  }
  return { enviados, falhas }
}
