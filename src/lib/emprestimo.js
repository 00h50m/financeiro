// SIMULADOR DE EMPRÉSTIMO: calcula parcelas/custo real (CET) e analisa se cabe no seu orçamento, mês a mês.
// Tudo puro. Taxas em decimal (2% a.m. = 0.02). Dinheiro arredondado em centavos.
import { addMonths, fmt } from './utils.js'

const nMeses = (n) => (n === 1 ? '1 mês' : `${n} meses`)

const r2 = (n) => Math.round(n * 100) / 100
export const taxaMensalDeAnual = (anual) => (1 + anual) ** (1 / 12) - 1
export const taxaAnualDeMensal = (mensal) => (1 + mensal) ** 12 - 1

// Parcela fixa (tabela Price)
export function pmt(taxa, n, pv) {
  if (!n) return 0
  return taxa === 0 ? pv / n : (pv * taxa) / (1 - (1 + taxa) ** -n)
}

// Custo Efetivo Total mensal: taxa que iguala o dinheiro recebido às parcelas pagas (inclui IOF, tarifas e seguro).
export function cetMensal(recebido, parcelas) {
  const vp = (t) => parcelas.reduce((s, p, i) => s + p / (1 + t) ** (i + 1), 0) - recebido
  let lo = 0, hi = 1
  if (vp(0) <= 0) return 0
  while (vp(hi) > 0 && hi < 100) hi *= 2
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (vp(mid) > 0) lo = mid; else hi = mid }
  return (lo + hi) / 2
}

// valor = dinheiro que cai na conta. iofPct/tarifa/seguroMes: custos (opcionais). financiarCustos: IOF e tarifa entram no saldo devedor (o comum).
export function simular({ valor, taxaMes, prazo, sistema = 'price', iofPct = 0, tarifa = 0, seguroMes = 0, financiarCustos = true }) {
  valor = Number(valor); prazo = Number(prazo)
  if (!(valor > 0) || !(prazo >= 1) || !Number.isInteger(prazo) || !(taxaMes >= 0)) return null
  const iof = r2(valor * (iofPct / 100))
  const custosIniciais = iof + Number(tarifa || 0)
  const financiado = financiarCustos ? valor + custosIniciais : valor
  const recebido = financiarCustos ? valor : valor - custosIniciais // sem financiar, os custos saem do dinheiro na hora
  const parcelas = []
  let saldo = financiado
  const fixa = pmt(taxaMes, prazo, financiado)
  for (let k = 1; k <= prazo; k++) {
    const juros = r2(saldo * taxaMes)
    let amort = sistema === 'sac' ? r2(financiado / prazo) : r2(fixa - juros)
    if (k === prazo) amort = r2(saldo) // última parcela fecha o saldo (centavos)
    saldo = r2(saldo - amort)
    parcelas.push({ n: k, juros, amort, seguro: r2(seguroMes), valor: r2(juros + amort + seguroMes), saldo: Math.max(0, saldo) })
  }
  const total = r2(parcelas.reduce((s, p) => s + p.valor, 0))
  const cet = cetMensal(recebido, parcelas.map((p) => p.valor))
  return {
    valor, prazo, sistema, taxaMes, financiarCustos, financiado: r2(financiado), recebido: r2(recebido), iof, tarifa: r2(tarifa || 0), parcelas,
    primeira: parcelas[0].valor, ultima: parcelas[prazo - 1].valor,
    total, custo: r2(total - recebido), jurosTotal: r2(parcelas.reduce((s, p) => s + p.juros, 0)),
    cetMes: cet, cetAno: taxaAnualDeMensal(cet),
  }
}

// Quanto do mês já está comprometido e qual a renda (renda = 0 num mês futuro usa a última renda conhecida).
// dadosDoMes(mes) -> { renda, comprometido }
export function impactoMensal(sim, primeiroMes, dadosDoMes, rendaFallback = 0) {
  return sim.parcelas.map((p) => {
    const mes = addMonths(primeiroMes, p.n - 1)
    const d = dadosDoMes(mes)
    const renda = d.renda > 0 ? d.renda : rendaFallback
    const antes = d.comprometido
    const depois = r2(antes + p.valor)
    return {
      mes, parcela: p.valor, renda, rendaEstimada: !(d.renda > 0),
      antes, depois, sobraAntes: r2(renda - antes), sobraDepois: r2(renda - depois),
      pctParcela: renda > 0 ? p.valor / renda : null, pctDepois: renda > 0 ? depois / renda : null,
    }
  })
}

// Limites usados na análise (referências comuns de planejamento, não regra de banco):
export const LIMITES = { parcelaSobreRenda: 0.3, parcelaSobreRendaAlerta: 0.2, folgaMinima: 0.1, taxaCara: 0.03, taxaMuitoCara: 0.06 }

// Veredito + explicações. `alternativas(prazo)` e `melhorMes` são calculados em quem chama (precisam de simular de novo).
export function analisar({ sim, primeiroMes, dadosDoMes, rendaFallback = 0, reserva = null, prazosAlternativos = [12, 24, 36, 48, 60], parcelamentosQueAcabam = [] }) {
  const meses = impactoMensal(sim, primeiroMes, dadosDoMes, rendaFallback)
  const semRenda = meses.every((m) => !(m.renda > 0))
  const negativos = meses.filter((m) => m.sobraDepois < 0)
  const novosNegativos = negativos.filter((m) => m.sobraAntes >= 0)
  const pior = meses.reduce((a, m) => (m.sobraDepois < a.sobraDepois ? m : a), meses[0])
  const maiorPct = Math.max(...meses.map((m) => m.pctParcela ?? 0))
  const apertados = meses.filter((m) => m.renda > 0 && m.sobraDepois >= 0 && m.sobraDepois < m.renda * LIMITES.folgaMinima)
  const estimadas = meses.filter((m) => m.rendaEstimada).length

  let veredito = 'cabe'
  if (semRenda) veredito = 'sem_dados'
  else if (negativos.length) veredito = 'nao_cabe'
  else if (maiorPct > LIMITES.parcelaSobreRenda || apertados.length || maiorPct > LIMITES.parcelaSobreRendaAlerta) veredito = 'apertado'

  const pontos = []
  const pct = (x) => `${(x * 100).toFixed(0).replace('.', ',')}%`
  if (semRenda) pontos.push({ tipo: 'aviso', texto: 'Não há renda cadastrada para esses meses, então não dá para dizer se cabe. Cadastre sua renda em Renda e simule de novo.' })
  else {
    pontos.push({ tipo: maiorPct > LIMITES.parcelaSobreRenda ? 'ruim' : maiorPct > LIMITES.parcelaSobreRendaAlerta ? 'atencao' : 'bom', texto: `A parcela pesa ${pct(maiorPct)} da sua renda no pior mês. Referência comum: manter parcelas de dívidas até ~${pct(LIMITES.parcelaSobreRenda)} da renda.` })
    if (negativos.length) {
      pontos.push({ tipo: 'ruim', texto: `Em ${nMeses(negativos.length)} o orçamento fica negativo (o pior é ${pior.mes.split('-').reverse().join('/')}, faltando ${fmt(Math.abs(pior.sobraDepois))}).${novosNegativos.length ? ' Hoje, sem o empréstimo, nesses meses você fecha no positivo.' : ''}` })
    } else if (apertados.length) {
      pontos.push({ tipo: 'atencao', texto: `Em ${nMeses(apertados.length)} sobra menos de ${pct(LIMITES.folgaMinima)} da renda depois da parcela — sem folga para imprevistos.` })
    } else {
      pontos.push({ tipo: 'bom', texto: `Em todos os meses você continua com sobra (mínimo de ${fmt(pior.sobraDepois)} em ${pior.mes.split('-').reverse().join('/')}).` })
    }
  }
  if (estimadas > 0 && !semRenda) pontos.push({ tipo: 'aviso', texto: `Em ${nMeses(estimadas)} sem renda cadastrada usei a última renda conhecida. A conta fica mais exata se você cadastrar a renda dos próximos meses.` })

  // Custo
  const centavo = (n) => fmt(n).replace('R$ ', '')
  pontos.push({ tipo: sim.taxaMes >= LIMITES.taxaMuitoCara ? 'ruim' : sim.taxaMes >= LIMITES.taxaCara ? 'atencao' : 'info', texto: `Para receber R$ ${centavo(sim.recebido)} você paga R$ ${centavo(sim.total)}: custo de R$ ${centavo(sim.custo)} (cada R$ 1 recebido custa R$ ${(sim.total / sim.recebido).toFixed(2).replace('.', ',')}). Custo efetivo (CET): ${(sim.cetMes * 100).toFixed(2).replace('.', ',')}% ao mês, ${(sim.cetAno * 100).toFixed(1).replace('.', ',')}% ao ano.` })
  if (sim.taxaMes >= LIMITES.taxaCara) pontos.push({ tipo: 'atencao', texto: `Taxa de ${(sim.taxaMes * 100).toFixed(2).replace('.', ',')}% ao mês é alta para crédito pessoal comum. Vale cotar em outros bancos, consignado ou com garantia (costumam ter taxa bem menor) antes de fechar.` })
  if (sim.cetMes - sim.taxaMes > 0.003) pontos.push({ tipo: 'info', texto: `Os custos extras (IOF, tarifa, seguro) elevam o custo real em ${((sim.cetMes - sim.taxaMes) * 100).toFixed(2).replace('.', ',')} ponto(s) percentual(is) ao mês acima da taxa anunciada. Compare propostas pelo CET, não pela taxa.` })

  // Reserva
  if (reserva != null && reserva > 0) {
    if (reserva >= sim.valor) pontos.push({ tipo: 'info', texto: `Sua reserva (R$ ${centavo(reserva)}) cobre o valor. Usar a reserva evitaria R$ ${centavo(sim.custo)} de custo — mas deixa você sem colchão; só vale se for recompor logo.` })
    else pontos.push({ tipo: 'info', texto: `Sua reserva (R$ ${centavo(reserva)}) cobre ${Math.round((reserva / sim.valor) * 100)}% do valor: pegar menos emprestado reduz o custo proporcionalmente.` })
  }

  // Parcelamentos que acabam durante o prazo: melhor contratar depois?
  if (parcelamentosQueAcabam.length && veredito !== 'cabe') {
    const prox = parcelamentosQueAcabam[0]
    pontos.push({ tipo: 'info', texto: `Seus parcelamentos começam a acabar em ${prox.mes.split('-').reverse().join('/')} (libera R$ ${centavo(prox.libera)}/mês). Esperar até lá deixa o orçamento mais folgado.` })
  }

  // Prazos alternativos (mesma taxa e custos)
  const alternativas = prazosAlternativos.filter((p) => p !== sim.prazo).concat([sim.prazo]).sort((a, b) => a - b).map((prazo) => {
    const s = prazo === sim.prazo ? sim : simular({ valor: sim.valor, taxaMes: sim.taxaMes, prazo, sistema: sim.sistema, iofPct: sim.valor ? (sim.iof / sim.valor) * 100 : 0, tarifa: sim.tarifa, seguroMes: sim.parcelas[0].seguro, financiarCustos: sim.financiarCustos })
    const im = impactoMensal(s, primeiroMes, dadosDoMes, rendaFallback)
    const cabe = im.every((m) => m.renda > 0 && m.sobraDepois >= 0)
    const folgado = cabe && im.every((m) => m.sobraDepois >= m.renda * LIMITES.folgaMinima) && Math.max(...im.map((m) => m.pctParcela ?? 0)) <= LIMITES.parcelaSobreRenda
    return { prazo, atual: prazo === sim.prazo, primeira: s.primeira, total: s.total, custo: s.custo, cabe, folgado, maiorPct: Math.max(...im.map((m) => m.pctParcela ?? 0)) }
  })
  const menorQueCabe = alternativas.find((a) => a.folgado) || alternativas.find((a) => a.cabe) || null
  if (!semRenda && veredito !== 'cabe' && menorQueCabe && !menorQueCabe.atual) {
    pontos.push({ tipo: 'info', texto: `Em ${menorQueCabe.prazo} meses a parcela cairia para ~R$ ${centavo(menorQueCabe.primeira)} e ${menorQueCabe.folgado ? 'ficaria confortável' : 'passaria a caber'}, mas o custo total sobe para R$ ${centavo(menorQueCabe.total)}.` })
  }
  if (!semRenda && veredito === 'cabe') {
    const maisCurto = alternativas.filter((a) => a.folgado && a.prazo < sim.prazo).sort((a, b) => b.custo - a.custo).pop()
    if (maisCurto) pontos.push({ tipo: 'bom', texto: `Dá para encurtar: em ${maisCurto.prazo} meses (parcela ~R$ ${centavo(maisCurto.primeira)}) ainda cabe e você paga R$ ${centavo(sim.custo - maisCurto.custo)} a menos de custo.` })
  }

  return { veredito, meses, pontos, alternativas, pior, maiorPct, semRenda }
}

// Em quantos meses a partir de `hoje` o empréstimo passaria a caber (testa começar daqui a 0..maxEspera meses).
export function melhorInicio(sim, primeiroMes, dadosDoMes, rendaFallback = 0, maxEspera = 12) {
  for (let i = 0; i <= maxEspera; i++) {
    const inicio = addMonths(primeiroMes, i)
    const im = impactoMensal(sim, inicio, dadosDoMes, rendaFallback)
    if (im.every((m) => m.renda > 0 && m.sobraDepois >= 0 && m.sobraDepois >= m.renda * LIMITES.folgaMinima)) return { inicio, espera: i }
  }
  return null
}
