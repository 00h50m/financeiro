// Contexto e resumo do "Meu plano" (expert): os números do app para a IA e um retrato resumido para o histórico.
import { montarContexto } from './consultorDividas.js'
import { totalReserva, totalPorLiquidez } from './reserva.js'
import { agendaSemanal, receitaMensal, cargaMinutos } from './aulasSimulador.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// `planoAnterior`: linha de planos_vida (ou null). Mesmos parâmetros de montarContexto (real, reserva, sobrasOrcamento).
export function montarContextoExpert(store, { hoje, real, reserva, sobrasOrcamento, planoAnterior = null }) {
  const base = montarContexto(store, { hoje, real, reserva, sobrasOrcamento })
  const fontes = store.reservaFontes || []
  const liq = totalPorLiquidez(fontes)
  const agenda = agendaSemanal(store.alunos || [], store.aulasProg || [], hoje)
  const anterior = planoAnterior?.plano
  return {
    ...base,
    objetivo: 'voltar a sobrar mantendo o padrão de vida o máximo possível',
    reserva_emergencia: fontes.length ? { total: totalReserva(fontes), na_hora: liq.na_hora, poucos_dias: liq.poucos_dias, travado: liq.travado } : null,
    aulas_particulares: agenda.length ? { receita_mensal_pela_agenda: r2(receitaMensal(agenda) / 100), horas_por_semana: r2(cargaMinutos(agenda) / 60) } : null,
    plano_anterior: anterior ? {
      criado_em: String(planoAnterior.criado_em).slice(0, 10), resumo: anterior.resumo, meta: anterior.meta,
      acoes: (anterior.acoes || []).slice(0, 6).map((a) => ({ acao: a.acao, tipo: a.tipo, valor: a.valor, quando: a.quando })), tetos_semanais: anterior.tetos_semanais || [],
    } : null,
  }
}

// Retrato dos números na hora em que o plano foi gerado (vai para planos_vida.snapshot).
export function snapshotDoPlano(store, { real, reserva }) {
  const vermelho = real.filter((m) => m.sobraReal < -0.005)
  const fontes = store.reservaFontes || []
  return {
    sobra_real_media_12m: r2(real.slice(0, 12).reduce((t, m) => t + m.sobraReal, 0) / Math.max(1, Math.min(12, real.length))),
    meses_no_vermelho: vermelho.length,
    primeiro_mes_no_vermelho: vermelho[0]?.mes || null,
    reserva_dia_a_dia: reserva.total,
    reserva_emergencia: fontes.length ? totalReserva(fontes) : null,
    divida_total: r2((store.dividas || []).filter((d) => d.ativa !== false).reduce((t, d) => t + Number(d.saldo || 0), 0)),
  }
}
