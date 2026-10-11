// Renda que muda ao longo do ano (professora que não recebe nas férias, aulas particulares fracas em certos meses...).
// Cada fonte de renda (campo da tabela rendas) tem um fator por mês do ano: 1 = normal, 0,4 = fraco, 0 = não recebe.
import { RENDA_CAMPOS, totalRenda, addMonths } from './utils.js'
import { detalhePagamentos } from './financeiro.js'

// Valores que o toque na tela alterna: normal → um pouco menos → fraco → nada.
export const FATORES = [1, 0.7, 0.4, 0]
export const proximoFator = (f) => {
  const i = FATORES.findIndex((x) => Math.abs(x - f) < 0.005)
  return FATORES[(i + 1) % FATORES.length]
}

const mesDoAno = (mes) => Number(mes.slice(5, 7))
const r2 = (n) => Math.round(n * 100) / 100

// linhas do banco ({campo, mes_do_ano, fator}) → { campo: { 1..12: fator } }
export function perfilDeLinhas(linhas = []) {
  const perfil = {}
  for (const l of linhas) {
    if (!perfil[l.campo]) perfil[l.campo] = {}
    perfil[l.campo][Number(l.mes_do_ano)] = Number(l.fator)
  }
  return perfil
}
export const fatorDe = (perfil, campo, mes) => perfil?.[campo]?.[mesDoAno(mes)] ?? 1
export const temPerfil = (perfil) => Object.values(perfil || {}).some((m) => Object.values(m).some((f) => Math.abs(f - 1) > 0.005))

// Renda de um mês. Mês com renda cadastrada vale o que foi cadastrado. Mês sem renda é PREVISTO: o valor "normal" de cada
// fonte (último mês cadastrado antes dele, desfeito o fator daquele mês) vezes o fator do mês.
export function rendaPrevista(rendas, perfil, mes) {
  const cadastrada = (rendas || []).find((r) => r.mes === mes)
  if (totalRenda(cadastrada) > 0) return { valor: totalRenda(cadastrada), estimada: false }
  const anteriores = (rendas || []).filter((r) => r.mes < mes && totalRenda(r) > 0).sort((a, b) => b.mes.localeCompare(a.mes))
  let valor = 0
  const porCampo = {}
  for (const [campo] of RENDA_CAMPOS) {
    let base = 0
    for (const r of anteriores) {
      const v = Number(r[campo]) || 0
      const f = fatorDe(perfil, campo, r.mes)
      if (v > 0 && f > 0) { base = v / f; break }
    }
    const previsto = r2(base * fatorDe(perfil, campo, mes))
    porCampo[campo] = previsto
    valor += previsto
  }
  return { valor: r2(valor), estimada: true, porCampo }
}

// Próximos `n` meses: renda (cadastrada ou prevista), o que já está comprometido e o que sobra ou falta.
export function projecaoRenda(store, perfil, mes, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const m = addMonths(mes, i)
    const renda = rendaPrevista(store.rendas, perfil, m)
    const comprometido = r2(detalhePagamentos(store, m).comprometido)
    return { mes: m, renda: renda.valor, estimada: renda.estimada, comprometido, sobra: r2(renda.valor - comprometido) }
  })
}

// Plano para atravessar os meses no vermelho. Cada período seguido de meses no vermelho ("janela") tem o seu plano:
// quanto falta, quantos meses há para juntar (desde o fim da janela anterior ou de agora) e quanto guardar por mês.
// `reservaAtual` é o que já existe guardado e abate as primeiras janelas.
export function planoDeReserva(meses, reservaAtual = 0) {
  const janelas = []
  let reserva = Math.max(0, reservaAtual)
  let fimAnterior = 0
  let i = 0
  while (i < meses.length) {
    if (meses[i].sobra >= -0.005) { i += 1; continue }
    let j = i
    while (j < meses.length && meses[j].sobra < -0.005) j += 1
    const janela = meses.slice(i, j)
    const buraco = r2(janela.reduce((t, m) => t + -m.sobra, 0))
    const usada = Math.min(reserva, buraco)
    reserva = r2(reserva - usada)
    const precisa = r2(buraco - usada)
    const mesesAntes = i - fimAnterior
    const sobraAntes = r2(meses.slice(fimAnterior, i).reduce((t, m) => t + Math.max(0, m.sobra), 0))
    janelas.push({
      meses: janela.map((m) => m.mes),
      primeiroMes: janela[0].mes,
      buraco,
      precisa,
      mesesAntes,
      inicioGuardar: mesesAntes > 0 ? meses[fimAnterior].mes : null,
      fimGuardar: mesesAntes > 0 ? meses[i - 1].mes : null,
      porMes: mesesAntes > 0 && precisa > 0 ? r2(precisa / mesesAntes) : null,
      sobraAntes,
      cobreComSobras: sobraAntes + 0.005 >= precisa,
    })
    fimAnterior = j
    i = j
  }
  if (!janelas.length) return { tem: false }
  const primeira = janelas[0]
  return {
    tem: true,
    janelas,
    buraco: r2(janelas.reduce((t, w) => t + w.buraco, 0)),
    precisa: r2(janelas.reduce((t, w) => t + w.precisa, 0)),
    reservaAtual: Math.max(0, reservaAtual),
    primeiroDeficit: primeira.primeiroMes,
    mesesDeficit: janelas.flatMap((w) => w.meses),
    mesesAntes: primeira.mesesAntes,
    porMes: primeira.porMes,
    sobraAntes: primeira.sobraAntes,
    cobreComSobras: primeira.cobreComSobras,
  }
}
