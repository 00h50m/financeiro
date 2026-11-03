// CALENDÁRIO FINANCEIRO: o que vence em cada dia do mês. Sem duplicar: cada item aparece uma vez.
// Fonte: o mesmo detalhe do motor financeiro (fixos ativos, faturas do mês, parcelas sem cartão).
import { detalhePagamentos } from './financeiro.js'

export const diasNoMes = (mes) => new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate()
const clampDia = (dia, mes) => Math.min(Math.max(1, Number(dia) || 1), diasNoMes(mes))

// Lista de eventos { chave, dia, tipo: 'fixo'|'fatura'|'parcela', titulo, valor, pago, aba }, por dia.
// `semDia`: contas fixas sem dia de vencimento (aparecem à parte).
export function eventosDoMes(d, mes) {
  const det = detalhePagamentos(d, mes)
  const eventos = []
  const semDia = []
  for (const f of det.fixosLista) {
    const item = { chave: `fixo|${f.id}|${f.mesPagamento || ''}`, tipo: 'fixo', titulo: f.nome, valor: Number(f.valor), pago: !!det.fixoPagamento(f)?.pago, aba: 'pagamentos' }
    if (f.dia_vencimento) eventos.push({ ...item, dia: clampDia(f.dia_vencimento, mes) })
    else semDia.push(item)
  }
  for (const l of det.linhasCartao) {
    const cartao = d.cartoes.find((c) => c.id === l.cartao_id)
    if (!cartao?.vencimento) continue
    eventos.push({
      chave: `fatura|${l.cartao_id}`, dia: clampDia(cartao.vencimento, mes), tipo: 'fatura', titulo: `Fatura ${l.nome}`,
      valor: l.valor, pago: l.pago, aba: 'faturas', estimada: !l.temFatura,
    })
  }
  for (const c of det.outrasContas) {
    eventos.push({
      chave: `parcela|${c.id}|${mes}`, dia: clampDia(String(c.data_compra || '').slice(8, 10), mes), tipo: 'parcela',
      titulo: `${c.identificacao || c.descricao}${c.parcelaTotal > 1 ? ` (${c.parcelaNum}/${c.parcelaTotal})` : ''}`,
      valor: c.valorParcela, pago: c.pago, aba: 'pagamentos',
    })
  }
  eventos.sort((a, b) => a.dia - b.dia || a.titulo.localeCompare(b.titulo))
  return { eventos, semDia }
}

// Agrupa por dia: { [dia]: eventos[] }.
export function porDia(eventos) {
  const mapa = {}
  for (const e of eventos) (mapa[e.dia] ||= []).push(e)
  return mapa
}

// Grade do mês para o calendário: semanas de domingo a sábado; cada dia com seus eventos e um estado
//   atrasada (tem conta em aberto que já venceu) | aberta (tem conta em aberto) | paga (tudo pago) | null (nada vence).
export function grade(mes, eventos, hoje) {
  const dias = diasNoMes(mes)
  const primeiro = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).getDay()
  const por = porDia(eventos)
  const mesHoje = hoje.slice(0, 7)
  const diaHoje = mesHoje === mes ? Number(hoje.slice(8, 10)) : null
  const estadoDe = (dia) => {
    const ev = por[dia] || []
    if (!ev.length) return null
    const abertos = ev.filter((e) => !e.pago)
    if (!abertos.length) return 'paga'
    const venceu = mes < mesHoje || (diaHoje != null && dia < diaHoje)
    return venceu ? 'atrasada' : 'aberta'
  }
  const celulas = [...Array(primeiro).fill(null), ...Array.from({ length: dias }, (_, i) => {
    const dia = i + 1
    const ev = por[dia] || []
    return { dia, eventos: ev, estado: estadoDe(dia), total: Math.round(ev.reduce((t, e) => t + e.valor, 0) * 100) / 100, hoje: diaHoje === dia }
  })]
  while (celulas.length % 7) celulas.push(null)
  const semanas = []
  for (let i = 0; i < celulas.length; i += 7) semanas.push(celulas.slice(i, i + 7))
  return semanas
}
