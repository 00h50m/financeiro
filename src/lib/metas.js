// METAS: saldo, progresso, previsão e sugestão (transparente) de destino da sobra.
// Funções puras. O app NÃO movimenta dinheiro: só registra o que a pessoa diz que guardou ou usou.

const arred = (v) => Math.round((Number(v) || 0) * 100) / 100 + 0 // + 0 troca -0 por 0

// Valor com sinal gravado no movimento: aporte soma, retirada subtrai, ajuste já vem com sinal.
export const valorComSinal = (tipo, valor) => {
  const v = Number(valor) || 0
  if (tipo === 'aporte') return Math.abs(v)
  if (tipo === 'retirada') return -Math.abs(v)
  return v
}

export const movimentosDaMeta = (movimentos, metaId) =>
  (movimentos || []).filter((m) => m.meta_id === metaId)

export const saldoMeta = (movimentos, metaId) =>
  arred(movimentosDaMeta(movimentos, metaId).reduce((s, m) => s + (Number(m.valor) || 0), 0))

// Quanto vale ajustar para o saldo ficar em `novoSaldo`.
export const deltaParaSaldo = (saldoAtual, novoSaldo) => arred(Number(novoSaldo) - Number(saldoAtual))

// Mesmo mês de calendário: meses inteiros entre duas competências AAAA-MM (b depois de a).
const mesesEntre = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5, 7)) - Number(a.slice(5, 7)))

// Alvo em reais. Reserva: meta_meses × custo mensal (informado por quem chama). Objetivo: valor_alvo.
export function alvoDaMeta(meta, { custoFixos = 0, custoTotal = 0 } = {}) {
  if (meta.tipo === 'reserva') {
    const custo = meta.base_custo === 'fixos' ? custoFixos : custoTotal
    return arred((Number(meta.meta_meses) || 0) * custo)
  }
  return arred(meta.valor_alvo)
}

// Situação de uma meta: saldo, alvo, falta, % e, se houver prazo, quanto guardar por mês.
export function situacaoDaMeta(meta, movimentos, custos, hoje) {
  const saldo = saldoMeta(movimentos, meta.id)
  const alvo = alvoDaMeta(meta, custos)
  const falta = Math.max(0, arred(alvo - saldo))
  const pct = alvo > 0 ? Math.min(100, Math.floor((saldo / alvo) * 100)) : 0
  let porMesNecessario = null
  let mesesAtePrazo = null
  if (meta.prazo && falta > 0) {
    mesesAtePrazo = mesesEntre(hoje.slice(0, 7), String(meta.prazo).slice(0, 7))
    porMesNecessario = mesesAtePrazo > 0 ? arred(falta / mesesAtePrazo) : falta // prazo no mês atual ou vencido: tudo agora
  }
  return { saldo, alvo, falta, pct, atingida: alvo > 0 && saldo >= alvo, porMesNecessario, mesesAtePrazo, prazoVencido: !!meta.prazo && mesesAtePrazo !== null && mesesAtePrazo < 0 }
}

// Em quantos meses a meta chega ao alvo guardando `porMes` (null se não dá).
export function mesesParaAlvo(falta, porMes) {
  if (!(falta > 0)) return 0
  if (!(porMes > 0)) return null
  return Math.ceil(falta / porMes)
}

// Sugestão de destino da sobra, com a regra à vista:
//  1. só considera sobra positiva, e só o percentual escolhido (padrão 100%);
//  2. percorre as metas ativas por prioridade (1 = primeiro);
//  3. cada meta recebe no máximo o que falta, e, se tem prazo, no máximo o aporte mensal necessário;
//  4. o que sobra fica livre.
// Devolve { destinado, livre, linhas: [{ meta_id, nome, valor, motivo }] }.
export function sugerirDestinoSobra(sobra, metas, movimentos, custos, hoje, { percentual = 100 } = {}) {
  const disponivel = Math.max(0, arred(sobra)) * (Math.min(100, Math.max(0, Number(percentual) || 0)) / 100)
  let resto = arred(disponivel)
  const linhas = []
  const ordenadas = (metas || []).filter((m) => m.ativa !== false).sort((a, b) => (a.prioridade || 99) - (b.prioridade || 99))
  for (const m of ordenadas) {
    if (resto <= 0) break
    const s = situacaoDaMeta(m, movimentos, custos, hoje)
    if (s.falta <= 0) continue
    const teto = s.porMesNecessario != null ? s.porMesNecessario : s.falta
    const valor = arred(Math.min(resto, teto, s.falta))
    if (valor <= 0) continue
    linhas.push({
      meta_id: m.id, nome: m.nome, valor,
      motivo: s.porMesNecessario != null ? `prioridade ${m.prioridade || 1}; ritmo para chegar no prazo` : `prioridade ${m.prioridade || 1}; ainda faltam R$ ${s.falta.toFixed(2).replace('.', ',')}`,
    })
    resto = arred(resto - valor)
  }
  const destinado = arred(linhas.reduce((t, l) => t + l.valor, 0))
  return { destinado, livre: arred(Math.max(0, sobra) - destinado), linhas }
}

