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
      chave: `fixo-${f.id}${f.mesPagamento ? `-${f.mesPagamento}` : ''}`, tipo: 'fixo', nome: f.nome, valor: Number(f.valor), dia,
      pago: !!detalhe.fixoPagamento(f)?.pago, estimado: !!f.estimado,
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

const soma = (lista) => Math.round(lista.reduce((t, c) => t + c.valor, 0) * 100) / 100

// Dias que faltam no mês, contando hoje. Só existe no mês atual (nos outros não há "por dia").
export function diasRestantes(mes, hoje = hojeSP()) {
  if (mes !== hoje.slice(0, 7)) return null
  return ultimoDia(mes) - Number(hoje.slice(8, 10)) + 1
}

// "Para onde vai o dinheiro do mês": o que já foi pago, o que ainda falta pagar e o que sobra livre.
// As três partes somam 100% da barra (se faltar dinheiro, a parte livre some e a barra mostra só as contas).
export function repartoDoMes(pago, aPagar, podeGastar) {
  const livre = Math.max(podeGastar, 0)
  const total = pago + aPagar + livre
  const parte = (chave, rotulo, valor) => ({ chave, rotulo, valor, pct: total > 0 ? Math.round((valor / total) * 1000) / 10 : 0 })
  return { total, partes: [parte('pago', 'Já pago', pago), parte('apagar', 'Falta pagar', aPagar), parte('livre', 'Livre', livre)] }
}

// Linha do mês: uma marca por dia de vencimento (com o que vence nele) e a posição de hoje.
export function linhaDoMes(contas, mes, hoje = hojeSP()) {
  const porDia = new Map()
  let semData = 0
  for (const c of contas) {
    if (!c.dia) { if (!c.pago) semData += 1; continue }
    const dia = Math.min(Number(c.dia), ultimoDia(mes))
    if (!porDia.has(dia)) porDia.set(dia, [])
    porDia.get(dia).push(c)
  }
  const marcas = [...porDia.entries()].sort((a, b) => a[0] - b[0]).map(([dia, itens]) => ({
    dia,
    valor: soma(itens),
    itens: itens.map((c) => ({ nome: c.nome, valor: c.valor, pago: c.pago })),
    estado: itens.every((c) => c.pago) ? 'pago' : itens.some((c) => c.atrasada) ? 'atrasada' : 'aberta',
  }))
  return { ultimoDia: ultimoDia(mes), hoje: mes === hoje.slice(0, 7) ? Number(hoje.slice(8, 10)) : null, marcas, semData }
}

// O que pede atenção agora: atrasadas e o que vence em até 7 dias.
export function atencaoDoMes(abertas) {
  const atrasadas = abertas.filter((c) => c.atrasada)
  const proximas = abertas.filter((c) => c.dias != null && c.dias >= 0 && c.dias <= 7)
  return {
    atrasadas: { n: atrasadas.length, valor: soma(atrasadas) },
    proximos7: { n: proximas.length, valor: soma(proximas) },
  }
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
    disponivel: r.disponivel,
    pctComprometido: r.renda > 0 ? Math.round((r.comprometido / r.renda) * 100) : null,
    saldoAnterior: r.saldoAnterior,
    contas,
    abertas,
    atrasadas: abertas.filter((c) => c.atrasada).length,
    categorias,
    diasRestantes: diasRestantes(mes, hoje),
    porDia: r.sobraProjetada > 0 && diasRestantes(mes, hoje) ? r.sobraProjetada / diasRestantes(mes, hoje) : null,
    reparto: repartoDoMes(r.pago, r.aPagar, r.sobraProjetada),
    linha: linhaDoMes(contas, mes, hoje),
    atencao: atencaoDoMes(abertas),
  }
}

// "Precisa da sua atenção": o que pede uma ação do usuário, do mais urgente para o menos urgente.
// Cada item: { chave, tom: 'erro'|'aviso'|'info', titulo, detalhe, acao: { rotulo, tela } }. Funções puras: quem chama junta os dados.
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`
export function itensDeAtencao({ semRenda = false, atrasadas = { n: 0, valor: 0 }, proximos7 = { n: 0, valor: 0 }, faturasComDiferenca = [], faturasParaConciliar = 0, inboxPendentes = 0, recorrentes = 0, aReceber = [], dividasAtrasadas = 0, sazonal = null }) {
  const itens = []
  const fmtR = (v) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (atrasadas.n > 0) itens.push({ chave: 'vencidas', tom: 'erro', titulo: plural(atrasadas.n, 'conta vencida', 'contas vencidas'), detalhe: fmtR(atrasadas.valor), acao: { rotulo: 'Pagar', tela: 'pagamentos' } })
  if (dividasAtrasadas > 0) itens.push({ chave: 'dividas', tom: 'erro', titulo: plural(dividasAtrasadas, 'dívida atrasada', 'dívidas atrasadas'), detalhe: 'veja o plano de dívidas', acao: { rotulo: 'Abrir', tela: 'dividas' } })
  if (semRenda) itens.push({ chave: 'renda', tom: 'aviso', titulo: 'Renda do mês não cadastrada', detalhe: 'sem ela os números de sobra não fazem sentido', acao: { rotulo: 'Cadastrar', tela: 'renda' } })
  if (faturasComDiferenca.length > 0) {
    const total = faturasComDiferenca.reduce((t, f) => t + Math.abs(f.diferenca), 0)
    itens.push({ chave: 'faturas', tom: 'aviso', titulo: faturasComDiferenca.length === 1 ? `Fatura ${faturasComDiferenca[0].nome} com diferença` : `${faturasComDiferenca.length} faturas com diferença`, detalhe: `${fmtR(total)} a conferir`, acao: { rotulo: 'Conferir', tela: 'faturas' } })
  }
  if (faturasParaConciliar > 0) itens.push({ chave: 'conciliar', tom: 'aviso', titulo: plural(faturasParaConciliar, 'fatura importada para conciliar', 'faturas importadas para conciliar'), detalhe: 'a importação terminou, mas a conferência não', acao: { rotulo: 'Conciliar', tela: 'importar' } })
  if (inboxPendentes > 0) itens.push({ chave: 'inbox', tom: 'aviso', titulo: plural(inboxPendentes, 'compra aguardando confirmação', 'compras aguardando confirmação'), detalhe: 'chegaram pelo Telegram ou pelo celular', acao: { rotulo: 'Revisar', tela: 'inbox' } })
  if (proximos7.n > 0) itens.push({ chave: 'proximos7', tom: 'info', titulo: `${fmtR(proximos7.valor)} vence nos próximos 7 dias`, detalhe: plural(proximos7.n, 'conta', 'contas'), acao: { rotulo: 'Ver contas', tela: 'pagamentos' } })
  if (recorrentes > 0) itens.push({ chave: 'recorrentes', tom: 'info', titulo: plural(recorrentes, 'cobrança recorrente para virar conta fixa', 'cobranças recorrentes para virar conta fixa'), detalhe: 'assinaturas e mensalidades que se repetem no cartão', acao: { rotulo: 'Ver', tela: 'fixos' } })
  for (const r of aReceber) if (r.valor > 0.005) itens.push({ chave: `receber-${r.tela}`, tom: 'info', titulo: `${fmtR(r.valor)} a receber`, detalhe: r.rotulo, acao: { rotulo: 'Abrir', tela: r.tela } })
  if (sazonal) itens.push({ chave: 'sazonal', tom: 'aviso', titulo: `${sazonal.mes} deve ficar no vermelho`, detalhe: `faltam ${fmtR(sazonal.buraco)}`, acao: { rotulo: 'Ver o plano', tela: 'renda' } })
  const ordem = { erro: 0, aviso: 1, info: 2 }
  return itens.map((i, k) => ({ ...i, k })).sort((a, b) => ordem[a.tom] - ordem[b.tom] || a.k - b.k).map(({ k, ...i }) => i) // estável dentro do mesmo tom
}
