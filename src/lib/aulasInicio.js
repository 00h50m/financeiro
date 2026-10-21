// Cartão "Aulas particulares" da tela Início: aulas de hoje, aulas de dias passados ainda por atualizar e o que ainda não foi recebido.
import { aulasDeHoje, aulasParaAtualizar } from './aulasBot.js'
import { followupsPausa, saidasProximas } from './alunosCiclo.js'

// `d`: dados no formato do store. `mes`: mês exibido (só aparece no mês atual). -> null quando não há nada para mostrar.
export function cartaoAulasInicio(d, hoje, mes) {
  if (!d.aulasOk || !d.alunos?.length || mes !== hoje.slice(0, 7)) return null
  const dados = { alunos: d.alunos, aulas: d.aulas, aulasFech: d.aulasFech, inicioApp: d.inicioApp }
  const doDia = aulasDeHoje(dados, hoje)
  const atrasadas = Math.max(0, aulasParaAtualizar(dados, hoje, { limite: 1 }).total - doDia.length) // total inclui as de hoje
  const mesAulas = d.aulasMesBase?.[mes] || null
  const fechadasSemReceber = (d.aulasFech || []).filter((f) => f.status === 'fechado' && !f.recebido && Number(f.valor_centavos) > 0)
  const followups = followupsPausa(d.aulasPausas, d.alunos, hoje)
  const saidas = saidasProximas(d.alunos, hoje, 60)
  if (!doDia.length && !atrasadas && !mesAulas && !fechadasSemReceber.length && !followups.length && !saidas.length) return null
  return {
    hoje: doDia, atrasadas, mes: mesAulas, followups, saidas,
    aReceberFechado: fechadasSemReceber.reduce((t, f) => t + Number(f.valor_centavos) / 100, 0), nFechadas: fechadasSemReceber.length,
  }
}
