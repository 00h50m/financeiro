// Lembrete das aulas particulares no Telegram (vai junto do cron diário): aulas de hoje com botões, pendências e fechamentos.
// Antes de montar a mensagem, cria as aulas previstas do mês que ainda não existem (igual ao app ao abrir o mês), para os botões funcionarem.
import { hojeSP } from '../../src/lib/utils.js'
import { pendenciasDeAulas, textoLembreteAulas } from '../../src/lib/aulasLembrete.js'
import { planejarMesDoDia, tecladoAulas } from '../../src/lib/aulasBot.js'

export async function enviarLembretesAulas({ db, tg, agora = () => new Date() }) {
  const destinatarios = await db.destinatariosResumo()
  if (!destinatarios.length) return { enviados: 0, falhas: 0 }
  const dados = await db.dadosAulas()
  if (!dados) return { enviados: 0, falhas: 0 }
  const hoje = hojeSP(agora())
  try {
    const { novas, previsoes } = planejarMesDoDia(dados, hoje)
    if ((novas.length || previsoes.length) && db.gerarAulasDoMes) {
      const criadas = await db.gerarAulasDoMes(novas, previsoes)
      dados.aulas = [...dados.aulas, ...criadas]
    }
  } catch (e) { console.error('lembrete de aulas: não consegui gerar as aulas do mês', e?.message) } // sem isso, ainda avisa o que já existe
  const pend = pendenciasDeAulas(dados, hoje)
  const texto = textoLembreteAulas(pend)
  if (!texto) return { enviados: 0, falhas: 0 }
  const teclado = pend.hoje.length ? tecladoAulas(pend.hoje) : undefined
  let enviados = 0, falhas = 0
  for (const d of destinatarios) {
    try { await tg.enviar(d.chat_id, texto, teclado); enviados++ } catch (e) { falhas++; console.error('lembrete de aulas: falha ao enviar', e?.message) }
  }
  return { enviados, falhas }
}
