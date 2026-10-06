// Resumo do mês (renda, despesas, sobra, categorias, avisos) mandado pelo Telegram: no dia 1 vai o do mês que acabou,
// e /resumomes mostra quando a pessoa pedir. Só lê o banco e manda mensagem. Os números vêm do mesmo código do app.
import { hojeSP, addMonths } from '../../src/lib/utils.js'
import { anexarValores } from '../../src/lib/fixosVersoes.js'
import { montarResumoMensal, textoDoResumo } from '../../src/lib/resumoMensal.js'

export function textoResumoDoMes(dados, mes, hoje, { rodape = '' } = {}) {
  const d = { ...dados, fixos: anexarValores(dados.fixos, dados.fixosValores) }
  const texto = textoDoResumo(montarResumoMensal(d, mes, hoje))
  return rodape ? `${texto}\n\n${rodape}` : texto
}

export async function enviarResumosMensais({ db, tg, agora = () => new Date() }) {
  const destinatarios = await db.destinatariosResumo()
  if (!destinatarios.length) return { enviados: 0, falhas: 0 }
  const hoje = hojeSP(agora())
  const mes = addMonths(hoje.slice(0, 7), -1) // o mês que acabou de fechar
  const texto = textoResumoDoMes(await db.dadosResumoMensal(), mes, hoje, { rodape: 'Para parar de receber os resumos: /avisos off' })
  let enviados = 0, falhas = 0
  for (const d of destinatarios) {
    try { await tg.enviar(d.chat_id, texto); enviados++ } catch (e) { falhas++; console.error('resumo mensal: falha ao enviar', e?.message) }
  }
  return { enviados, falhas }
}
