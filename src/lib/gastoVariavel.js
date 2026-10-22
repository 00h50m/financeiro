// Gastos do dia a dia (combustível, mercado, lazer…) que o app ainda não conhece nos meses à frente.
// A "sobra projetada" só enxerga o que já foi lançado; aqui reservamos a média do que costuma ser gasto, por categoria,
// para a sobra que vai para as dívidas ser a sobra REAL. Valores em reais.
import { addMonths } from './utils.js'

export const CHAVE_RESERVA_AJUSTES = 'divida_reserva_ajustes' // { categoria: valor por mês } — vale mais que a média
export const SEMANAS_POR_MES = 52 / 12
const r2 = (n) => Math.round(n * 100) / 100
const ORIGENS_FORA = new Set(['emprestimo', 'recorrente'])

// Compra à vista / 1x que não é empréstimo nem recorrente: o que entra e sai sem aviso. Parcelada ou recorrente já aparece como compromisso.
export const ehVariavel = (c) => Number(c.parcelas || 1) <= 1 && !ORIGENS_FORA.has(c.origem)

const mesDe = (c) => String(c.data_compra || '').slice(0, 7)

// Gasto variável por categoria nos `n` meses completos anteriores a `mes`, e o que já foi gasto em `mes`.
export function historicoVariavel(compras = [], mes, n = 3) {
  const meses = Array.from({ length: n }, (_, i) => addMonths(mes, -(n - i)))
  const cats = new Map() // categoria -> { porMes: number[n], noMes }
  for (const c of compras) {
    if (!ehVariavel(c)) continue
    const m = mesDe(c)
    const k = c.categoria || 'Outros'
    const entrada = cats.get(k) || { porMes: Array(n).fill(0), noMes: 0 }
    const i = meses.indexOf(m)
    if (i >= 0) entrada.porMes[i] += Number(c.valor_total) || 0
    else if (m === mes) entrada.noMes += Number(c.valor_total) || 0
    cats.set(k, entrada)
  }
  return { meses, categorias: cats }
}

// -> { total, jaNoMes, categorias: [{ categoria, media, ajuste, reservado, noMes, porSemana }] } (maior reserva primeiro)
// `ajustes`: { categoria: valor } — o valor digitado substitui a média (0 = não reservar).
export function reservaVariavel(compras, mes, { ajustes = {}, n = 3 } = {}) {
  const { categorias } = historicoVariavel(compras, mes, n)
  const lista = [...categorias.entries()].map(([categoria, e]) => {
    const media = r2(e.porMes.reduce((t, v) => t + v, 0) / n)
    const tem = ajustes[categoria] != null && ajustes[categoria] !== ''
    const ajuste = tem ? Math.max(0, Number(ajustes[categoria]) || 0) : null
    const reservado = ajuste != null ? ajuste : media
    return { categoria, media, ajuste, reservado, noMes: r2(e.noMes), porSemana: r2(reservado / SEMANAS_POR_MES) }
  }).filter((x) => x.media > 0 || x.reservado > 0 || x.noMes > 0).sort((a, b) => b.reservado - a.reservado)
  return {
    total: r2(lista.reduce((t, x) => t + x.reservado, 0)),
    jaNoMes: r2(lista.reduce((t, x) => t + Math.min(x.noMes, x.reservado), 0)), // o que da reserva do mês atual já foi gasto
    categorias: lista,
  }
}

// Sobra real por mês: sobra projetada menos a reserva (no mês atual, só o que ainda falta gastar).
// projecao: [{ mes, renda, comprometido, sobra }] -> mesma lista com { reserva, sobraReal }
export function sobraReal(projecao, reserva, mesAtual) {
  return projecao.map((m) => {
    const r = m.mes === mesAtual ? Math.max(0, r2(reserva.total - reserva.jaNoMes)) : reserva.total
    return { ...m, reserva: r, sobraReal: r2(m.sobra - r) }
  })
}
