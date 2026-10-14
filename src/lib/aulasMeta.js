// Meta mensal de renda com aulas. Guardada em config (chave aulas_meta_mensal, em reais). Valores em centavos.
import { contaNaPrevisao, duracaoEfetiva, valorDaAula } from './aulas.js'

export const CHAVE_META_AULAS = 'aulas_meta_mensal'

// config → centavos (0 = sem meta)
export function lerMeta(config) {
  const n = Number(String(config?.[CHAVE_META_AULAS] ?? '').replace(',', '.'))
  return n > 0 ? Math.round(n * 100) : 0
}

// Quanto falta para a meta do mês e o que isso significa em aulas e horas.
// `aulasMes`: aulas do mês (todas); `alunosAtivos`: para estimar valor/hora quando o mês ainda não tem aulas.
export function situacaoMeta({ metaCentavos, previstoCentavos, apuradoCentavos, aulasMes = [], alunosAtivos = [] }) {
  const contam = aulasMes.filter(contaNaPrevisao)
  const minutos = contam.reduce((t, a) => t + duracaoEfetiva(a), 0)
  const valor = contam.reduce((t, a) => t + valorDaAula(a), 0)
  const mediaHora = minutos > 0 ? Math.round((valor / minutos) * 60)
    : alunosAtivos.length ? Math.round(alunosAtivos.reduce((t, a) => t + Number(a.valor_hora_centavos), 0) / alunosAtivos.length) : 0
  const mediaAula = contam.length ? Math.round(minutos / contam.length) : 60
  const falta = Math.max(0, metaCentavos - previstoCentavos)
  const minutosFalta = mediaHora > 0 ? Math.ceil((falta / mediaHora) * 60) : 0
  return {
    meta: metaCentavos, previsto: previstoCentavos, apurado: apuradoCentavos, falta, atingida: metaCentavos > 0 && falta === 0,
    pctPrevisto: metaCentavos ? Math.min(100, Math.round((previstoCentavos / metaCentavos) * 100)) : 0,
    pctApurado: metaCentavos ? Math.min(100, Math.round((apuradoCentavos / metaCentavos) * 100)) : 0,
    mediaHora, minutosFalta, aulasFalta: mediaAula > 0 && minutosFalta > 0 ? Math.ceil(minutosFalta / mediaAula) : 0, duracaoMedia: mediaAula,
  }
}
