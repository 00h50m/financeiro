// Contexto que o consultor com IA recebe: só números que o app já calculou (a IA explica e prioriza, não calcula).
import { compararEstrategias, resumoDividas } from './dividas.js'
import { detalhePagamentos } from './financeiro.js'
import { terminandoLogo } from './parcelamentos.js'
import { atrasadasDoApp } from './dividasApp.js'
import { tituloCompra } from './utils.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// `real`: [{ mes, renda, comprometido, reserva, sobraReal }] (sobraReal do gastoVariavel) · `reserva`: saída de reservaVariavel
export function montarContexto(store, { hoje, real, reserva, estrategia = 'avalanche', sobrasOrcamento }) {
  const mes = hoje.slice(0, 7)
  const dividas = (store.dividas || []).filter((d) => d.ativa !== false && Number(d.saldo) > 0)
  const cmp = compararEstrategias(store.dividas || [], { orcamento: sobrasOrcamento, inicio: mes })
  const plano = (e) => ({
    livre_em: cmp[e].livreMes || null, meses: cmp[e].livreEm != null ? cmp[e].livreEm + 1 : null, juros_total: r2(cmp[e].jurosTotal),
    nao_quitam: cmp[e].naoQuitam.map((x) => x.nome), meses_sem_cobrir_minimos: cmp[e].faltas.slice(0, 6).map((f) => ({ mes: f.mes, falta: f.falta })),
    ordem: cmp[e].ordemQuitacao.slice(0, 10).map((o) => ({ nome: o.nome, mes: o.mes })),
  })
  const det = detalhePagamentos(store, mes)
  const contas = [
    ...det.fixosLista.map((f) => ({ nome: f.nome, valor: r2(f.valor), pago: !!det.fixoPagamento(f)?.pago, tipo: 'conta fixa' })),
    ...det.linhasCartao.map((l) => ({ nome: `Fatura ${l.nome}`, valor: r2(l.valor), pago: !!l.pago, tipo: 'cartão' })),
    ...det.outrasContas.map((c) => ({ nome: tituloCompra(c), valor: r2(c.valorParcela), pago: !!c.pago, tipo: 'parcela/boleto' })),
  ].sort((a, b) => b.valor - a.valor).slice(0, 15)
  return {
    hoje, mes, estrategia_do_app: estrategia,
    dividas: dividas.slice(0, 30).map((d) => ({ nome: d.nome, tipo: d.tipo || null, saldo: r2(d.saldo), parcela_minima: r2(d.parcela), juros_mes_pct: Number(d.juros_mes) || 0, atrasada: !!d.atrasada })),
    resumo: resumoDividas(store.dividas),
    meses: real.slice(0, 12).map((m) => ({ mes: m.mes, renda: r2(m.renda), comprometido: r2(m.comprometido), reserva_dia_a_dia: r2(m.reserva), sobra_real: r2(m.sobraReal) })),
    dia_a_dia: reserva.categorias.slice(0, 10).map((c) => ({ categoria: c.categoria, reservado_mes: r2(c.reservado), teto_semana: r2(c.porSemana), gasto_ja_no_mes: r2(c.noMes) })),
    planos: { avalanche: plano('avalanche'), bola_de_neve: plano('bola'), so_minimos: plano('minimos') },
    contas_do_mes: contas,
    parcelamentos_terminando: terminandoLogo(store.compras || [], store.cartoes || [], mes, 12).slice(0, 6).map((t) => ({ nome: tituloCompra(t.compra), termina_em: t.termino, libera_por_mes: r2(t.libera) })),
    atrasadas_no_app: atrasadasDoApp(store, `${mes}-01`, store.dividas || []).slice(0, 10).map((a) => ({ nome: a.nome, valor: r2(a.valor), mes: a.mes })),
  }
}
