// Atendimentos (perfil esteticista): agenda de clientes, valores e o que entra na renda do mês. Valores em reais, datas AAAA-MM-DD.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const STATUS = { agendado: 'Agendado', realizado: 'Realizado', cancelado: 'Cancelado', faltou: 'Faltou' }
export const FORMAS = ['Pix', 'Dinheiro', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Outro']

export const mesDe = (data) => String(data).slice(0, 7)
export const atendimentosDoMes = (lista, mes, clienteId = null) => lista.filter((a) => mesDe(a.data) === mes && (!clienteId || a.cliente_id === clienteId))
// Ordem da agenda: dia, horário (sem horário por último), depois criação.
export const porData = (a, b) => a.data.localeCompare(b.data) || (a.horario || '99:99').localeCompare(b.horario || '99:99')

// Conta no que a cliente deve/entra: realizado vale; agendado é previsão; cancelado e faltou não contam.
export const contaNaReceita = (a) => a.status === 'realizado' || a.status === 'agendado'
export const aReceber = (a) => a.status === 'realizado' && !a.pago
export const lucro = (a) => r2(Number(a.valor) - Number(a.custo_material || 0))

export function resumoMes(lista) {
  const por = (s) => lista.filter((a) => a.status === s)
  const realizados = por('realizado'), agendados = por('agendado')
  const soma = (l, f) => r2(l.reduce((t, a) => t + f(a), 0))
  return {
    agendados: agendados.length, realizados: realizados.length, cancelados: por('cancelado').length, faltas: por('faltou').length,
    faturado: soma(realizados, (a) => Number(a.valor)), previsto: soma(agendados, (a) => Number(a.valor)),
    recebido: soma(realizados.filter((a) => a.pago), (a) => Number(a.valor)), aReceber: soma(realizados.filter((a) => !a.pago), (a) => Number(a.valor)),
    material: soma(realizados, (a) => Number(a.custo_material || 0)), lucro: soma(realizados, lucro),
    minutos: realizados.reduce((t, a) => t + Number(a.duracao_min || 0), 0),
  }
}

// Mesmo formato de aulasPorMes (reais): { 'AAAA-MM': { valor, recebido, aReceber, projetada, porAluno: [] } }.
// valor = realizados + agendados do mês + pacotes vendidos no mês + produtos vendidos no mês; é o que a Renda soma como entrada do mês.
// Sessão de pacote tem valor 0 (a receita é a venda do pacote).
export function atendimentosPorMes(lista = [], { pacotes = [], vendas = [] } = {}) {
  const itens = [
    ...lista.filter(contaNaReceita).map((a) => ({ mes: mesDe(a.data), valor: Number(a.valor) || 0, recebido: a.status === 'realizado' && a.pago, receber: aReceber(a) })),
    ...pacotes.filter((p) => p.ativo !== false).map((p) => ({ mes: mesDe(p.data_venda), valor: Number(p.valor) || 0, recebido: !!p.pago, receber: !p.pago })),
    ...vendas.map((v) => ({ mes: mesDe(v.data), valor: r2((Number(v.quantidade) || 0) * (Number(v.valor_unit) || 0)), recebido: !!v.pago, receber: !v.pago })),
  ]
  const meses = [...new Set(itens.map((i) => i.mes))]
  return Object.fromEntries(meses.map((mes) => {
    const doMes = itens.filter((i) => i.mes === mes)
    const soma = (f) => r2(doMes.filter(f).reduce((t, i) => t + i.valor, 0))
    return [mes, { valor: soma(() => true), recebido: soma((i) => i.recebido), aReceber: soma((i) => i.receber), projetada: false, porAluno: [] }]
  }))
}

// Junta duas entradas por mês (aulas e atendimentos) somando os valores.
export function somarPorMes(a = {}, b = {}) {
  const meses = new Set([...Object.keys(a), ...Object.keys(b)])
  return Object.fromEntries([...meses].map((m) => {
    const x = a[m], y = b[m]
    if (!x || !y) return [m, x || y]
    return [m, { ...x, valor: r2(x.valor + y.valor), recebido: r2((x.recebido || 0) + (y.recebido || 0)), aReceber: r2((x.aReceber || 0) + (y.aReceber || 0)), projetada: !!(x.projetada && y.projetada), porAluno: [...(x.porAluno || []), ...(y.porAluno || [])] }]
  }))
}

// ---------- mudanças de estado (devolvem o patch a gravar) ----------

export const patchRealizar = (a, { pago = false, forma = null, hoje }) => ({ status: 'realizado', pago, forma_pagamento: pago ? forma || a.forma_pagamento || null : null, data_pagamento: pago ? hoje : null })
export const patchReceber = (a, { forma = null, hoje }) => ({ pago: true, forma_pagamento: forma || a.forma_pagamento || null, data_pagamento: hoje })
export const patchDesfazer = () => ({ status: 'agendado', pago: false, forma_pagamento: null, data_pagamento: null })
export const patchEncerrar = (status) => ({ status, pago: false, forma_pagamento: null, data_pagamento: null }) // cancelado | faltou

// Novo atendimento a partir de um serviço (o preço, a duração e o material do serviço viram o ponto de partida; dá para editar).
export function novoAtendimento({ cliente, servico, data, horario = null, valor, duracao_min, custo_material, observacao = null }) {
  return {
    cliente_id: cliente.id, servico_id: servico?.id || null, servico_nome: servico?.nome || 'Atendimento', data, horario: horario || null,
    duracao_min: Number(duracao_min ?? servico?.duracao_min ?? 60), valor: r2(valor ?? servico?.preco ?? 0), custo_material: r2(custo_material ?? servico?.custo_material ?? 0),
    status: 'agendado', pago: false, forma_pagamento: null, data_pagamento: null, observacao,
  }
}

// Outro atendimento no mesmo dia com horário que se sobrepõe? (só confere quando os dois têm horário)
const emMin = (h) => { const m = /^(\d{1,2}):(\d{2})$/.exec(h || ''); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
export function conflitoDeHorario(lista, novo, ignorarId = null) {
  const i = emMin(novo.horario)
  if (i == null) return null
  const fim = i + Number(novo.duracao_min || 60)
  return lista.find((a) => a.id !== ignorarId && a.data === novo.data && (a.status === 'agendado' || a.status === 'realizado') && emMin(a.horario) != null && i < emMin(a.horario) + Number(a.duracao_min || 60) && emMin(a.horario) < fim) || null
}

// Clientes: busca por nome/telefone e quantos atendimentos/último atendimento (para a lista).
export function resumoClientes(clientes, atendimentos) {
  return clientes.map((c) => {
    const meus = atendimentos.filter((a) => a.cliente_id === c.id)
    const feitos = meus.filter((a) => a.status === 'realizado')
    return { cliente: c, total: feitos.length, gasto: r2(feitos.reduce((t, a) => t + Number(a.valor), 0)), ultimo: feitos.map((a) => a.data).sort().pop() || null, proximo: meus.filter((a) => a.status === 'agendado').map((a) => a.data).sort()[0] || null, aReceber: r2(meus.filter(aReceber).reduce((t, a) => t + Number(a.valor), 0)) }
  })
}
