// Renda que muda ao longo do ano (professora que não recebe nas férias, aulas particulares fracas em certos meses...).
// Cada fonte de renda (campo da tabela rendas) tem um fator por mês do ano: 1 = normal, 0,4 = fraco, 0 = não recebe.
import { RENDA_CAMPOS, totalRenda, rendaDigitada, addMonths } from './utils.js'
import { detalhePagamentos, rendaDoMes } from './financeiro.js'

// Valores que o toque na tela alterna: normal → um pouco menos → fraco → nada.
export const FATORES = [1, 0.7, 0.4, 0]
export const proximoFator = (f) => {
  const i = FATORES.findIndex((x) => Math.abs(x - f) < 0.005)
  return FATORES[(i + 1) % FATORES.length]
}

const mesDoAno = (mes) => Number(mes.slice(5, 7))
const r2 = (n) => Math.round(n * 100) / 100

// linhas do banco ({campo, mes_do_ano, fator, valor?}) → { campo: { 1..12: fator } }.
// `valor` (opcional, em reais) é um valor DIGITADO para aquele mês do ano: quando existe, vale ele e não o fator × valor normal.
// Os valores digitados ficam numa propriedade escondida (`__valores`), para quem só conhece fatores continuar funcionando.
export function perfilDeLinhas(linhas = []) {
  const perfil = {}
  const valores = {}
  for (const l of linhas) {
    if (!perfil[l.campo]) perfil[l.campo] = {}
    perfil[l.campo][Number(l.mes_do_ano)] = Number(l.fator)
    if (l.valor != null && l.valor !== '' && !Number.isNaN(Number(l.valor))) {
      if (!valores[l.campo]) valores[l.campo] = {}
      valores[l.campo][Number(l.mes_do_ano)] = Number(l.valor)
    }
  }
  Object.defineProperty(perfil, '__valores', { value: valores, enumerable: false })
  return perfil
}
export const fatorDe = (perfil, campo, mes) => perfil?.[campo]?.[mesDoAno(mes)] ?? 1
// Valor digitado (R$) para a fonte naquele mês do ano, ou null se não há (aí vale o fator).
export const valorFixoDe = (perfil, campo, mes) => perfil?.__valores?.[campo]?.[mesDoAno(mes)] ?? null
export const temPerfil = (perfil) =>
  Object.values(perfil || {}).some((m) => Object.values(m).some((f) => Math.abs(f - 1) > 0.005))
  || Object.values(perfil?.__valores || {}).some((m) => Object.keys(m).length > 0)

// Valor "normal" de uma fonte: o último mês cadastrado antes de `antesDe` (padrão: o mais recente), desfeito o fator daquele mês.
// 0 se a fonte nunca foi cadastrada. É a base sobre a qual os fatores (%) valem.
export function baseDaFonte(rendas, perfil, campo, antesDe = '9999-12') {
  const anteriores = (rendas || []).filter((r) => r.mes < antesDe && rendaDigitada(r) > 0).sort((a, b) => b.mes.localeCompare(a.mes))
  for (const r of anteriores) {
    const v = (Number(r[campo]) || 0) - (campo === 'extra_sabrina' ? Number(r.extra_aulas) || 0 : 0)
    const f = fatorDe(perfil, campo, r.mes)
    if (v > 0 && f > 0) return r2(v / f)
  }
  return 0
}

// Meses (AAAA-MM) que têm férias ou dias sem aula cadastrados em Aulas (pausas: { inicio, fim }). Serve para avisar na projeção.
export function mesesComFerias(pausas = []) {
  const out = new Set()
  for (const p of pausas || []) {
    if (!p?.inicio || !p?.fim) continue
    let m = String(p.inicio).slice(0, 7)
    const ultimo = String(p.fim).slice(0, 7)
    for (let i = 0; m <= ultimo && i < 600; i++) { out.add(m); m = addMonths(m, 1) }
  }
  return out
}

// Fator equivalente a um valor digitado (limitado ao que o banco aceita: de 0 a 2 vezes o normal). Sem base, 1 ou 0.
export function fatorParaValor(valor, base) {
  if (!(base > 0)) return valor > 0 ? 1 : 0
  return Math.min(2, Math.max(0, Math.round((valor / base) * 1e6) / 1e6))
}

// Renda de um mês. Mês com renda cadastrada vale o que foi cadastrado. Mês sem renda é PREVISTO: o valor "normal" de cada
// fonte (último mês cadastrado antes dele, desfeito o fator daquele mês) vezes o fator do mês.
export function rendaPrevista(rendas, perfil, mes) {
  const cadastrada = (rendas || []).find((r) => r.mes === mes)
  const aulas = Number(cadastrada?.extra_aulas) || 0 // aulas particulares: já refletem a agenda real do mês, sem fator
  if (rendaDigitada(cadastrada) > 0) {
    // `porCampo` = quanto cada fonte rende no mês; as aulas ficam à parte, em `aulas`, e não dentro de extra_sabrina
    const porCampo = Object.fromEntries(RENDA_CAMPOS.map(([campo]) => [campo, r2((Number(cadastrada[campo]) || 0) - (campo === 'extra_sabrina' ? aulas : 0))]))
    return { valor: totalRenda(cadastrada), estimada: false, porCampo, aulas }
  }
  const anteriores = (rendas || []).filter((r) => r.mes < mes && rendaDigitada(r) > 0).sort((a, b) => b.mes.localeCompare(a.mes))
  let valor = aulas
  const porCampo = {}
  for (const [campo] of RENDA_CAMPOS) {
    let base = 0
    for (const r of anteriores) {
      const v = (Number(r[campo]) || 0) - (campo === 'extra_sabrina' ? Number(r.extra_aulas) || 0 : 0)
      const f = fatorDe(perfil, campo, r.mes)
      if (v > 0 && f > 0) { base = v / f; break }
    }
    // Valor digitado para o mês do ano vale mais que "valor normal × fator".
    const fixo = valorFixoDe(perfil, campo, mes)
    const previsto = fixo != null ? r2(fixo) : r2(base * fatorDe(perfil, campo, mes))
    porCampo[campo] = previsto
    valor += previsto
  }
  return { valor: r2(valor), estimada: true, porCampo, aulas }
}

// Próximos `n` meses: renda (cadastrada ou prevista), o que já está comprometido e o que sobra ou falta.
export function projecaoRenda(store, perfil, mes, n = 12) {
  return Array.from({ length: n }, (_, i) => {
    const m = addMonths(mes, i)
    const renda = rendaPrevista(store.rendas, perfil, m)
    const comprometido = r2(detalhePagamentos(store, m).comprometido)
    return { mes: m, renda: renda.valor, estimada: renda.estimada, fontes: renda.porCampo, aulas: renda.aulas, comprometido, sobra: r2(renda.valor - comprometido) }
  })
}

// Leitura rápida da projeção (topo da tela): total e média da renda, mês mais apertado e quantos meses ficam no vermelho.
export function resumoDaProjecao(meses = []) {
  if (!meses.length) return null
  const soma = (f) => r2(meses.reduce((t, m) => t + f(m), 0))
  const total = soma((m) => m.renda)
  const pior = meses.reduce((a, b) => (b.sobra < a.sobra ? b : a))
  const menorRenda = meses.reduce((a, b) => (b.renda < a.renda ? b : a))
  const maiorRenda = meses.reduce((a, b) => (b.renda > a.renda ? b : a))
  const vermelhos = meses.filter((m) => m.sobra < -0.005)
  return {
    total, media: r2(total / meses.length), pior, menorRenda, maiorRenda,
    vermelhos: vermelhos.length, falta: soma((m) => (m.sobra < -0.005 ? -m.sobra : 0)),
    previstos: meses.filter((m) => m.estimada).length, n: meses.length,
  }
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

// Renda de um mês para simulações. Sem meses fracos marcados, mantém o comportamento antigo (repete a última renda
// cadastrada); com meses fracos, usa a renda prevista de cada fonte.
export function rendaProjetada(rendas, perfil, mes) {
  if (!temPerfil(perfil)) return rendaDoMes(rendas, mes, { estimar: true })
  const r = rendaPrevista(rendas, perfil, mes)
  return { valor: r.valor, estimada: r.estimada }
}

// Em quantos meses (a partir do primeiro de `meses`) o que sobra junta `falta`. Mês no vermelho conta como retirada.
// Devolve null se não chega dentro dos meses projetados.
export function mesesParaJuntar(meses, falta) {
  if (!(falta > 0)) return 0
  let acum = 0
  for (let i = 0; i < meses.length; i++) {
    acum += meses[i].sobra
    if (acum + 0.005 >= falta) return i + 1
  }
  return null
}
