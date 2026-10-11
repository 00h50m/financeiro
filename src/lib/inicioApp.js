// Mês em que o app começou a ser usado de verdade. Meses antes dele são histórico incompleto: não entram em alertas, não
// trazem saldo para a frente e não aparecem na navegação de mês. Fica na tabela `config` (chave inicio_app); sem registro vale o padrão.
export const INICIO_PADRAO = '2026-10'
export const CHAVE_INICIO = 'inicio_app'

const valido = (v) => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)

// config.inicio_app: 'AAAA-MM' = esse mês · '' = sem data de início · ausente = padrão.
export function inicioDoApp(config = {}) {
  const v = config?.[CHAVE_INICIO]
  if (v === '' || v === null) return null
  return valido(v) ? v : INICIO_PADRAO
}

export const antesDoInicio = (mes, inicio) => !!inicio && mes < inicio
export const noMinimoDoInicio = (mes, inicio) => (inicio && mes < inicio ? inicio : mes)
