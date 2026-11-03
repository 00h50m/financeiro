// Lista única de contas da tela Pagamentos: junta contas fixas, faturas de cartão e compras sem cartão num só formato,
// ordenada por urgência. NÃO calcula dinheiro: usa os mesmos itens de detalhePagamentos (financeiro.js), então os totais batem com o resumo.
import { diasAte, textoVencimento } from './inicio.js'
import { tituloCompra, subtituloCompra, hojeSP } from './utils.js'

export const ABAS_PAGAMENTO = [['apagar', 'A pagar'], ['atrasadas', 'Atrasadas'], ['pagas', 'Pagas'], ['todas', 'Todas']]

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Situação para mostrar: paga | atrasada | a_vencer | sem_data.
//  - mês atual: usa o dia de vencimento (diasAte); venceu = atrasada;
//  - mês anterior (ainda em aberto): tudo que não foi pago está atrasado, mesmo sem dia;
//  - mês futuro: nada está atrasado.
function situacaoDe({ pago, dia, mes, hoje }) {
  if (pago) return { situacao: 'paga', dias: null, texto: 'paga' }
  const mesHoje = hoje.slice(0, 7)
  if (mes < mesHoje) return { situacao: 'atrasada', dias: null, texto: dia ? `venceu dia ${dia}` : 'em aberto de mês anterior' }
  const dias = diasAte(mes, dia, hoje)
  if (dias != null) return { situacao: dias < 0 ? 'atrasada' : 'a_vencer', dias, texto: textoVencimento(dias, dia) }
  return { situacao: dia ? 'a_vencer' : 'sem_data', dias: null, texto: dia ? `vence dia ${dia}` : 'sem vencimento' }
}

// detalhe: resultado de detalhePagamentos(...) (fixosLista, fixoPagamento, linhasCartao, outrasContas).
export function listaDePagamentos(detalhe, cartoes, mes, hoje = hojeSP()) {
  const itens = []
  for (const f of detalhe.fixosLista) {
    const pg = detalhe.fixoPagamento(f)
    const dia = f.dia_vencimento || null
    itens.push({
      chave: `fixo|${f.id}|${f.mesPagamento || mes}`, tipo: 'fixo', origem: 'Conta fixa', ref: f, nome: f.nome, valor: Number(f.valor), dia,
      pago: !!pg?.pago, dataPagamento: pg?.data_pagamento || null, estimado: !!f.estimado, confirmado: !!f.variavel && !f.estimado,
      categoria: f.categoria || '', subcategoria: f.subcategoria || '', adiadoDe: f.adiadoDe || null,
      // pagar uma conta de valor variável ainda estimada exige confirmar o valor antes: fica fora do pagamento em lote
      exigeConferencia: !pg?.pago && !!f.estimado,
    })
  }
  for (const l of detalhe.linhasCartao) {
    itens.push({
      chave: `fatura|${l.cartao_id}`, tipo: 'fatura', origem: 'Fatura', ref: l, nome: `Fatura ${l.nome}`, valor: Number(l.valor),
      dia: cartoes.find((c) => c.id === l.cartao_id)?.vencimento || null, pago: !!l.pago, dataPagamento: l.dataPagamento || null,
      estimado: !l.temFatura, confirmado: !!l.temFatura, categoria: '', subcategoria: '', adiadoDe: null, exigeConferencia: false,
    })
  }
  for (const c of detalhe.outrasContas) {
    itens.push({
      chave: `compra|${c.id}|${c.mesParcela || mes}`, tipo: 'compra', origem: c.parcelaTotal > 1 ? `Parcela ${c.parcelaNum}/${c.parcelaTotal}` : 'Compra sem cartão', ref: c,
      nome: tituloCompra(c), detalheNome: subtituloCompra(c) || '', valor: Number(c.valorParcela), dia: null, pago: !!c.pago, dataPagamento: c.data_pagamento || null,
      estimado: false, confirmado: false, categoria: c.categoria || '', subcategoria: c.subcategoria || '', adiadoDe: c.adiadoDe || null, obs: c.obs || '',
      // parcelada sem controle por mês: o "pago" vale para a compra inteira e a tela pede confirmação
      exigeConferencia: !c.pago && c.parcelaTotal > 1,
    })
  }
  const urg = { atrasada: 0, a_vencer: 1, sem_data: 2, paga: 3 }
  return itens
    .map((i) => ({ ...i, ...situacaoDe({ pago: i.pago, dia: i.dia, mes, hoje }) }))
    .sort((a, b) => (urg[a.situacao] - urg[b.situacao])
      || (a.situacao === 'paga' ? String(b.dataPagamento || '').localeCompare(String(a.dataPagamento || '')) : ((a.dias ?? a.dia ?? 99) - (b.dias ?? b.dia ?? 99)))
      || a.nome.localeCompare(b.nome))
}

export function filtrarPorAba(itens, aba) {
  if (aba === 'pagas') return itens.filter((i) => i.pago)
  if (aba === 'atrasadas') return itens.filter((i) => i.situacao === 'atrasada')
  if (aba === 'apagar') return itens.filter((i) => !i.pago)
  return itens
}

export const contagemPorAba = (itens) => Object.fromEntries(ABAS_PAGAMENTO.map(([k]) => [k, filtrarPorAba(itens, k).length]))

// Resumo compacto do topo. "aPagar" soma as contas em aberto: bate com resumoDoMes().aPagar (comprometido − pago).
export function resumoCompacto(itens) {
  const abertas = itens.filter((i) => !i.pago)
  const soma = (l) => r2(l.reduce((t, i) => t + i.valor, 0))
  const atrasadas = abertas.filter((i) => i.situacao === 'atrasada')
  const proximos7 = abertas.filter((i) => i.situacao === 'a_vencer' && i.dias != null && i.dias <= 7)
  return {
    aPagar: soma(abertas), pago: soma(itens.filter((i) => i.pago)),
    atrasadas: { qtd: atrasadas.length, valor: soma(atrasadas) }, proximos7: { qtd: proximos7.length, valor: soma(proximos7) },
    total: soma(itens), pctPago: itens.length && soma(itens) > 0 ? Math.min(100, Math.round((soma(itens.filter((i) => i.pago)) / soma(itens)) * 100)) : 0,
  }
}

// Só entra no pagamento em lote o que é seguro marcar sem perguntar nada (sem valor estimado a confirmar e sem parcelada sem controle por mês).
export const podeMarcarEmLote = (i) => !i.pago && !i.exigeConferencia
