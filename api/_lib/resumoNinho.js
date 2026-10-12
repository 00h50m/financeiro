// Resumo do mês para o Ninho (app da casa). Só números do mês corrente e o que vence nos próximos 7 dias;
// nenhuma compra, cartão ou pessoa vai junto. Os números vêm do mesmo motor do Dashboard (financeiro.js).
import { addMonths, statusTeto } from '../../src/lib/utils.js'
import { anexarValores } from '../../src/lib/fixosVersoes.js'
import { resumoDoMes } from '../../src/lib/financeiro.js'
import { eventosDoMes } from '../../src/lib/calendario.js'
import { serieMensal } from '../../src/lib/evolucao.js'

const somarDia = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100

export function resumoParaNinho(dados, hoje, { dias = 7 } = {}) {
  const d = { ...dados, fixos: anexarValores(dados.fixos, dados.fixosValores) }
  const mes = hoje.slice(0, 7)
  const r = resumoDoMes(d, mes)
  const ate = somarDia(hoje, dias)
  const vencimentos = [mes, addMonths(mes, 1)].flatMap((m) => eventosDoMes(d, m).eventos.map((e) => ({ ...e, data: `${m}-${String(e.dia).padStart(2, '0')}` })))
    .filter((e) => !e.pago && e.data >= hoje && e.data <= ate)
    .slice(0, 6)
    .map((e) => ({ titulo: String(e.titulo).slice(0, 60), valor: r2(e.valor), data: e.data, estimada: !!e.estimada }))
  const [atual] = serieMensal(d, mes, 1)
  const tetos = (d.orcamentos || []).map((o) => ({ cat: o.categoria, teto: Number(o.valor), gasto: (atual?.porCategoria || {})[o.categoria] || 0 }))
    .filter((t) => t.teto > 0)
  const avisos = [
    ...tetos.filter((t) => statusTeto(t.gasto, t.teto) === 'estourou').map((t) => ({ tom: 'ruim', texto: `${t.cat} passou do teto` })),
    ...tetos.filter((t) => statusTeto(t.gasto, t.teto) === 'perto').map((t) => ({ tom: 'atencao', texto: `${t.cat} perto do teto` })),
  ].slice(0, 3)
  return {
    mes, renda: r2(r.renda), comprometido: r2(r.comprometido), pago: r2(r.pago), aPagar: r2(r.aPagar), sobraProjetada: r2(r.sobraProjetada),
    pctComprometido: r.renda > 0 ? Math.round((r.comprometido / r.renda) * 100) : null, vencimentos, avisos,
  }
}
