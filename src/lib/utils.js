export const PESSOAS = ['Giovanna', 'Sabrina', 'Casa']

export const RENDA_CAMPOS = [
  ['giovanna', 'Salário Giovanna'],
  ['sabrina', 'Salário Sabrina'],
  ['extra_sabrina', 'Extra Sabrina'],
  ['mesada', 'Mesada'],
  ['outros', 'Outros'],
]

const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export const fmt = (v) =>
  'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
