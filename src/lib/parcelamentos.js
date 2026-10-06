// Visões do que vem pela frente nos parcelamentos: calendário de quitação, o que acaba logo e simulação de quitar antes.
import { addMonths, gerarParcelas } from './utils.js'

const r2 = (n) => Math.round(n * 100) / 100

// Parcelamentos ainda com parcela de `mes` em diante (só compras de 2x ou mais).
export const parcelamentosAtivos = (compras, cartoes, mes) =>
  compras.filter((c) => Number(c.parcelas) > 1 && gerarParcelas(c, cartoes).some((p) => p.mes >= mes))

// Quanto de parcela cai em cada um dos próximos `n` meses, e o que termina em cada um.
// -> [{ mes, total, qtd, terminam: [compra] }]
export function calendarioQuitacao(compras, cartoes, mes, n = 12) {
  const ativas = parcelamentosAtivos(compras, cartoes, mes)
  const plano = ativas.map((c) => ({ c, ps: gerarParcelas(c, cartoes) }))
  return Array.from({ length: n }, (_, i) => {
    const m = addMonths(mes, i)
    let total = 0, qtd = 0
    const terminam = []
    for (const { c, ps } of plano) {
      const p = ps.find((x) => x.mes === m)
      if (!p) continue
      total += p.valor
      qtd += 1
      if (p.num === p.total) terminam.push(c)
    }
    return { mes: m, total: r2(total), qtd, terminam }
  })
}

// Parcelamentos que terminam em até `ate` meses (0 = este mês). Cada um diz quanto libera por mês depois que acaba.
// -> [{ compra, termino, mesesRestantes, parcelasRestantes, libera }] do que acaba primeiro para o que acaba depois
export function terminandoLogo(compras, cartoes, mes, ate = 2) {
  const saida = []
  for (const c of parcelamentosAtivos(compras, cartoes, mes)) {
    const ps = gerarParcelas(c, cartoes)
    const ultima = ps[ps.length - 1]
    const restantes = ps.filter((p) => p.mes >= mes)
    const mesesRestantes = restantes.length - 1 // 0 = a última parcela é este mês
    if (mesesRestantes > ate) continue
    saida.push({ compra: c, termino: ultima.mes, mesesRestantes, parcelasRestantes: restantes.length, libera: ps[0].valor })
  }
  return saida.sort((a, b) => a.termino.localeCompare(b.termino))
}

// "E se eu quitar essa compra hoje?" `valorBanco` = quanto o banco/loja cobra para quitar (opcional; com juros embutidos costuma ser menos que o restante).
export function simularQuitacao(compra, cartoes, mes, valorBanco = null) {
  const ps = gerarParcelas(compra, cartoes)
  const restantes = ps.filter((p) => p.mes >= mes)
  const restante = r2(restantes.reduce((t, p) => t + p.valor, 0))
  const informado = valorBanco != null && valorBanco !== '' && Number.isFinite(Number(valorBanco)) && Number(valorBanco) >= 0
  const pago = informado ? Number(valorBanco) : null
  return {
    restante,
    parcelasRestantes: restantes.length,
    libera: restantes.length ? restantes[0].valor : 0, // por mês, a partir do mês seguinte à quitação
    ultimoMes: restantes.length ? restantes[restantes.length - 1].mes : null,
    valorBanco: pago,
    economia: pago == null ? null : r2(restante - pago),
    descontoPct: pago == null || restante <= 0 ? null : r2(((restante - pago) / restante) * 100),
  }
}
