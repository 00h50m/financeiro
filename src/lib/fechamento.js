// FECHAMENTO MENSAL: validações, foto do mês (snapshot) e regras de mês fechado.
// Funções puras. `d` = os dados do app (o store): compras, cartoes, fixos, faturas, rendas, saldoAjustes,
// fixosPagamentos, comprasPagamentos(+Ok), fechamentos, eventos, orcamentos.
import { addMonths, gastosPorCategoria, gerarParcelas, hojeSP, mesLabel, nowYM, statusTeto } from './utils.js'
import { resumoDoMes } from './financeiro.js'
import { comprasLiquidas, fixosLiquidos, parteDosOutrosNoMes, resumoRepasses } from './divisoes.js'

export const VERSAO_MOTOR = 1 // sobe quando a definição de algum número do fechamento mudar

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100

export const fechamentoDe = (fechamentos, mes) => (fechamentos || []).find((f) => f.mes === mes)
export const mesFechado = (fechamentos, mes) => fechamentoDe(fechamentos, mes)?.status === 'fechado'

// Meses (competências) que uma compra ocupa: um por parcela.
export const mesesDaCompra = (compra, cartoes) => (compra ? gerarParcelas(compra, cartoes).map((p) => p.mes) : [])

// Quais meses FECHADOS uma ou mais compras tocam (para pedir justificativa antes de alterar).
export function mesesFechadosTocados(compras, cartoes, fechamentos) {
  const meses = new Set()
  for (const c of compras.filter(Boolean)) for (const m of mesesDaCompra(c, cartoes)) meses.add(m)
  return [...meses].filter((m) => mesFechado(fechamentos, m)).sort()
}

// Foto do mês: o que fica gravado no fechamento. Não depende de nenhuma tela.
export function montarFoto(d, mes, { reservaDestinada = 0, alertasAceitos = [] } = {}) {
  const r = resumoDoMes(d, mes, { usarSaldoAnterior: true })
  const det = r.detalhe
  const reserva = arred(reservaDestinada)

  // Por categoria: valor lançado das compras + fixos; a diferença entre fatura real e lançado vira linha própria,
  // para a soma fechar com as despesas.
  const mapa = gastosPorCategoria(comprasLiquidas(d), d.cartoes, fixosLiquidos(d), mes)
  const porCategoria = Object.fromEntries(Object.entries(mapa).map(([k, v]) => [k, arred(v.total)]))
  const parteOutros = arred(parteDosOutrosNoMes(d, mes)) // categorias contam só a sua parte; a dos outros fecha a conta
  if (parteOutros > 0) porCategoria['Parte de outras pessoas'] = parteOutros
  const somaCat = Object.values(porCategoria).reduce((s, v) => s + v, 0)
  const difFaturas = arred(r.comprometido - somaCat)
  if (Math.abs(difFaturas) >= 0.01) porCategoria['Diferença entre fatura e lançado'] = difFaturas

  // Por pessoa: parcelas do mês de cada compra; contas fixas e a diferença de fatura em linhas próprias.
  const porPessoa = {}
  for (const c of d.compras) {
    const p = gerarParcelas(c, d.cartoes).find((x) => x.mes === mes)
    if (p) porPessoa[c.pessoa || 'Sem pessoa'] = arred((porPessoa[c.pessoa || 'Sem pessoa'] || 0) + p.valor)
  }
  if (det.totalFixos) porPessoa['Contas fixas'] = arred(det.totalFixos)
  const somaPes = Object.values(porPessoa).reduce((s, v) => s + v, 0)
  const difPes = arred(r.comprometido - somaPes)
  if (Math.abs(difPes) >= 0.01) porPessoa['Diferença entre fatura e lançado'] = difPes

  const saldoFinal = arred(r.sobraProjetada)
  return {
    mes,
    renda: arred(r.renda),
    despesas: arred(r.comprometido),
    pago: arred(r.pago),
    pendente: arred(r.aPagar),
    sobra: arred(r.sobraDoMes),
    saldo_anterior: arred(r.saldoAnterior),
    ajuste: arred(r.ajuste),
    saldo_final: saldoFinal,
    reserva_destinada: reserva,
    saldo_transportado: arred(saldoFinal - reserva),
    por_categoria: porCategoria,
    por_pessoa: porPessoa,
    detalhes: {
      fixos: det.fixosLista.map((f) => ({ id: f.id, nome: f.nome, valor: Number(f.valor), pago: !!det.fixoPagamento(f.id)?.pago })),
      faturas: det.linhasCartao.map((l) => ({
        cartao_id: l.cartao_id, nome: l.nome, valor: arred(l.valor), lancado: arred(l.lancado), real: l.temFatura, pago: l.pago,
      })),
      sem_cartao: det.outrasContas.map((c) => ({
        id: c.id, descricao: c.descricao, valor: arred(c.valorParcela), parcela: `${c.parcelaNum}/${c.parcelaTotal}`, pago: c.pago,
      })),
      alertas_aceitos: alertasAceitos,
    },
    versao_motor: VERSAO_MOTOR,
  }
}

// Validações antes de fechar. Bloqueantes impedem; alertas pedem confirmação explícita.
export function validarFechamento(d, mes, { hoje = nowYM() } = {}) {
  const bloqueantes = []
  const alertas = []
  const rotulo = mesLabel(mes)
  const fechamentos = d.fechamentos || []
  const r = resumoDoMes(d, mes, { usarSaldoAnterior: true })
  const det = r.detalhe

  if (mesFechado(fechamentos, mes)) bloqueantes.push(`${rotulo} já está fechado. Reabra antes de fechar de novo.`)
  if (mes > hoje) bloqueantes.push(`${rotulo} ainda não começou. Só dá para fechar meses que já começaram.`)
  if (mes === hoje) alertas.push(`${rotulo} ainda não terminou. Se fechar agora, lançamentos futuros do mês ficarão fora da foto.`)
  if (!(r.rendaSalario > 0)) bloqueantes.push(`${rotulo} não tem renda cadastrada (tela Renda). Sem renda a sobra não tem significado.`)

  det.linhasCartao.filter((l) => !l.temFatura).forEach((l) => {
    bloqueantes.push(`Fatura ${l.nome} de ${rotulo} ainda sem valor real. Informe o valor do banco na tela Faturas.`)
  })

  // Mês anterior: precisa estar fechado quando já existem fechamentos mais antigos (não pode pular mês).
  const ant = addMonths(mes, -1)
  const fechadosAntes = fechamentos.filter((f) => f.status === 'fechado' && f.mes < mes)
  if (fechadosAntes.length > 0 && !mesFechado(fechamentos, ant)) {
    bloqueantes.push(`${mesLabel(ant)} ainda não está fechado. Feche os meses em ordem, para o saldo transportado fazer sentido.`)
  }
  if (fechadosAntes.length === 0 && !mesFechado(fechamentos, ant)) {
    alertas.push(`Este é o primeiro fechamento: o saldo anterior vem da conta automática dos meses passados, não de um fechamento.`)
  }

  // Alertas
  const pendInbox = (d.eventos || []).filter((e) =>
    ['pendente', 'aguardando_dados'].includes(e.status) && String(e.data_evento || '').slice(0, 7) === mes)
  if (pendInbox.length) alertas.push(`${pendInbox.length} ${pendInbox.length === 1 ? 'item pendente' : 'itens pendentes'} no Inbox com data em ${rotulo}.`)

  const fixosAbertos = det.fixosLista.filter((f) => !det.fixoPagamento(f.id)?.pago)
  if (fixosAbertos.length) alertas.push(`${fixosAbertos.length} ${fixosAbertos.length === 1 ? 'conta fixa' : 'contas fixas'} sem marca de paga: ${fixosAbertos.map((f) => f.nome).join(', ')}.`)

  const semCartaoAbertas = det.outrasContas.filter((c) => !c.pago)
  if (semCartaoAbertas.length) alertas.push(`${semCartaoAbertas.length} ${semCartaoAbertas.length === 1 ? 'parcela sem cartão' : 'parcelas sem cartão'} sem marca de paga.`)

  det.linhasCartao.filter((l) => l.temFatura && !l.pago).forEach((l) => {
    alertas.push(`Fatura ${l.nome} de ${rotulo} ainda não está marcada como paga.`)
  })
  det.linhasCartao.filter((l) => l.temFatura && Math.abs(l.valor - l.lancado) >= 1).forEach((l) => {
    const dif = l.valor - l.lancado
    alertas.push(`Fatura ${l.nome}: o banco cobrou R$ ${Math.abs(dif).toFixed(2).replace('.', ',')} ${dif > 0 ? 'a mais' : 'a menos'} do que foi lançado.`)
  })

  const rep = resumoRepasses(d, mes)
  if (rep.aReceber > 0.005) alertas.push(`Ainda falta receber R$ ${rep.aReceber.toFixed(2).replace('.', ',')} de outras pessoas (aba Divididos). Isso não entra na sobra enquanto não for recebido.`)

  const mapa = gastosPorCategoria(comprasLiquidas(d), d.cartoes, fixosLiquidos(d), mes)
  Object.entries(mapa).forEach(([cat, v]) => {
    const teto = Number((d.orcamentos || []).find((o) => o.categoria === cat)?.valor) || 0
    if (statusTeto(v.total, teto) === 'estourou') alertas.push(`${cat} passou do teto do Orçamento em ${rotulo}.`)
  })
  if (r.sobraProjetada < 0) alertas.push(`O mês termina no vermelho: saldo final de R$ ${r.sobraProjetada.toFixed(2).replace('.', ',')}.`)

  return { bloqueantes, alertas, resumo: r }
}

// Riscos para a Central do mês (Dashboard). nivel: 'alto' | 'medio'. aba: para onde levar.
export function riscosDoMes(d, mes, { hoje = nowYM(), diaHoje = Number(hojeSP().slice(8, 10)) } = {}) {
  const riscos = []
  const r = resumoDoMes(d, mes, { usarSaldoAnterior: true })
  const det = r.detalhe
  if (!(r.rendaSalario > 0)) riscos.push({ nivel: 'medio', texto: 'A renda deste mês não está cadastrada.', aba: 'renda' })
  if (r.renda > 0 && r.sobraProjetada < 0) {
    riscos.push({ nivel: 'alto', texto: `O mês deve terminar no vermelho (${Math.round(r.sobraProjetada).toLocaleString('pt-BR')}).`, aba: 'pagamentos' })
  }
  if (mes === hoje) {
    const atrasadas = det.fixosLista.filter((f) => f.dia_vencimento && Number(f.dia_vencimento) < diaHoje && !det.fixoPagamento(f.id)?.pago)
    if (atrasadas.length) riscos.push({ nivel: 'alto', texto: `${atrasadas.length} ${atrasadas.length === 1 ? 'conta fixa já venceu' : 'contas fixas já venceram'} sem marca de paga: ${atrasadas.map((f) => f.nome).join(', ')}.`, aba: 'pagamentos' })
  }
  det.linhasCartao.filter((l) => !l.temFatura && !l.pago).forEach((l) => {
    riscos.push({ nivel: 'medio', texto: `Fatura ${l.nome}: valor ainda estimado (sem o valor real do banco).`, aba: 'faturas' })
  })
  const pend = (d.eventos || []).filter((e) => ['pendente', 'aguardando_dados'].includes(e.status)).length
  if (pend) riscos.push({ nivel: 'medio', texto: `${pend} ${pend === 1 ? 'item' : 'itens'} no Inbox esperando confirmação.`, aba: 'inbox' })
  const ant = addMonths(mes, -1)
  if (d.fechamentosOk && mes === hoje && !mesFechado(d.fechamentos, ant) && (d.fechamentos || []).some((f) => f.status === 'fechado')) {
    riscos.push({ nivel: 'medio', texto: `${mesLabel(ant)} ainda não foi fechado.`, aba: 'fechamento' })
  }
  return riscos
}
