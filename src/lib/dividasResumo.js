// Resumo do plano de dívidas para o Início e para o Telegram: quanto se deve, o que quita primeiro e quando fica livre.
import { compararEstrategias, resumoDividas } from './dividas.js'
import { perfilDeLinhas, projecaoRenda } from './rendaSazonal.js'
import { mesLabel } from './utils.js'

const r2 = (n) => Math.round(n * 100) / 100

// `d`: dados no formato do store. -> null se não há dívida ativa.
export function resumoDoPlano(d, hoje, { estrategia = 'avalanche' } = {}) {
  const dividas = (d.dividas || []).filter((x) => x.ativa !== false && Number(x.saldo) > 0)
  if (!dividas.length) return null
  const mes = hoje.slice(0, 7)
  const perfil = perfilDeLinhas(d.rendaSazonal || [])
  const sobras = projecaoRenda(d, perfil, mes, 24).map((m) => Math.max(0, m.sobra))
  const plano = compararEstrategias(d.dividas, { orcamento: sobras, inicio: mes })[estrategia]
  const base = resumoDividas(d.dividas)
  const inicial = (d.dividas || []).filter((x) => x.ativa !== false).reduce((t, x) => t + (Number(x.saldo_inicial) || Number(x.saldo)), 0)
  const pago = Math.max(0, r2(inicial - base.total))
  const proxima = plano.ordemQuitacao[0] || null
  return {
    total: base.total, qtd: base.qtd, atrasadas: base.atrasadas, pago, pctPago: inicial > 0 ? Math.round((pago / inicial) * 100) : 0,
    proxima: proxima ? { nome: proxima.nome, mes: proxima.mes, meses: proxima.idx + 1 } : null,
    livreMes: plano.livreMes, livreEm: plano.livreEm,
    texto: `${base.qtd} ${base.qtd === 1 ? 'dívida' : 'dívidas'}, total ${r2(base.total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${proxima ? `; a próxima a quitar é ${proxima.nome} em ${mesLabel(proxima.mes)}` : ''}${plano.livreMes ? `; livre em ${mesLabel(plano.livreMes)}` : ''}`,
  }
}
