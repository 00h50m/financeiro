// Visão por mês da tela Faturas: um cartão por card, com ESTADOS INDEPENDENTES (podem coexistir):
//   valor         estimada (soma do que está lançado) | real (valor do banco informado)
//   diferenca     sem_real | ok | faltam (banco > lançado: falta identificar) | excede (lançado > banco)
//   conciliacao   sem_importacao | importada (importada, ainda sem conferir) | parcial | conciliada   (vem do lote de importação)
//   pagamento     a_pagar | vencida | paga
// Não calcula dinheiro novo: usa lancadoDoCartao / faturaDe de financeiro.js (as mesmas regras de sempre).
import { lancadoDoCartao, faturaDe } from './financeiro.js'
import { diasAte, textoVencimento } from './inicio.js'
import { hojeSP } from './utils.js'

const TOLERANCIA = 1 // R$: abaixo disso a diferença é "ok" (mesma regra da tela antiga)
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const temValorReal = (f) => !!f && f.valor_real != null && f.valor_real !== ''

// Lote de importação mais recente de um cartão e mês (ou null).
export function loteDoCartao(importacoes = [], cartaoId, mes) {
  return importacoes
    .filter((l) => l.cartao_id === cartaoId && l.mes === mes && l.status_importacao === 'concluida')
    .sort((a, b) => String(b.concluida_em || '').localeCompare(String(a.concluida_em || '')))[0] || null
}

export function estadoConciliacao(lote) {
  if (!lote) return 'sem_importacao'
  return { conciliada: 'conciliada', parcial: 'parcial' }[lote.status_conciliacao] || 'importada'
}

function vencimentoDe(cartao, mes, pago, hoje) {
  const dia = cartao.vencimento || null
  if (pago) return { dia, texto: dia ? `venceu dia ${dia}` : 'sem vencimento', vencida: false }
  if (mes < hoje.slice(0, 7)) return { dia, texto: dia ? `venceu dia ${dia}` : 'mês anterior em aberto', vencida: true }
  const dias = diasAte(mes, dia, hoje)
  return { dia, dias, texto: dia ? textoVencimento(dias, dia) : 'sem vencimento', vencida: dias != null && dias < 0 }
}

// Um card por cartão que tem fatura cadastrada ou algo lançado no mês (a mesma regra de mesesDeFaturas).
export function cartoesDoMes({ faturas = [], compras = [], cartoes = [], fixos = [], importacoes = [], mes, hoje = hojeSP() }) {
  const linhas = []
  for (const cartao of cartoes) {
    const fatura = faturaDe(faturas, cartao.id, mes) || null
    const lancado = r2(lancadoDoCartao(compras, cartoes, cartao.id, mes, fixos))
    if (!fatura && lancado <= 0.004) continue
    const real = temValorReal(fatura) ? r2(fatura.valor_real) : null
    const diferenca = real == null ? null : r2(real - lancado)
    const lote = loteDoCartao(importacoes, cartao.id, mes)
    const pago = !!fatura?.pago
    const venc = vencimentoDe(cartao, mes, pago, hoje)
    linhas.push({
      cartao, fatura, lancado, real, diferenca, lote, vencimento: venc,
      estados: {
        valor: real == null ? 'estimada' : 'real',
        diferenca: diferenca == null ? 'sem_real' : Math.abs(diferenca) < TOLERANCIA ? 'ok' : diferenca > 0 ? 'faltam' : 'excede',
        conciliacao: estadoConciliacao(lote),
        pagamento: pago ? 'paga' : venc.vencida ? 'vencida' : 'a_pagar',
      },
    })
  }
  return linhas.sort((a, b) => (a.estados.pagamento === 'vencida' ? 0 : 1) - (b.estados.pagamento === 'vencida' ? 0 : 1) || (a.cartao.vencimento || 99) - (b.cartao.vencimento || 99) || a.cartao.nome.localeCompare(b.cartao.nome))
}

// Resumo do mês (soma dos cards).
export function resumoDoMesFaturas(linhas) {
  const comReal = linhas.filter((l) => l.real != null)
  const soma = (xs, f) => r2(xs.reduce((t, x) => t + f(x), 0))
  return {
    cartoes: linhas.length, lancado: soma(linhas, (l) => l.lancado),
    banco: comReal.length ? soma(comReal, (l) => l.real) : null, bancoQtd: comReal.length,
    diferenca: comReal.length ? soma(comReal, (l) => l.diferenca) : null,
    pagas: linhas.filter((l) => l.estados.pagamento === 'paga').length,
    vencidas: linhas.filter((l) => l.estados.pagamento === 'vencida').length,
    divergentes: linhas.filter((l) => ['faltam', 'excede'].includes(l.estados.diferenca)).length,
  }
}
