// Relatório dos atendimentos (perfil esteticista): por serviço, cliente, mês e produto, num período livre de meses. Valores em reais.
import { addMonths } from './utils.js'
import { mesDe } from './atendimentos.js'
import { valorVenda, lucroVenda, clientesSumidas } from './atendimentosExtra.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const mesesEntre = (de, ate) => { const l = []; for (let m = de; m <= ate && l.length < 120; m = addMonths(m, 1)) l.push(m); return l }
const porHora = (valor, minutos) => (minutos > 0 ? r2((valor * 60) / minutos) : null)

export function relatorioAtendimentos({ atendimentos = [], pacotes = [], vendas = [], clientes = [], de, ate, hoje, metaMensal = 0 }) {
  const pacoteDe = new Map(pacotes.map((p) => [p.id, p]))
  const noPeriodo = (data) => mesDe(data) >= de && mesDe(data) <= ate
  // Sessão de pacote conta pelo valor proporcional do pacote (o valor 0 gravado no atendimento é só para a renda do mês).
  const valorEfetivo = (a) => { const p = a.pacote_id ? pacoteDe.get(a.pacote_id) : null; return p && Number(p.sessoes_total) ? Number(p.valor) / Number(p.sessoes_total) : Number(a.valor) }
  const feitos = atendimentos.filter((a) => a.status === 'realizado' && noPeriodo(a.data))
  const vendasP = vendas.filter((v) => noPeriodo(v.data))
  const nomeCliente = new Map(clientes.map((c) => [c.id, c.nome]))

  const agrupar = (lista, chave, nome) => {
    const m = new Map()
    for (const a of lista) {
      const k = chave(a)
      const g = m.get(k) || { chave: k, nome: nome(a), qtd: 0, receita: 0, material: 0, minutos: 0 }
      g.qtd += 1; g.receita += valorEfetivo(a); g.material += Number(a.custo_material) || 0; g.minutos += Number(a.duracao_min) || 0
      m.set(k, g)
    }
    return [...m.values()].map((g) => ({ ...g, receita: r2(g.receita), material: r2(g.material), sobra: r2(g.receita - g.material), ticket: g.qtd ? r2(g.receita / g.qtd) : 0, porHora: porHora(g.receita, g.minutos) }))
  }
  const receitaAtend = r2(feitos.reduce((t, a) => t + valorEfetivo(a), 0))
  const receitaProd = r2(vendasP.reduce((t, v) => t + valorVenda(v), 0))
  const material = r2(feitos.reduce((t, a) => t + (Number(a.custo_material) || 0), 0))
  const lucroProd = r2(vendasP.reduce((t, v) => t + lucroVenda(v), 0))
  const minutos = feitos.reduce((t, a) => t + (Number(a.duracao_min) || 0), 0)
  const receita = r2(receitaAtend + receitaProd)

  const porServico = agrupar(feitos, (a) => a.servico_id || `n:${a.servico_nome}`, (a) => a.servico_nome).sort((a, b) => b.receita - a.receita)
  porServico.forEach((g) => { g.pct = receitaAtend ? g.receita / receitaAtend : 0 })
  const porCliente = agrupar(feitos, (a) => a.cliente_id, (a) => nomeCliente.get(a.cliente_id) || '—').sort((a, b) => b.receita - a.receita)
  porCliente.forEach((g) => { g.pct = receitaAtend ? g.receita / receitaAtend : 0; g.ultimo = feitos.filter((a) => a.cliente_id === g.chave).map((a) => a.data).sort().pop() })

  const meses = mesesEntre(de, ate).map((mes) => {
    const f = feitos.filter((a) => mesDe(a.data) === mes)
    const v = vendasP.filter((x) => mesDe(x.data) === mes)
    const pac = pacotes.filter((p) => p.ativo !== false && mesDe(p.data_venda) === mes)
    const receitaM = r2(f.reduce((t, a) => t + valorEfetivo(a), 0) + v.reduce((t, x) => t + valorVenda(x), 0))
    const caixa = r2(f.reduce((t, a) => t + Number(a.valor), 0) + pac.reduce((t, p) => t + Number(p.valor), 0) + v.reduce((t, x) => t + valorVenda(x), 0))
    return { mes, atendimentos: f.length, receita: receitaM, caixa, material: r2(f.reduce((t, a) => t + (Number(a.custo_material) || 0), 0)), temDados: f.length > 0 || v.length > 0 || pac.length > 0, abaixoDaMeta: metaMensal > 0 && caixa < metaMensal && (f.length > 0 || v.length > 0 || pac.length > 0) }
  })
  meses.forEach((m, i) => { const ant = meses[i - 1]; m.variacao = ant && ant.caixa > 0 && m.temDados ? (m.caixa - ant.caixa) / ant.caixa : null })

  const prod = new Map()
  for (const v of vendasP) {
    const k = v.produto_id || `n:${v.produto_nome}`
    const g = prod.get(k) || { chave: k, nome: v.produto_nome, qtd: 0, receita: 0, lucro: 0 }
    g.qtd += Number(v.quantidade) || 0; g.receita += valorVenda(v); g.lucro += lucroVenda(v)
    prod.set(k, g)
  }
  const produtos = [...prod.values()].map((g) => ({ ...g, receita: r2(g.receita), lucro: r2(g.lucro) })).sort((a, b) => b.receita - a.receita)

  const sumidas = clientesSumidas({ clientes, atendimentos, hoje })
  return {
    de, ate, meses, porServico, porCliente, produtos, sumidas,
    sumidasPorMes: r2(sumidas.reduce((t, s) => t + s.porMes, 0)),
    total: { receita, receitaAtend, receitaProd, material, lucro: r2(receitaAtend - material + lucroProd), atendimentos: feitos.length, minutos, ticket: feitos.length ? r2(receitaAtend / feitos.length) : 0, porHora: porHora(receitaAtend, minutos), clientes: porCliente.length },
  }
}

const num = (n) => (Number(n) || 0).toFixed(2).replace('.', ',')
const pct = (x) => (x * 100).toFixed(1).replace('.', ',') + '%'
const horas = (min) => (min / 60).toFixed(2).replace('.', ',')
// CSV (ponto e vírgula, abre direto no Excel em português) de cada visão.
export function csvAtendimentos(r, visao) {
  let linhas
  if (visao === 'servico') linhas = [['Serviço', 'Atendimentos', 'Horas', 'Receita', 'Material', 'Sobra', 'Ticket', 'R$/hora', '% da receita'], ...r.porServico.map((g) => [g.nome, g.qtd, horas(g.minutos), num(g.receita), num(g.material), num(g.sobra), num(g.ticket), g.porHora == null ? '' : num(g.porHora), pct(g.pct)])]
  else if (visao === 'cliente') linhas = [['Cliente', 'Atendimentos', 'Receita', 'Ticket', 'Último', '% da receita'], ...r.porCliente.map((g) => [g.nome, g.qtd, num(g.receita), num(g.ticket), g.ultimo || '', pct(g.pct)])]
  else if (visao === 'mes') linhas = [['Mês', 'Atendimentos', 'Receita', 'Caixa (inclui pacotes)', 'Material', 'Variação'], ...r.meses.map((m) => [m.mes, m.atendimentos, num(m.receita), num(m.caixa), num(m.material), m.variacao == null ? '' : pct(m.variacao)])]
  else if (visao === 'produto') linhas = [['Produto', 'Vendidos', 'Receita', 'Lucro'], ...r.produtos.map((g) => [g.nome, g.qtd, num(g.receita), num(g.lucro)])]
  else linhas = [['Cliente', 'Último atendimento', 'Dias sem vir', 'Média por mês'], ...r.sumidas.map((s) => [s.cliente.nome, s.ultimo, s.desde, num(s.porMes)])]
  return linhas.map((l) => l.join(';')).join('\n')
}
