// Regras da edição de fatura (valor real do banco, cartão, mês e pagamento). Pura e testável.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/
const DATA = /^\d{4}-\d{2}-\d{2}$/

// Valor digitado: '' = sem valor do banco (a fatura volta a valer o lançado). Aceita vírgula.
export function lerValorReal(txt) {
  const t = String(txt ?? '').trim().replace(',', '.')
  if (t === '') return { vazio: true, valor: null }
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? { vazio: false, valor: Math.round(n * 100) / 100 } : { vazio: false, valor: NaN }
}

// form: { cartao_id, mes, valor_real, pago, data_pagamento }. `id` = fatura sendo editada (null = nova).
// Devolve a lista de problemas (vazia = pode salvar).
export function validarFatura(form, { faturas = [], cartoes = [], id = null } = {}) {
  const erros = []
  if (!cartoes.some((c) => c.id === form.cartao_id)) erros.push('Escolha o cartão.')
  if (!MES.test(form.mes || '')) erros.push('Informe o mês da fatura.')
  const v = lerValorReal(form.valor_real)
  if (Number.isNaN(v.valor)) erros.push('Valor inválido.')
  if (!id && v.vazio) erros.push('Informe o valor real da fatura.')
  if (form.pago && form.data_pagamento && !DATA.test(form.data_pagamento)) erros.push('Data de pagamento inválida.')
  const outra = faturas.find((f) => f.id !== id && f.cartao_id === form.cartao_id && f.mes === form.mes)
  if (outra) erros.push('Já existe uma fatura desse cartão nesse mês. Edite a que já existe.')
  return erros
}

// Campos que vão para o banco. Desmarcar "paga" limpa a data; marcar sem data usa `hoje`.
export function dadosDaFatura(form, hoje) {
  const v = lerValorReal(form.valor_real)
  return {
    cartao_id: form.cartao_id,
    mes: form.mes,
    valor_real: v.vazio ? null : v.valor,
    pago: !!form.pago,
    data_pagamento: form.pago ? (form.data_pagamento || hoje) : null,
  }
}

// Meses fechados que a alteração toca (o antigo e o novo), para pedir justificativa.
export const mesesAfetadosPelaFatura = (antes, depois) => [...new Set([antes?.mes, depois?.mes].filter(Boolean))].sort()
