import { addMonths } from './utils.js'
import { lancadoDoCartao, faturaDe } from './financeiro.js'

// Meses que a tela de Faturas mostra: todo mês em que algum cartão tem fatura cadastrada OU tem coisa lançada
// (compras com parcela no mês, contas fixas no cartão), até o mês que vem. Antes só apareciam os meses com um valor
// de fatura cadastrado, e o resto ficava invisível.
// Devolve, do mais novo para o mais antigo: [{ mes, linhas: [{ cartao_id, fatura|null, lancado }] }]
export function mesesDeFaturas({ faturas = [], compras = [], cartoes = [], fixos = [], hoje, mesesFuturos = 1 }) {
  const ultimo = addMonths(hoje, mesesFuturos)
  const meses = new Set(faturas.map((f) => f.mes))
  // meses com parcela em cartão: do início de cada compra até o último mês que interessa
  for (const c of compras) {
    if (!c.cartao_id) continue
    const inicio = String(c.data_compra).slice(0, 7)
    const n = Number(c.parcelas) || 1
    for (let i = 0; i < n + 1; i++) {
      const m = addMonths(inicio, i)
      if (m <= ultimo) meses.add(m)
    }
  }
  const ordenados = [...meses].filter((m) => m <= ultimo || faturas.some((f) => f.mes === m)).sort().reverse()
  const resultado = []
  for (const mes of ordenados) {
    const linhas = []
    for (const cartao of cartoes) {
      const fatura = faturaDe(faturas, cartao.id, mes) || null
      const lancado = lancadoDoCartao(compras, cartoes, cartao.id, mes, fixos)
      if (fatura || lancado > 0.004) linhas.push({ cartao_id: cartao.id, fatura, lancado })
    }
    if (linhas.length) resultado.push({ mes, linhas })
  }
  return resultado
}
