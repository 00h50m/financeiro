import { fmt, mesLabel, calcMesInicio, gerarParcelas } from './utils.js'

// Fatura aberta de cada cartão para o bot do Telegram: o que já caiu na fatura que ainda não fechou
// (parcelas de compras antigas incluídas) e quando ela fecha. Usa as mesmas contas do app (gerarParcelas).

const dobrar = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const diasNoMes = (ym) => new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate()
const diff = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000)

export function faturasAbertas(cartoes, compras, hoje) {
  return cartoes.map((c) => {
    const mes = calcMesInicio(hoje, c)
    const doCartao = compras.filter((x) => x.cartao_id === c.id)
    let total = 0, n = 0
    doCartao.forEach((x) => {
      const p = gerarParcelas(x, cartoes).find((q) => q.mes === mes)
      if (p && p.valor) { total += p.valor; n++ }
    })
    const f = parseInt(c.fechamento) || null
    const fecha = f ? `${mes}-${String(Math.min(f, diasNoMes(mes))).padStart(2, '0')}` : null
    return { cartao: c, mes, total: Math.round(total * 100) / 100, n, fecha, dias: fecha ? diff(hoje, fecha) : null }
  })
}

// termo (opcional): só os cartões cujo nome aparece no que a pessoa escreveu ("fatura do nubank").
export function filtrarCartoes(cartoes, texto) {
  const t = ` ${dobrar(texto).replace(/[^a-z0-9]+/g, ' ')} `
  const achados = cartoes.filter((c) => dobrar(c.nome).split(/[^a-z0-9]+/).filter((w) => w.length >= 3).some((w) => t.includes(` ${w} `)))
  return achados.length ? achados : cartoes
}

export function formatarFaturas(faturas) {
  if (!faturas.length) return 'Não há cartões cadastrados no Finapp.'
  const linhas = ['Faturas abertas:']
  faturas.forEach((f) => {
    const quando = f.fecha
      ? f.dias < 0 ? ', já fechou' : f.dias === 0 ? ', fecha hoje ⚠️' : f.dias <= 3 ? `, fecha em ${f.dias} dia${f.dias > 1 ? 's' : ''} ⚠️` : `, fecha dia ${f.fecha.slice(8)}`
      : ''
    linhas.push(`• ${f.cartao.nome} (${mesLabel(f.mes)}): ${fmt(f.total)} em ${f.n} lançamento${f.n === 1 ? '' : 's'}${quando}`)
  })
  if (faturas.length > 1) linhas.push('', `Total: ${fmt(faturas.reduce((s, f) => s + f.total, 0))}`)
  linhas.push('', 'Conta só a parcela de cada compra que cai nessa fatura.')
  return linhas.join('\n')
}
