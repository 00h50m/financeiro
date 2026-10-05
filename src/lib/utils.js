// Compra tem `descricao` (nome como aparece no cartão) e `identificacao` (o que é, escrito pela usuária).
export const tituloCompra = (c) => c.identificacao || c.descricao
export const subtituloCompra = (c) => (c.identificacao ? c.descricao : '')

export const CORES_PESSOA = ['purple', 'blue', 'green', 'amber', 'red', 'gray']

export const proximaCorPessoa = (pessoas) => CORES_PESSOA[pessoas.length % CORES_PESSOA.length]

export const corPessoa = (pessoas, nome) => pessoas.find((p) => p.nome === nome)?.cor || 'gray'

const CSS_VAR_COR = { purple: 'var(--purple)', blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', gray: 'var(--text3)' }
export const corPessoaCss = (pessoas, nome) => CSS_VAR_COR[corPessoa(pessoas, nome)] || CSS_VAR_COR.gray

export const RENDA_CAMPOS = [
  ['giovanna', 'Salário Giovanna'],
  ['sabrina', 'Salário Sabrina'],
  ['extra_sabrina', 'Extra Sabrina'],
  ['mesada', 'Mesada'],
  ['outros', 'Outros'],
]

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export const fmt = (v) => {
  const n = Number(v || 0)
  const valor = Math.abs(n) < 0.005 ? 0 : n // evita "R$ -0,00" (sobra de arredondamento)
  return 'R$ ' + valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export const fmtK = (v) => {
  const n = Number(v || 0)
  return (n < 0 ? '-R$ ' : 'R$ ') + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export const mesLabel = (ym) => {
  if (!ym) return ''
  const [y, m] = ym.split('-')
  return MESES[parseInt(m) - 1] + '/' + y.slice(2)
}

export const nowYM = () => {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
}

export const addMonths = (ym, n) => {
  let [y, m] = ym.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return y + '-' + String(m).padStart(2, '0')
}

export const calcMesInicio = (dataCompra, cartao) => {
  if (!cartao?.fechamento) return dataCompra.slice(0, 7)
  const d = new Date(dataCompra + 'T12:00:00')
  const dia = d.getDate()
  const fech = parseInt(cartao.fechamento)
  let y = d.getFullYear(), m = d.getMonth() + 1
  if (dia > fech) { m++; if (m > 12) { m = 1; y++ } }
  return y + '-' + String(m).padStart(2, '0')
}

export const gerarParcelas = (compra, cartoes) => {
  const cartao = cartoes.find(c => c.id === compra.cartao_id)
  const mesInicio = calcMesInicio(compra.data_compra, cartao)
  const total = Number(compra.parcelas) || 1
  const valorParc = Number(compra.valor_total) / total
  return Array.from({ length: total }, (_, i) => ({
    mes: addMonths(mesInicio, i),
    valor: valorParc,
    num: i + 1,
    total,
  }))
}

export const totalRenda = (r) =>
  RENDA_CAMPOS.reduce((s, [k]) => s + Number(r?.[k] || 0), 0)

// Contas fixas que contam como ativas em um mês (respeita o mês de término).
export const fixosAtivos = (fixos, mes) => fixos.filter((f) => f.ativo && (!f.mes_fim || f.mes_fim >= mes))

// Gastos do mês agrupados por categoria: parcela do mês de cada compra + contas fixas categorizadas.
// Retorna { [categoria]: { total, itens: [{ nome, sub, valor, origem, detalhe }] } }.
export const gastosPorCategoria = (compras, cartoes, fixos, mes) => {
  const mapa = {}
  const garantir = (categoriaBruta) => {
    const categoria = categoriaBruta || 'Sem categoria'
    if (!mapa[categoria]) mapa[categoria] = { total: 0, itens: [] }
    return mapa[categoria]
  }
  compras.forEach((c) => {
    const p = gerarParcelas(c, cartoes).find((x) => x.mes === mes)
    if (!p || !p.valor) return
    const cat = garantir(c.categoria)
    cat.total += p.valor
    cat.itens.push({
      nome: tituloCompra(c),
      sub: c.subcategoria,
      valor: p.valor,
      origem: cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão',
      detalhe: p.total > 1 ? `parcela ${p.num}/${p.total}` : 'à vista',
    })
  })
  fixosAtivos(fixos, mes).forEach((f) => {
    if (!f.categoria) return
    const cat = garantir(f.categoria)
    cat.total += Number(f.valor)
    cat.itens.push({ nome: f.nome, sub: f.subcategoria, valor: Number(f.valor), origem: 'Conta fixa', detalhe: f.dia_vencimento ? `vence dia ${f.dia_vencimento}` : '' })
  })
  return mapa
}

// Situação de uma categoria frente ao teto: 'sem' | 'ok' | 'perto' | 'estourou'.
export const statusTeto = (gasto, teto) => {
  if (!teto) return 'sem'
  const pct = gasto / teto
  return pct > 1 ? 'estourou' : pct >= 0.8 ? 'perto' : 'ok'
}

// Quanto do limite de um cartão está ocupado em `mes`: parcelas do mês atual e dos meses seguintes
// com fatura ainda não paga, mais faturas de meses anteriores registradas e não pagas.
// Meses passados sem fatura registrada são tratados como já pagos (não há como saber).
export const limiteUsado = (cartaoId, compras, cartoes, faturas, mes) => {
  const faturaDe = (m) => faturas.find((f) => f.cartao_id === cartaoId && f.mes === m)
  let atual = 0
  let futuro = 0
  compras.forEach((c) => {
    if (c.cartao_id !== cartaoId) return
    gerarParcelas(c, cartoes).forEach((p) => {
      const fat = faturaDe(p.mes)
      if (p.mes > mes) { if (!fat?.pago) futuro += p.valor }
      else if (p.mes === mes) { if (!fat?.pago) atual += p.valor }
      else if (fat && !fat.pago) atual += p.valor
    })
  })
  return { atual, futuro, usado: atual + futuro }
}

// ---------- PAGAMENTOS: visão detalhada do mês (fonte única para a aba Pagamentos e para a sobra) ----------
// `d` = { fixos, fixosPagamentos, cartoes, compras, faturas }.
export const detalhePagamentos = (d, mes) => {
  const { fixos, fixosPagamentos, cartoes, compras, faturas } = d

  // Contas fixas ativas (respeitando mes_fim), por dia de vencimento.
  const fixosLista = fixosAtivos(fixos, mes).sort((a, b) => (a.dia_vencimento || 99) - (b.dia_vencimento || 99))
  const fixoPagamento = (fixoId) => fixosPagamentos.find((p) => p.fixo_id === fixoId && p.mes === mes)

  // Faturas dos cartões: valor real informado, ou o que foi lançado.
  const cartaoIdsComMovimento = new Set()
  compras.forEach((c) => {
    if (c.cartao_id && gerarParcelas(c, cartoes).some((p) => p.mes === mes)) cartaoIdsComMovimento.add(c.cartao_id)
  })
  faturas.forEach((f) => { if (f.mes === mes) cartaoIdsComMovimento.add(f.cartao_id) })

  const linhasCartao = [...cartaoIdsComMovimento]
    .filter((cartao_id) => cartao_id)
    .map((cartao_id) => {
      const cartao = cartoes.find((c) => c.id === cartao_id)
      const lancado = compras
        .flatMap((c) => (c.cartao_id === cartao_id ? gerarParcelas(c, cartoes).filter((p) => p.mes === mes) : []))
        .reduce((s, p) => s + p.valor, 0)
      const fatura = faturas.find((f) => f.cartao_id === cartao_id && f.mes === mes)
      return {
        cartao_id,
        nome: cartao?.nome || '—',
        valor: fatura ? Number(fatura.valor_real) : lancado,
        temFatura: !!fatura,
        pago: fatura?.pago || false,
        dataPagamento: fatura?.data_pagamento,
      }
    })
    .sort((a, b) => a.nome.localeCompare(b.nome))

  // Outras contas (sem cartão — dinheiro/Pix/boleto avulso).
  const outrasContas = compras
    .filter((c) => !c.cartao_id)
    .map((c) => ({ c, parcela: gerarParcelas(c, cartoes).find((p) => p.mes === mes) }))
    .filter(({ parcela }) => !!parcela)
    .map(({ c, parcela }) => ({ ...c, valorParcela: parcela.valor, parcelaNum: parcela.num, parcelaTotal: parcela.total }))
    .sort((a, b) => (a.data_compra < b.data_compra ? 1 : -1))

  const totalFixos = fixosLista.reduce((s, f) => s + Number(f.valor), 0)
  const totalFixosPagos = fixosLista.reduce((s, f) => s + (fixoPagamento(f.id)?.pago ? Number(f.valor) : 0), 0)
  const totalCartoes = linhasCartao.reduce((s, l) => s + l.valor, 0)
  const totalCartoesPagos = linhasCartao.reduce((s, l) => s + (l.pago ? l.valor : 0), 0)
  const totalOutras = outrasContas.reduce((s, c) => s + c.valorParcela, 0)
  const totalOutrasPagas = outrasContas.reduce((s, c) => s + (c.pago ? c.valorParcela : 0), 0)

  const comprometido = totalFixos + totalCartoes + totalOutras
  const pago = totalFixosPagos + totalCartoesPagos + totalOutrasPagas
  return {
    fixosLista, fixoPagamento, linhasCartao, outrasContas,
    totalFixos, totalFixosPagos, totalCartoes, totalCartoesPagos, totalOutras, totalOutrasPagas,
    comprometido, pago, totalDividas: comprometido - pago,
  }
}

// Sobra que vem do mês anterior: o que ficaria depois de pagar tudo dele
// (renda + sobra que ele mesmo recebeu + ajuste − comprometido). Só existe quando o mês
// anterior tem renda cadastrada — assim meses sem renda não geram "sobra negativa" falsa.
// `d` também precisa de { rendas, saldoAjustes }.
export const sobraAnterior = (d, mes) => {
  const ant = addMonths(mes, -1)
  const rendaAnt = totalRenda(d.rendas.find((r) => r.mes === ant))
  if (!(rendaAnt > 0)) return 0
  const ajuste = Number(d.saldoAjustes.find((a) => a.mes === ant)?.ajuste) || 0
  return rendaAnt + sobraAnterior(d, ant) + ajuste - detalhePagamentos(d, ant).comprometido
}

// Data de hoje (YYYY-MM-DD) no fuso de Brasília. `new Date().toISOString()` usa UTC e,
// depois das 21h, já devolveria o dia seguinte.
export const hojeSP = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
