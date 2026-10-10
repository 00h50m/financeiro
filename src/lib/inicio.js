import { resumoDoMes, lerUsarSaldoAnterior } from './financeiro.js'
import { gastosPorCategoria, nowYM, hojeSP, tituloCompra } from './utils.js'
import { comprasLiquidas, fixosLiquidos } from './divisoes.js'

const MS_DIA = 86400000

function ultimoDia(mes) {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).getUTCDate()
}

// Dias até o vencimento (negativo = venceu). Só faz sentido quando o mês é o mês de hoje; nos
// outros meses não há "atraso" nem "falta pouco", então devolve null e a tela só mostra o dia.
export function diasAte(mes, dia, hoje = hojeSP()) {
  if (!dia || mes !== hoje.slice(0, 7)) return null
  const d = Math.min(Number(dia), ultimoDia(mes))
  const alvo = Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, d)
  const ref = Date.UTC(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)) - 1, Number(hoje.slice(8, 10)))
  return Math.round((alvo - ref) / MS_DIA)
}

export function textoVencimento(dias, dia) {
  if (dias == null) return dia ? `dia ${dia}` : 'sem data'
  if (dias < -1) return `venceu há ${-dias} dias`
  if (dias === -1) return 'venceu ontem'
  if (dias === 0) return 'vence hoje'
  if (dias === 1) return 'vence amanhã'
  return `vence em ${dias} dias`
}

// Contas do mês (fixos avulsos, faturas de cartão e parcelas sem cartão), com a situação de cada uma.
// Em aberto primeiro, da mais urgente para a mais distante; pagas por último.
export function contasDoMes(detalhe, cartoes, mes, hoje = hojeSP()) {
  const linhas = []
  for (const f of detalhe.fixosLista) {
    const dia = f.dia_vencimento || null
    linhas.push({
      chave: `fixo-${f.id}`, tipo: 'fixo', nome: f.nome, valor: Number(f.valor), dia,
      pago: !!detalhe.fixoPagamento(f.id)?.pago, estimado: !!f.estimado,
    })
  }
  for (const l of detalhe.linhasCartao) {
    const dia = cartoes.find((c) => c.id === l.cartao_id)?.vencimento || null
    linhas.push({
      chave: `fatura-${l.cartao_id}`, tipo: 'fatura', nome: `Fatura ${l.nome}`, valor: l.valor, dia,
      pago: !!l.pago, estimado: !l.temFatura,
    })
  }
  for (const c of detalhe.outrasContas) {
    linhas.push({
      chave: `compra-${c.id}`, tipo: 'compra', nome: tituloCompra(c), valor: c.valorParcela, dia: null,
      pago: !!c.pago, estimado: false,
    })
  }
  return linhas
    .map((l) => {
      const dias = l.pago ? null : diasAte(mes, l.dia, hoje)
      return { ...l, dias, atrasada: dias != null && dias < 0, texto: l.pago ? 'pago' : textoVencimento(dias, l.dia) }
    })
    .sort((a, b) => (a.pago - b.pago) || ((a.dia || 99) - (b.dia || 99)) || a.nome.localeCompare(b.nome))
}

// Categorias do mês em ordem decrescente, com a parte de cada uma. Mostra as `max` maiores e junta o resto.
export function categoriasDoMes(mapa, max = 5) {
  const todas = Object.entries(mapa).map(([nome, { total }]) => ({ nome, valor: total })).filter((c) => c.valor > 0)
    .sort((a, b) => b.valor - a.valor)
  const soma = todas.reduce((s, c) => s + c.valor, 0)
  if (!soma) return { total: 0, itens: [] }
  let itens = todas
  if (todas.length > max) {
    const resto = todas.slice(max - 1).reduce((s, c) => s + c.valor, 0)
    itens = [...todas.slice(0, max - 1), { nome: 'Outras', valor: resto }]
  }
  return { total: soma, itens: itens.map((c) => ({ ...c, pct: Math.round((c.valor / soma) * 1000) / 10 })) }
}

// Tudo o que a tela Início mostra, vindo do mesmo motor financeiro da aba Pagamentos (os números batem).
//  pode gastar = sobraProjetada = renda + saldo anterior + ajuste − comprometido (depois de pagar tudo do mês)
export function montarInicio(store, mes = nowYM(), hoje = hojeSP()) {
  const r = resumoDoMes(store, mes, { usarSaldoAnterior: lerUsarSaldoAnterior() })
  const contas = contasDoMes(r.detalhe, store.cartoes, mes, hoje)
  const abertas = contas.filter((c) => !c.pago)
  const categorias = categoriasDoMes(gastosPorCategoria(comprasLiquidas(store), store.cartoes, fixosLiquidos(store), mes))
  return {
    mes,
    entrada: r.renda,
    comprometido: r.comprometido,
    pago: r.pago,
    aPagar: r.aPagar,
    pctPago: r.comprometido > 0 ? Math.min(100, Math.round((r.pago / r.comprometido) * 100)) : 0,
    podeGastar: r.sobraProjetada,
    saldoAnterior: r.saldoAnterior,
    contas,
    abertas,
    atrasadas: abertas.filter((c) => c.atrasada).length,
    categorias,
  }
}
