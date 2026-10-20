// Dívidas que o app já enxerga: contas de meses passados que ficaram sem pagar. Viram candidatas a entrar no plano de dívidas.
import { detalhePagamentos } from './financeiro.js'
import { addMonths, tituloCompra } from './utils.js'

// -> [{ origem, nome, valor, tipo: 'cartao'|'boleto', mes }] (meses entre o início do app e o mês anterior ao atual, ainda não pagos)
export function atrasadasDoApp(store, hoje, dividas = [], { maxMeses = 24 } = {}) {
  const atual = hoje.slice(0, 7)
  const ja = new Set((dividas || []).map((d) => d.origem).filter(Boolean))
  const inicio = store.inicioApp || addMonths(atual, -maxMeses)
  const saida = []
  for (let m = inicio; m < atual; m = addMonths(m, 1)) {
    const det = detalhePagamentos(store, m)
    for (const f of det.fixosLista) {
      if (det.fixoPagamento(f)?.pago) continue
      saida.push({ origem: `fixo|${f.id}|${f.mesPagamento || m}`, nome: f.nome, valor: Number(f.valor), tipo: 'boleto', mes: m })
    }
    for (const c of det.outrasContas) {
      if (c.pago) continue
      saida.push({ origem: `compra|${c.id}|${c.mesParcela || m}`, nome: `${tituloCompra(c)}${c.parcelaTotal > 1 ? ` (${c.parcelaNum}/${c.parcelaTotal})` : ''}`, valor: Number(c.valorParcela), tipo: 'boleto', mes: m })
    }
    for (const l of det.linhasCartao) {
      if (l.pago || !(Number(l.valor) > 0)) continue
      saida.push({ origem: `fatura|${l.cartao_id}|${m}`, nome: `Fatura ${l.nome}`, valor: Number(l.valor), tipo: 'cartao', mes: m })
    }
  }
  return saida.filter((s) => s.valor > 0 && !ja.has(s.origem))
}
