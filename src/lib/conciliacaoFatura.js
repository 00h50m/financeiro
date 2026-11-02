// Conciliação da fatura: classifica cada linha do arquivo, resolve as decisões da pessoa e calcula o painel de conciliação.
// Tudo puro. Parte do princípio de que NADA é vinculado só por semelhança: só o que é exato (e um-para-um) é "já registrado" sozinho;
// o resto pede revisão. Importar e conciliar são coisas diferentes: o status de conciliação só chega a "conciliada" quando todas as
// linhas estão resolvidas e os valores fecham — nunca só porque a importação terminou nem porque dois totais deram o mesmo número.
import { conferirFatura, problemasDaLinha, valorParcelaLinha } from './importacao.js'
import { normalizarData } from './csvFormato.js'
import { normBasico } from './normalizacao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const TOLERANCIA_CONCILIACAO = 0.1

// ---------- natureza da linha ----------
// compra | credito (estorno/crédito: valor negativo) | encargo (juros, IOF, multa, anuidade, tarifa) | pagamento (pagamento da fatura anterior: não é parte do total)
const PAGAMENTO = /(pagamento\s+(recebido|efetuado|de\s+fatura|fatura|on-?line)|pgto\s+(fatura|recebido)|saldo\s+(anterior|restante|da\s+fatura\s+anterior)|obrigad[oa]\s+pelo\s+pagamento)/i
const ENCARGO = /\b(iof|juros|multa|encargos?|anuidade|tarifa|mora)\b/i

export function naturezaDaLinha(l) {
  const texto = `${l.descricaoOriginal || ''} ${l.descricao || ''}`
  const v = Number(l.valor)
  if (PAGAMENTO.test(texto)) return 'pagamento'
  if (ENCARGO.test(texto) && v > 0) return 'encargo'
  if (v < 0) return 'credito'
  return 'compra'
}

// ---------- decisões da pessoa ----------
//   mesma     é a compra já lançada: vincula, não cria outra
//   outra     é outra compra: vira um lançamento novo
//   depois    revisar depois: continua pendente e não impede o resto
//   manter    (valor diferente) é a mesma compra e o valor lançado fica como está
//   atualizar (valor diferente) é a mesma compra e o valor lançado passa a ser o da fatura
//   mover     (outra fatura) coloca a compra já lançada nesta fatura
// Devolve o patch para a linha (mesmo formato que a tela já usa). Sem decisão = volta ao que o app sugeriu.
export function decisaoPatch(decisao) {
  switch (decisao) {
    case 'mesma': case 'manter': case 'atualizar': case 'mover': case 'depois': return { decisao, incluir: false, incluirManual: true }
    case 'outra': return { decisao, incluir: true, incluirManual: true }
    default: return { decisao: undefined, incluirManual: false }
  }
}

// ---------- classificação de uma linha ----------
// grupos: registrada | nova | revisao | ignorada
// motivos (revisão): correspondencia_provavel | valor_diferente | parcelamento_ambiguo | parcelamento_sem_registro | outra_fatura | dados_incompletos
export function classificarLinha(l, { foraDoMesIds = new Set(), contaFixaIds = new Set(), categorias = [], mesFatura = '' } = {}) {
  const natureza = naturezaDaLinha(l)
  const base = { natureza, motivos: [], confirmada: false, adiada: false, bloqueios: [] }
  if (natureza === 'pagamento') return { ...base, grupo: 'ignorada', acao: 'ignorar', selecionada: false }

  const corr = l.correspondencia
  const dec = l.decisao
  const revisao = (motivos, acao) => ({ ...base, grupo: 'revisao', motivos, acao, selecionada: false, adiada: dec === 'depois' })
  const registrada = (confirmada) => ({ ...base, grupo: 'registrada', acao: 'nada', selecionada: false, confirmada })

  if (contaFixaIds.has(l._id)) return registrada(false) // já existe como conta fixa no cartão

  // lançada, mas numa fatura que não é esta (outro mês ou cartão): mesmo sendo exata, o total desta fatura não a contém
  if (foraDoMesIds.has(l._id)) {
    if (dec === 'mesma') return registrada(true)
    if (dec === 'mover') return { ...registrada(true), moverParaEstaFatura: true }
    return revisao(['outra_fatura'], 'mover_fatura')
  }

  const tipo = corr?.tipo
  if (tipo === 'exata') return registrada(false)
  if (tipo === 'parcelamento') return registrada(false)

  if (tipo === 'parecida') {
    if (dec === 'mesma') return registrada(true)
    if (dec === 'depois') return revisao(['correspondencia_provavel'], 'comparar')
    const motivos = ['correspondencia_provavel', ...((corr.avisos || []).includes('parcela_diferente') ? ['parcelamento_ambiguo'] : [])]
    return revisao(motivos, 'comparar')
  }
  if (tipo === 'valor_diferente') {
    if (dec === 'manter' || dec === 'atualizar' || dec === 'mesma') return { ...registrada(true), divergenciaValor: true }
    return revisao(['valor_diferente'], 'comparar_valor')
  }
  // sem correspondência: compra nova — se os dados estão completos e (parcela em andamento) o parcelamento foi confirmado
  const problemas = problemasDaLinha(l, categorias, mesFatura, { normalizarData })
  const emAndamento = (Number(l.parcela_atual) || 1) > 1
  if (emAndamento && !l.parcelamentoConfirmado) return revisao(['parcelamento_sem_registro', ...(problemas.length ? ['dados_incompletos'] : [])], 'confirmar_parcelamento')
  if (problemas.length && l.incluir !== false) return { ...revisao(['dados_incompletos'], 'completar'), bloqueios: problemas }
  const selecionada = l.incluir !== false && problemas.length === 0
  return { ...base, grupo: 'nova', acao: selecionada ? 'importar' : 'deixada_de_fora', selecionada, bloqueios: problemas, repetidaNoArquivo: !!l.duplicataCsv }
}

// ---------- análise da fatura de um cartão ----------
// `linhas`: linhas do arquivo JÁ analisadas (com `correspondencia`, como a tela faz). -> { linhas, grupos, contadores, painel, status }
export function analisarFatura({ linhas, compras, cartoes, fixos = [], cartaoId, mes, aliases = [], modo = 'parcela', categorias = [], totalBanco = null }) {
  const conf = conferirFatura({ linhas, compras, cartoes, fixos, cartaoId, mes, aliases }, modo)
  const ctx = {
    foraDoMesIds: new Set(conf.foraDoMes.map((x) => x.linha._id)),
    contaFixaIds: new Set(conf.contaFixa.map((x) => x.linha._id)),
    categorias, mesFatura: mes,
  }
  const doCartao = linhas.filter((l) => l.cartao_id === cartaoId && l.valor !== '' && !Number.isNaN(Number(l.valor)))
  // linhas idênticas dentro do próprio arquivo (duas compras iguais no mesmo dia): não bloqueia, só avisa
  const chaveDe = (l) => `${String(l.data).slice(0, 10)}|${normBasico(l.descricao)}|${Number(l.valor)}`
  const vezes = new Map()
  doCartao.forEach((l) => vezes.set(chaveDe(l), (vezes.get(chaveDe(l)) || 0) + 1))
  const classificadas = doCartao.map((l) => ({ ...l, duplicataCsv: vezes.get(chaveDe(l)) > 1, ...classificarLinha({ ...l, duplicataCsv: vezes.get(chaveDe(l)) > 1 }, ctx) }))
  const por = (g) => classificadas.filter((l) => l.grupo === g)
  const registradas = por('registrada'), novas = por('nova'), revisao = por('revisao'), ignoradas = por('ignorada')
  const selecionadas = novas.filter((l) => l.selecionada)
  const deixadasDeFora = novas.filter((l) => !l.selecionada)
  const divergenciasApp = conf.sobrandoNoFinapp
  const bloqueadas = revisao.filter((l) => l.bloqueios.length)

  const v = (l) => valorParcelaLinha(l, modo)
  const somar = (ls, f = v) => r2(ls.reduce((t, l) => t + f(l), 0))
  const doTotal = classificadas.filter((l) => l.natureza !== 'pagamento')
  const naturezas = Object.fromEntries(['compra', 'credito', 'encargo', 'pagamento'].map((n) => [n, { qtd: classificadas.filter((l) => l.natureza === n).length, valor: somar(classificadas.filter((l) => l.natureza === n)) }]))
  const atualizacoes = registradas.filter((l) => l.decisao === 'atualizar' && l.correspondencia?.tipo === 'valor_diferente')
  const ajusteAtualizar = somar(atualizacoes, (l) => v(l) - (Number(l.correspondencia.compra.parcelas) > 1 ? Number(l.correspondencia.compra.valor_total) / Number(l.correspondencia.compra.parcelas) : Number(l.correspondencia.compra.valor_total)))
  const movidas = registradas.filter((l) => l.moverParaEstaFatura) // compras já lançadas que passam a contar nesta fatura
  const ajusteMover = somar(movidas)
  const totalExtraido = somar(doTotal)
  const totalApp = r2(conf.totalFinapp)
  const novasSelecionadas = somar(selecionadas)
  const projetado = r2(totalApp + novasSelecionadas + ajusteAtualizar + ajusteMover)
  const baseComparacao = totalBanco != null ? Number(totalBanco) : totalExtraido
  const diferenca = r2(projetado - baseComparacao)

  // pendências: o que ainda precisa de uma decisão ou de uma investigação (revisar depois continua pendente)
  const pendencias = revisao.length + divergenciasApp.length + deixadasDeFora.length
  const completo = pendencias === 0
  const resolvidas = registradas.length + selecionadas.length
  const fecha = Math.abs(diferenca) <= TOLERANCIA_CONCILIACAO
  const statusDe = (semNovas) => (completo && semNovas && resolvidas > 0 && fecha ? 'conciliada' : resolvidas > 0 ? 'parcial' : 'pendente')

  return {
    cartaoId, mes, linhas: classificadas,
    grupos: { registradas, novas, revisao, ignoradas, divergenciasApp },
    contadores: {
      identificadas: classificadas.length, registradas: registradas.length, novas: novas.length, selecionadas: selecionadas.length,
      revisao: revisao.length, adiadas: revisao.filter((l) => l.adiada).length, bloqueadas: bloqueadas.length, ignoradas: ignoradas.length,
      divergenciasApp: divergenciasApp.length, deixadasDeFora: deixadasDeFora.length, pendencias,
    },
    painel: {
      totalBanco: totalBanco != null ? Number(totalBanco) : null, totalExtraido, totalApp, novasSelecionadas, ajusteAtualizar, ajusteMover, projetado,
      diferenca, baseDiferenca: totalBanco != null ? 'banco' : 'arquivo', semTotalBanco: totalBanco == null,
      naturezas, valores: { confirmado: totalApp, estimado: r2(novasSelecionadas + ajusteAtualizar + ajusteMover), projetado },
    },
    // statusProjetado: como ficaria DEPOIS de importar as novas selecionadas; statusAtual: como está agora, sem importar nada.
    statusAtual: statusDe(selecionadas.length === 0 && movidas.length === 0 && atualizacoes.length === 0),
    statusProjetado: statusDe(true),
    conferencia: conf,
  }
}

// Texto curto de cada motivo de revisão (para a tela explicar a divergência).
export const MOTIVO = {
  correspondencia_provavel: 'Parece uma compra já lançada, mas data, nome ou valor não batem por inteiro.',
  valor_diferente: 'Parece a mesma compra, mas o valor lançado é diferente do da fatura.',
  parcelamento_ambiguo: 'A parcela desta fatura não é a que o app esperava para este mês.',
  parcelamento_sem_registro: 'É uma parcela em andamento e o parcelamento não está no app: confirme antes de criar.',
  outra_fatura: 'Já está lançada, mas em outra fatura (outro mês ou cartão).',
  dados_incompletos: 'Faltam dados obrigatórios para importar (categoria, pessoa, data ou valor).',
}
