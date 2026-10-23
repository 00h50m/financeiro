// Atendimentos, parte 2 (perfil esteticista): pacotes de sessões, venda de produtos, retornos e aniversários. Valores em reais, datas AAAA-MM-DD.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)

// ---------- pacotes ----------

// Sessões do pacote: feitas (realizadas), reservadas (agendadas) e quantas ainda dá para marcar.
export function saldoPacote(pacote, atendimentos) {
  const meus = atendimentos.filter((a) => a.pacote_id === pacote.id)
  const feitas = meus.filter((a) => a.status === 'realizado').length
  const reservadas = meus.filter((a) => a.status === 'agendado').length
  const total = Number(pacote.sessoes_total) || 0
  return { total, feitas, reservadas, restam: Math.max(0, total - feitas - reservadas), faltaFazer: Math.max(0, total - feitas), valorSessao: total ? r2(Number(pacote.valor) / total) : 0 }
}
// ativo | esgotado | vencido (passou da validade com sessões sobrando) | inativo
export function situacaoPacote(pacote, atendimentos, hoje) {
  if (pacote.ativo === false) return 'inativo'
  const s = saldoPacote(pacote, atendimentos)
  if (s.faltaFazer === 0) return 'esgotado'
  if (pacote.validade && pacote.validade < hoje) return 'vencido'
  return 'ativo'
}
// Pacotes da cliente em que ainda dá para marcar sessão.
export const pacotesUsaveis = (pacotes, atendimentos, clienteId, hoje) => pacotes.filter((p) => p.cliente_id === clienteId && situacaoPacote(p, atendimentos, hoje) === 'ativo' && saldoPacote(p, atendimentos).restam > 0)

// ---------- produtos ----------

export const valorVenda = (v) => r2((Number(v.quantidade) || 0) * (Number(v.valor_unit) || 0))
export const lucroVenda = (v) => r2((Number(v.quantidade) || 0) * ((Number(v.valor_unit) || 0) - (Number(v.custo_unit) || 0)))
// Estoque depois de registrar (ou apagar) uma venda. `delta` = +quantidade vendida (tira) ou −quantidade (devolve).
export const novoEstoque = (produto, delta) => (Number(produto.estoque) || 0) - delta

// ---------- retornos e aniversários ----------

// Clientes que deviam voltar: o último atendimento realizado de um serviço com `retorno_dias` + esses dias já chegou (ou chega em `antes` dias),
// sem nenhum atendimento agendado daqui para frente e sem "já chamei" valendo. `limite`: não lista quem passou há mais de tantos dias do retorno.
export function retornosPendentes({ clientes = [], atendimentos = [], servicos = [], hoje, antes = 7, limite = 180 }) {
  const dias = new Map(servicos.filter((s) => s.retorno_dias).map((s) => [s.id, Number(s.retorno_dias)]))
  const lista = []
  for (const c of clientes) {
    if (c.ativo === false || (c.retorno_adiado_ate && c.retorno_adiado_ate >= hoje)) continue
    const meus = atendimentos.filter((a) => a.cliente_id === c.id)
    if (meus.some((a) => a.status === 'agendado' && a.data >= hoje)) continue
    const feitos = meus.filter((a) => a.status === 'realizado').sort((a, b) => b.data.localeCompare(a.data))
    const ultimo = feitos[0]
    if (!ultimo || !dias.has(ultimo.servico_id)) continue
    const due = somarDias(ultimo.data, dias.get(ultimo.servico_id))
    const d = diasEntre(hoje, due)
    if (d > antes || d < -limite) continue
    lista.push({ cliente: c, ultimo, servico_nome: ultimo.servico_nome, due, dias: d })
  }
  return lista.sort((a, b) => a.due.localeCompare(b.due))
}

// Clientes ativas que não vêm há `dias` dias (e sem nada agendado), com quanto elas deixam por mês em média.
export function clientesSumidas({ clientes = [], atendimentos = [], hoje, dias = 60 }) {
  const out = []
  for (const c of clientes) {
    if (c.ativo === false) continue
    const meus = atendimentos.filter((a) => a.cliente_id === c.id)
    if (meus.some((a) => a.status === 'agendado' && a.data >= hoje)) continue
    const feitos = meus.filter((a) => a.status === 'realizado').sort((a, b) => b.data.localeCompare(a.data))
    if (!feitos.length) continue
    const desde = diasEntre(feitos[0].data, hoje)
    if (desde < dias) continue
    const primeira = feitos[feitos.length - 1].data
    const meses = Math.max(1, diasEntre(primeira, feitos[0].data) / 30.4 + 1)
    out.push({ cliente: c, ultimo: feitos[0].data, desde, total: feitos.length, porMes: r2(feitos.reduce((t, a) => t + Number(a.valor), 0) / meses) })
  }
  return out.sort((a, b) => b.porMes - a.porMes)
}

// Aniversários nos próximos `dias` dias (hoje inclusive). -> [{ cliente, data (próxima), dias, idade }]
export function aniversariantes(clientes = [], hoje, dias = 14) {
  const lista = []
  for (const c of clientes) {
    if (c.ativo === false || !c.nascimento) continue
    const [ano, mes, dia] = c.nascimento.split('-').map(Number)
    for (const a of [Number(hoje.slice(0, 4)), Number(hoje.slice(0, 4)) + 1]) {
      const alvo = `${a}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
      const d = diasEntre(hoje, alvo)
      if (d >= 0 && d <= dias) { lista.push({ cliente: c, data: alvo, dias: d, idade: a - ano }); break }
    }
  }
  return lista.sort((a, b) => a.dias - b.dias)
}

// ---------- mensagens para WhatsApp ----------

const primeiroNome = (c) => String(c.nome).trim().split(/\s+/)[0]
export const mensagemRetorno = (r) => `Oi, ${primeiroNome(r.cliente)}! Tudo bem? Já faz um tempinho do seu último ${String(r.servico_nome || 'atendimento').toLowerCase()}. Vamos agendar o próximo? 💆‍♀️`
export const mensagemAniversario = (a) => `Parabéns, ${primeiroNome(a.cliente)}! 🎉 Muita saúde e felicidade! Um beijo!`
