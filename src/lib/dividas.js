// Plano de dívidas: simula a quitação mês a mês. Valores em reais.
// Dívida: { id, nome, saldo, parcela (mínimo por mês, 0 se não há), juros_mes (% ao mês), ativa }
// Estratégias: 'avalanche' (paga primeiro a de maior juros), 'bola' (primeiro a de menor saldo), 'minimos' (só o mínimo de cada uma, sem reforço).
import { addMonths } from './utils.js'

const MAX_MESES = 240
const ZERO = 0.005
const r2 = (n) => Math.round(n * 100) / 100

export const ESTRATEGIAS = { avalanche: 'Avalanche (juros maiores primeiro)', bola: 'Bola de neve (menor saldo primeiro)', minimos: 'Só o mínimo' }

const ordem = (estrategia) => (a, b) => (estrategia === 'bola'
  ? a.saldo - b.saldo || b.juros - a.juros
  : b.juros - a.juros || a.saldo - b.saldo)

// `orcamento`: número (valor fixo por mês) ou lista (um valor por mês, a partir do mês de `inicio`). É o total disponível para pagar dívidas:
// primeiro saem os mínimos, o que sobra reforça a dívida da vez. `inicio`: 'AAAA-MM' do primeiro mês do plano.
export function simularPlano(dividas, { estrategia = 'avalanche', orcamento = 0, inicio, meses = MAX_MESES } = {}) {
  const ds = (dividas || []).filter((d) => d.ativa !== false && Number(d.saldo) > ZERO)
    .map((d) => ({ id: d.id, nome: d.nome, saldo: Number(d.saldo), juros: (Number(d.juros_mes) || 0) / 100, minimo: Number(d.parcela) || 0, quitadaEm: null, jurosPagos: 0 }))
  const inicial = r2(ds.reduce((t, d) => t + d.saldo, 0))
  const linha = []
  const faltas = [] // meses em que o orçamento não cobre nem os mínimos
  let jurosTotal = 0
  let pagoTotal = 0
  for (let m = 0; m < Math.min(meses, MAX_MESES); m++) {
    const abertas = ds.filter((d) => d.quitadaEm == null)
    if (!abertas.length) break
    for (const d of abertas) { const j = d.saldo * d.juros; d.saldo += j; d.jurosPagos += j; jurosTotal += j }
    let disponivel = typeof orcamento === 'number' ? orcamento : Number(orcamento[m] ?? orcamento[orcamento.length - 1] ?? 0)
    let pagoMes = 0
    const pagar = (d, v) => { const p = Math.min(v, d.saldo); d.saldo -= p; pagoMes += p; return p }
    const minimos = abertas.reduce((t, d) => t + Math.min(d.minimo, d.saldo), 0)
    if (estrategia !== 'minimos' && disponivel + ZERO < minimos) faltas.push({ mes: m, falta: r2(minimos - disponivel) })
    for (const d of abertas) { const p = pagar(d, d.minimo); disponivel -= p }
    if (estrategia !== 'minimos') {
      let extra = Math.max(0, disponivel)
      for (const d of [...abertas].sort(ordem(estrategia))) {
        if (extra <= ZERO) break
        if (d.saldo > ZERO) extra -= pagar(d, extra)
      }
    }
    for (const d of abertas) if (d.saldo <= ZERO) { d.saldo = 0; d.quitadaEm = m }
    pagoTotal += pagoMes
    linha.push({ idx: m, mes: inicio ? addMonths(inicio, m) : null, saldo: r2(ds.reduce((t, d) => t + d.saldo, 0)), pago: r2(pagoMes) })
  }
  const abertas = ds.filter((d) => d.quitadaEm == null)
  const ultima = ds.length ? Math.max(...ds.map((d) => (d.quitadaEm == null ? -1 : d.quitadaEm))) : -1
  return {
    estrategia, inicial,
    livreEm: abertas.length ? null : ds.length ? ultima : 0, // índice do mês em que zera tudo; null = não zera no prazo
    livreMes: !abertas.length && inicio && ds.length ? addMonths(inicio, ultima) : null,
    jurosTotal: r2(jurosTotal), pagoTotal: r2(pagoTotal),
    ordemQuitacao: ds.filter((d) => d.quitadaEm != null).sort((a, b) => a.quitadaEm - b.quitadaEm).map((d) => ({ id: d.id, nome: d.nome, idx: d.quitadaEm, mes: inicio ? addMonths(inicio, d.quitadaEm) : null, jurosPagos: r2(d.jurosPagos) })),
    naoQuitam: abertas.map((d) => ({ id: d.id, nome: d.nome, saldo: r2(d.saldo) })),
    linha, faltas,
  }
}

// Resumo do que se deve hoje.
export function resumoDividas(dividas) {
  const ativas = (dividas || []).filter((d) => d.ativa !== false && Number(d.saldo) > ZERO)
  const total = r2(ativas.reduce((t, d) => t + Number(d.saldo), 0))
  const minimos = r2(ativas.reduce((t, d) => t + (Number(d.parcela) || 0), 0))
  const jurosMes = r2(ativas.reduce((t, d) => t + Number(d.saldo) * ((Number(d.juros_mes) || 0) / 100), 0))
  return { qtd: ativas.length, total, minimos, jurosMes, atrasadas: ativas.filter((d) => d.atrasada).length }
}

// Compara as três estratégias com o mesmo orçamento. `economia` = juros que o plano poupa em relação a pagar só o mínimo.
export function compararEstrategias(dividas, opcoes) {
  const por = Object.fromEntries(Object.keys(ESTRATEGIAS).map((e) => [e, simularPlano(dividas, { ...opcoes, estrategia: e })]))
  const base = por.minimos
  for (const e of ['avalanche', 'bola']) por[e].economia = base.livreEm == null ? null : r2(base.jurosTotal - por[e].jurosTotal)
  return por
}
