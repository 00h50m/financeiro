// MOTOR FINANCEIRO: a definição oficial de cada número que o app (e o bot) mostra.
// Dashboard, Pagamentos, Simulador, Reserva e projeções devem usar SÓ estas funções, para a mesma
// pergunta nunca ter respostas diferentes. As definições estão em docs/conceitos-financeiros.md.
//
// Todas as funções são puras (sem React, sem rede). `d` = os dados do app:
// { fixos, fixosPagamentos, cartoes, compras, faturas, rendas, saldoAjustes, comprasPagamentos, comprasPagamentosOk, fechamentos }.
import { addMonths, fixosAtivos, gerarParcelas, totalRenda } from './utils'

const POR_DIA = (a, b) => (a.dia_vencimento || 99) - (b.dia_vencimento || 99)

// ---------- Renda ----------

// Renda de um mês. Sem `estimar`, mês sem renda cadastrada vale 0 (renda realizada).
// Com `estimar`, repete a última renda cadastrada antes do mês e marca como estimada (renda prevista).
export function rendaDoMes(rendas, mes, { estimar = false } = {}) {
  const exata = totalRenda((rendas || []).find((r) => r.mes === mes))
  if (exata > 0) return { valor: exata, estimada: false }
  if (!estimar) return { valor: 0, estimada: false }
  const anterior = (rendas || [])
    .filter((r) => r.mes < mes && totalRenda(r) > 0)
    .sort((a, b) => b.mes.localeCompare(a.mes))[0]
  return { valor: anterior ? totalRenda(anterior) : 0, estimada: true }
}

// ---------- Faturas ----------

export const faturaDe = (faturas, cartaoId, mes) =>
  (faturas || []).find((f) => f.cartao_id === cartaoId && f.mes === mes)

// Soma das parcelas lançadas de um cartão que caem em um mês (o "estimado" da fatura).
export function lancadoDoCartao(compras, cartoes, cartaoId, mes) {
  let total = 0
  for (const c of compras) {
    if (c.cartao_id !== cartaoId) continue
    for (const p of gerarParcelas(c, cartoes)) if (p.mes === mes) total += p.valor
  }
  return total
}

// Valor da fatura: o valor real, SÓ se a pessoa informou; senão o que foi lançado (estimado).
export function valorFatura(fatura, lancado) {
  const temReal = fatura?.valor_real != null && fatura.valor_real !== ''
  return { valor: temReal ? Number(fatura.valor_real) : lancado, real: temReal }
}

// ---------- Pagamento de compra sem cartão, por parcela ----------

// Uma parcela (mês) de compra sem cartão está paga se há registro dela em compras_pagamentos.
// Sem registro: à vista segue o `pago` da compra; parcelada só conta a primeira parcela (era o que
// "Já foi pago?" queria dizer ao lançar). Sem a tabela (migration 14 não rodada): o `pago` antigo vale
// para a compra inteira.
export function parcelaPaga(compra, mes, primeiroMes, registros, tabelaPronta) {
  const reg = registros.get(`${compra.id}|${mes}`)
  if (reg) return !!reg.pago
  if (!tabelaPronta) return !!compra.pago
  const parcelas = Number(compra.parcelas) || 1
  return !!compra.pago && (parcelas <= 1 || mes === primeiroMes)
}

// Quantas parcelas de uma compra sem cartão já estão pagas (para a lista de Compras).
export function parcelasPagas(compra, cartoes, comprasPagamentos, tabelaPronta) {
  const registros = new Map((comprasPagamentos || []).map((p) => [`${p.compra_id}|${p.mes}`, p]))
  const parcelas = gerarParcelas(compra, cartoes)
  const pagas = parcelas.filter((p) => parcelaPaga(compra, p.mes, parcelas[0].mes, registros, tabelaPronta)).length
  return { pagas, total: parcelas.length }
}

// ---------- Visão do mês (Pagamentos) ----------

export function detalhePagamentos(d, mes) {
  const { fixos, fixosPagamentos, cartoes, compras, faturas } = d
  const registros = new Map((d.comprasPagamentos || []).map((p) => [`${p.compra_id}|${p.mes}`, p]))
  const tabelaPronta = !!d.comprasPagamentosOk

  // Contas fixas ativas no mês, por dia de vencimento.
  const fixosLista = fixosAtivos(fixos, mes).sort(POR_DIA)
  const fixoPagamento = (fixoId) => fixosPagamentos.find((p) => p.fixo_id === fixoId && p.mes === mes)

  // Cartões com parcelas no mês ou fatura registrada.
  const lancadoPorCartao = new Map()
  const parcelasSemCartao = []
  for (const c of compras) {
    const parcelas = gerarParcelas(c, cartoes)
    if (c.cartao_id) {
      for (const p of parcelas) {
        if (p.mes === mes) lancadoPorCartao.set(c.cartao_id, (lancadoPorCartao.get(c.cartao_id) || 0) + p.valor)
      }
    } else {
      const parcela = parcelas.find((p) => p.mes === mes)
      if (parcela) parcelasSemCartao.push({ c, parcela, primeiroMes: parcelas[0].mes })
    }
  }
  const cartaoIds = new Set(lancadoPorCartao.keys())
  faturas.forEach((f) => { if (f.mes === mes && f.cartao_id) cartaoIds.add(f.cartao_id) })

  const linhasCartao = [...cartaoIds]
    .map((cartao_id) => {
      const cartao = cartoes.find((c) => c.id === cartao_id)
      const lancado = lancadoPorCartao.get(cartao_id) || 0
      const fatura = faturaDe(faturas, cartao_id, mes)
      const { valor, real } = valorFatura(fatura, lancado)
      return {
        cartao_id,
        nome: cartao?.nome || '—',
        valor,
        lancado,
        temFatura: real, // true só quando o valor real do banco foi informado
        faturaRegistrada: !!fatura,
        pago: fatura?.pago || false,
        dataPagamento: fatura?.data_pagamento,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))

  // Outras contas: sem cartão (dinheiro, Pix, boleto). Cada parcela tem o seu "pago".
  const outrasContas = parcelasSemCartao
    .map(({ c, parcela, primeiroMes }) => {
      const reg = registros.get(`${c.id}|${mes}`)
      return {
        ...c,
        valorParcela: parcela.valor,
        parcelaNum: parcela.num,
        parcelaTotal: parcela.total,
        pago: parcelaPaga(c, mes, primeiroMes, registros, tabelaPronta),
        data_pagamento: reg?.data_pagamento || (reg ? null : c.data_pagamento),
        mesParcela: mes,
      }
    })
    .sort((a, b) => (a.data_compra < b.data_compra ? 1 : -1))

  const soma = (lista, f) => lista.reduce((s, x) => s + f(x), 0)
  const totalFixos = soma(fixosLista, (f) => Number(f.valor))
  const totalFixosPagos = soma(fixosLista, (f) => (fixoPagamento(f.id)?.pago ? Number(f.valor) : 0))
  const totalCartoes = soma(linhasCartao, (l) => l.valor)
  const totalCartoesPagos = soma(linhasCartao, (l) => (l.pago ? l.valor : 0))
  const totalOutras = soma(outrasContas, (c) => c.valorParcela)
  const totalOutrasPagas = soma(outrasContas, (c) => (c.pago ? c.valorParcela : 0))

  const comprometido = totalFixos + totalCartoes + totalOutras
  const pago = totalFixosPagos + totalCartoesPagos + totalOutrasPagas
  return {
    fixosLista, fixoPagamento, linhasCartao, outrasContas,
    totalFixos, totalFixosPagos, totalCartoes, totalCartoesPagos, totalOutras, totalOutrasPagas,
    comprometido, pago, totalDividas: comprometido - pago,
  }
}

// ---------- Partes de outras pessoas (Divididos) ----------

// Dinheiro de "Divididos" que já foi RECEBIDO na competência. Só o recebido entra como receita:
// o que ainda está a receber não conta na sobra (ver src/lib/divisoes.js).
export const repassesRecebidos = (d, mes) =>
  (d.divisoesRepasses || []).filter((r) => r.mes === mes).reduce((s, r) => s + (Number(r.valor_recebido) || 0), 0)

// ---------- Saldo anterior ----------

const MAX_MESES_SALDO = 240

// Sobra que vem do mês anterior: o que ficaria depois de pagar tudo dele
// (renda + sobra que ele mesmo recebeu + ajuste − comprometido). Só existe quando o mês anterior tem
// renda cadastrada, para meses sem renda não gerarem "sobra negativa" falsa.
// Se o mês anterior (ou um mês mais antigo da cadeia) foi FECHADO, vale o `saldo_transportado` gravado no
// fechamento, e não a conta ao vivo: é o carry-over formal entre competências.
// Iterativo (do mais antigo para o atual) e com cache por chamada. `d` também precisa de
// { rendas, saldoAjustes } e, opcionalmente, { fechamentos }.
export function sobraAnterior(d, mes, cacheDetalhes) {
  const cache = cacheDetalhes || new Map()
  const comprometidoDe = (m) => {
    if (!cache.has(m)) cache.set(m, detalhePagamentos(d, m).comprometido)
    return cache.get(m)
  }
  const fechados = new Map((d.fechamentos || []).filter((f) => f.status === 'fechado').map((f) => [f.mes, f]))
  // meses encadeados para trás até achar um mês fechado ou um mês sem renda
  const cadeia = []
  let base = 0
  let m = addMonths(mes, -1)
  while (cadeia.length < MAX_MESES_SALDO) {
    const fechado = fechados.get(m)
    if (fechado) { base = Number(fechado.saldo_transportado) || 0; break }
    if (!(totalRenda((d.rendas || []).find((r) => r.mes === m)) > 0)) break
    cadeia.push(m)
    m = addMonths(m, -1)
  }
  let sobra = base
  for (let i = cadeia.length - 1; i >= 0; i--) {
    const mesCad = cadeia[i]
    const renda = totalRenda((d.rendas || []).find((r) => r.mes === mesCad)) + repassesRecebidos(d, mesCad)
    const ajuste = Number((d.saldoAjustes || []).find((a) => a.mes === mesCad)?.ajuste) || 0
    sobra = renda + sobra + ajuste - comprometidoDe(mesCad)
  }
  return sobra
}

// ---------- Preferência: contar o saldo anterior? (compartilhada entre as telas) ----------

const CHAVE_USAR_SOBRA = 'usar_sobra'

export function lerUsarSaldoAnterior() {
  try { return localStorage.getItem(CHAVE_USAR_SOBRA) !== '0' } catch { return true }
}

export function gravarUsarSaldoAnterior(v) {
  try { localStorage.setItem(CHAVE_USAR_SOBRA, v ? '1' : '0') } catch { /* segue sem lembrar */ }
}

// ---------- Resumo oficial de um mês ----------

// Devolve os números que as telas mostram. Definições:
//  renda            renda cadastrada do mês (0 se não informada) + partes de outras pessoas já recebidas (Divididos)
//  rendaSalario     só a renda cadastrada; repasses = só o que veio de Divididos
//  comprometido     fixos + faturas (valor real, ou lançado se não informado) + parcelas sem cartão do mês
//  pago             parte do comprometido já marcada como paga
//  aPagar           comprometido − pago
//  saldoAnterior    o que veio do mês anterior (0 se desligado)
//  ajuste           acerto manual com o saldo real da conta
//  disponivel       renda + saldoAnterior − pago + ajuste (dinheiro que existe agora)
//  sobraProjetada   disponivel − aPagar = renda + saldoAnterior + ajuste − comprometido
//  sobraDoMes       renda − comprometido (só o mês, sem saldo anterior)
export function resumoDoMes(d, mes, { usarSaldoAnterior = true, cacheDetalhes } = {}) {
  const det = detalhePagamentos(d, mes)
  const rendaSalario = rendaDoMes(d.rendas, mes).valor
  const repasses = repassesRecebidos(d, mes)
  const renda = rendaSalario + repasses // receita realizada: renda cadastrada + partes de outras pessoas já recebidas
  const saldoAnterior = usarSaldoAnterior ? sobraAnterior(d, mes, cacheDetalhes) : 0
  const ajuste = Number((d.saldoAjustes || []).find((a) => a.mes === mes)?.ajuste) || 0
  const aPagar = det.comprometido - det.pago
  const base = renda + saldoAnterior - det.pago
  const disponivel = base + ajuste
  return {
    mes, renda, rendaSalario, repasses, comprometido: det.comprometido, pago: det.pago, aPagar,
    saldoAnterior, ajuste, baseCalculada: base,
    disponivel, sobraProjetada: disponivel - aPagar, sobraDoMes: renda - det.comprometido,
    detalhe: det,
  }
}
