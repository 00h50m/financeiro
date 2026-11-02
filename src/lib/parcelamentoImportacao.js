// Parcelas em andamento na importação (ex.: parcela 3 de 10): o que dá para criar com segurança, o cronograma, os meses tocados
// e a evidência de que as parcelas anteriores já podem ter sido lançadas à parte. Puro.
import { gerarParcelas, addMonths } from './utils.js'
import { chaveEstabelecimento, indexarAliases, similaridadeEstabelecimento } from './estabelecimento.js'
import { mesFechado } from './fechamento.js'
import { valorParcelaLinha, valorTotalLinha } from './importacao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Opções para uma parcela em andamento sem parcelamento no app:
//   completo  cria o parcelamento inteiro (as parcelas anteriores ficam nos meses passados; a data da compra original é estimada)
//   so_esta   registra só esta parcela, como compra de uma vez, sem mexer em meses passados nem presumir datas
export const OPCOES_PARCELAMENTO = ['completo', 'so_esta']
// Compatibilidade: antes era só um "sim" (parcelamentoConfirmado) e valia "completo".
export const opcaoDaLinha = (l) => l.parcelamentoOpcao || (l.parcelamentoConfirmado ? 'completo' : undefined)

// A compra (sintética) que o parcelamento completo criaria: a 1ª parcela cai k-1 meses antes desta fatura, ancorada por fatura_mes
// (assim o mês das parcelas não depende do dia de fechamento do cartão).
export function compraDoParcelamento(l, { mesFatura, modoValor }) {
  const k = Number(l.parcela_atual) || 1
  const n = Number(l.parcela_total) || 1
  const inicio = addMonths(mesFatura, -(k - 1))
  return { cartao_id: l.cartao_id, data_compra: `${inicio}-01`, fatura_mes: inicio, valor_total: r2(valorTotalLinha(l, modoValor)), parcelas: n }
}

// Cronograma do parcelamento completo: cada parcela com o mês, o valor e se é passada, desta fatura ou futura. `bate` confirma que a
// parcela k cai mesmo na fatura em tela; `fechados` lista os meses já fechados que seriam alterados.
export function cronogramaParcelamento(l, { mesFatura, modoValor, cartoes, fechamentos = [] }) {
  const k = Number(l.parcela_atual) || 1
  const compra = compraDoParcelamento(l, { mesFatura, modoValor })
  const parcelas = gerarParcelas(compra, cartoes).map((p) => ({ mes: p.mes, num: p.num, valor: r2(p.valor), situacao: p.mes < mesFatura ? 'passada' : p.mes === mesFatura ? 'esta' : 'futura', fechado: p.mes !== mesFatura && mesFechado(fechamentos, p.mes) }))
  const nesta = parcelas.find((p) => p.mes === mesFatura)
  return {
    compra, parcelas, bate: nesta?.num === k && Math.abs((nesta?.valor ?? 0) - valorParcelaLinha(l, modoValor)) <= 0.02,
    anteriores: parcelas.filter((p) => p.situacao === 'passada').length, futuras: parcelas.filter((p) => p.situacao === 'futura').length,
    fechados: parcelas.filter((p) => p.fechado && p.situacao === 'passada').map((p) => p.mes),
    totalAjustado: Math.abs(parcelas.reduce((t, p) => t + p.valor, 0) - compra.valor_total) > 0.005 ? null : compra.valor_total,
  }
}

// Lançamentos do mesmo lugar, no mesmo cartão, com valor igual ao da parcela e de meses anteriores: podem ser as parcelas anteriores
// já lançadas à parte. Criar o parcelamento completo duplicaria esses meses.
export function parcelasAvulsasParecidas(l, { compras, cartaoId, aliases = [], mesFatura, modoValor }) {
  const indice = indexarAliases(aliases)
  const chave = chaveEstabelecimento(l.descricao, indice).chave
  const valor = valorParcelaLinha(l, modoValor)
  return compras.filter((c) => c.cartao_id === cartaoId && (Number(c.parcelas) || 1) === 1 && String(c.data_compra).slice(0, 7) < mesFatura
    && Math.abs(Number(c.valor_total) - valor) <= 0.02 && similaridadeEstabelecimento(chave, chaveEstabelecimento(c.descricao, indice).chave) >= 0.8)
    .map((c) => ({ id: c.id, data: String(c.data_compra).slice(0, 10), nome: c.identificacao || c.descricao, valor: Number(c.valor_total) }))
}
