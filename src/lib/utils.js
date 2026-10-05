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

// Mês atual no fuso de Brasília (o mesmo que o bot usa), não no fuso do navegador.
export const nowYM = () => hojeSP().slice(0, 7)

export const addMonths = (ym, n) => {
  let [y, m] = ym.split('-').map(Number)
  m += n
  while (m > 12) { m -= 12; y++ }
  while (m < 1) { m += 12; y-- }
  return y + '-' + String(m).padStart(2, '0')
}

export const calcMesInicio = (dataCompra, cartao) => {
  dataCompra = String(dataCompra).slice(0, 10) // aceita "2026-10-05" e "2026-10-05T12:00:00"
  if (!cartao?.fechamento) return dataCompra.slice(0, 7)
  const d = new Date(dataCompra + 'T12:00:00')
  const dia = d.getDate()
  const fech = parseInt(cartao.fechamento)
  let y = d.getFullYear(), m = d.getMonth() + 1
  if (dia > fech) { m++; if (m > 12) { m = 1; y++ } }
  return y + '-' + String(m).padStart(2, '0')
}

// Valor das parcelas "normais" de uma compra (a última pode diferir em centavos). É o que as telas mostram.
export const valorParcelaBase = (compra) =>
  Math.round((Number(compra.valor_total) / (Number(compra.parcelas) || 1)) * 100) / 100

export const gerarParcelas = (compra, cartoes) => {
  const cartao = cartoes.find(c => c.id === compra.cartao_id)
  const mesInicio = calcMesInicio(compra.data_compra, cartao)
  const total = Number(compra.parcelas) || 1
  // Centavos: as primeiras parcelas arredondam e a última fecha a conta (100 em 3x = 33,33 + 33,33 + 33,34).
  const valorTotal = Number(compra.valor_total)
  const valorParc = valorParcelaBase(compra)
  return Array.from({ length: total }, (_, i) => ({
    mes: addMonths(mesInicio, i),
    valor: i === total - 1 ? Math.round((valorTotal - valorParc * (total - 1)) * 100) / 100 : valorParc,
    num: i + 1,
    total,
  }))
}

export const totalRenda = (r) =>
  RENDA_CAMPOS.reduce((s, [k]) => s + Number(r?.[k] || 0), 0)

// Contas fixas que contam como ativas em um mês (respeita o mês de início e o de término).
export const fixosAtivos = (fixos, mes) =>
  fixos.filter((f) => f.ativo && (!f.mes_inicio || f.mes_inicio <= mes) && (!f.mes_fim || f.mes_fim >= mes))

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
    const cat = garantir(f.categoria) // fixo sem categoria cai em "Sem categoria" (assim as categorias fecham com o total)
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
// Meses passados sem fatura registrada NÃO entram na conta (não há como saber se foram pagos) e vêm
// separados em `semInformacao`, para a tela poder avisar.
export const limiteUsado = (cartaoId, compras, cartoes, faturas, mes) => {
  const faturaDe = (m) => faturas.find((f) => f.cartao_id === cartaoId && f.mes === m)
  let atual = 0
  let futuro = 0
  let semInformacao = 0
  compras.forEach((c) => {
    if (c.cartao_id !== cartaoId) return
    gerarParcelas(c, cartoes).forEach((p) => {
      const fat = faturaDe(p.mes)
      if (p.mes > mes) { if (!fat?.pago) futuro += p.valor }
      else if (p.mes === mes) { if (!fat?.pago) atual += p.valor }
      else if (fat) { if (!fat.pago) atual += p.valor }
      else semInformacao += p.valor
    })
  })
  return { atual, futuro, usado: atual + futuro, semInformacao }
}

// Data de hoje (YYYY-MM-DD) no fuso de Brasília. `new Date().toISOString()` usa UTC e,
// depois das 21h, já devolveria o dia seguinte.
export const hojeSP = (d = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
