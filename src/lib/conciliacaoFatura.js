// Conciliação da fatura: classifica cada linha do arquivo, resolve as decisões da pessoa e calcula o painel de conciliação.
// Tudo puro. Parte do princípio de que NADA é vinculado só por semelhança: só o que é exato (e um-para-um) é "já registrado" sozinho;
// o resto pede revisão. Importar e conciliar são coisas diferentes: o status de conciliação só chega a "conciliada" quando todas as
// linhas estão resolvidas e os valores fecham — nunca só porque a importação terminou nem porque dois totais deram o mesmo número.
import { conferirFatura, problemasDaLinha, valorParcelaLinha } from './importacao.js'
import { normalizarData } from './csvFormato.js'
import { normBasico } from './normalizacao.js'
import { opcaoDaLinha, cronogramaParcelamento, parcelasAvulsasParecidas } from './parcelamentoImportacao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
export const TOLERANCIA_CONCILIACAO = 0.1

// ---------- natureza da linha ----------
// compra | credito (estorno/crédito: valor negativo) | encargo (juros, IOF, multa, anuidade, tarifa) | pagamento (pagamento da fatura anterior: não é parte do total)
const PAGAMENTO = /(pagamento\s+(recebido|efetuado|de\s+fatura|fatura|on-?line)|pgto\s+(fatura|recebido)|saldo\s+(anterior|restante|da\s+fatura\s+anterior)|obrigad[oa]\s+pelo\s+pagamento)/i
const ENCARGO = /\b(iof|juros|multa|encargos?|anuidade|tarifa|mora)\b/i

export function naturezaDaLinha(l) {
  if (['compra', 'credito', 'encargo'].includes(l.naturezaManual)) return l.naturezaManual // a pessoa disse que NÃO é pagamento da fatura
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
    case 'mesma': case 'manter': case 'atualizar': case 'mover': case 'passar': case 'depois': return { decisao, incluir: false, incluirManual: true }
    case 'outra': return { decisao, incluir: true, incluirManual: true }
    default: return { decisao: undefined, incluirManual: false, vinculoManual: undefined, vinculoFixoManual: undefined }
  }
}

// ---------- classificação de uma linha ----------
// grupos: registrada | nova | revisao | ignorada
// motivos (revisão): correspondencia_provavel | valor_diferente | parcelamento_ambiguo | parcelamento_sem_registro | outra_fatura | dados_incompletos
export function classificarLinha(l, { foraDoMesIds = new Set(), contaFixaIds = new Set(), contaFixaProvavel = new Map(), contaFixaFora = new Map(), categorias = [], mesFatura = '', parcelamentoOk = null } = {}) {
  const natureza = naturezaDaLinha(l)
  const base = { natureza, motivos: [], confirmada: false, adiada: false, bloqueios: [] }
  if (natureza === 'pagamento') return { ...base, grupo: 'ignorada', acao: 'ignorar', selecionada: false }

  const corr = l.correspondencia
  const dec = l.decisao
  const revisao = (motivos, acao) => ({ ...base, grupo: 'revisao', motivos, acao, selecionada: false, adiada: dec === 'depois' })
  const registrada = (confirmada) => ({ ...base, grupo: 'registrada', acao: 'nada', selecionada: false, confirmada })

  if (contaFixaIds.has(l._id)) return registrada(false) // já existe como conta fixa no cartão

  // parece uma conta fixa (valor diferente, ou conta fixa paga fora do cartão): a pessoa decide; "outra compra" segue o fluxo normal
  const fixoNoCartao = contaFixaProvavel.get(l._id)
  if (fixoNoCartao && dec !== 'outra') {
    if (dec === 'mesma') return { ...registrada(true), fixoVinculado: { ...fixoNoCartao, acao: 'valor' } }
    return { ...revisao(['conta_fixa_valor'], 'conta_fixa'), fixoCandidato: fixoNoCartao }
  }
  const fixoFora = contaFixaFora.get(l._id)
  if (fixoFora && dec !== 'outra') {
    if (dec === 'passar') return { ...registrada(true), fixoVinculado: { ...fixoFora, acao: 'passar' } }
    if (dec === 'mesma') return { ...registrada(true), fixoVinculado: { ...fixoFora, acao: 'nenhuma' } }
    return { ...revisao(['conta_fixa_fora_do_cartao'], 'conta_fixa'), fixoCandidato: fixoFora }
  }

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
  const opcao = opcaoDaLinha(l)
  if (emAndamento && !opcao) return revisao(['parcelamento_sem_registro', ...(problemas.length ? ['dados_incompletos'] : [])], 'confirmar_parcelamento')
  // parcelamento completo: a parcela desta fatura tem de cair mesmo neste mês (senão não grava nada sem a pessoa decidir)
  if (emAndamento && opcao === 'completo' && parcelamentoOk && !parcelamentoOk(l)) return revisao(['parcelamento_inconsistente'], 'confirmar_parcelamento')
  if (problemas.length && l.incluir !== false) return { ...revisao(['dados_incompletos'], 'completar'), bloqueios: problemas }
  const selecionada = l.incluir !== false && problemas.length === 0
  return { ...base, grupo: 'nova', acao: selecionada ? 'importar' : 'deixada_de_fora', selecionada, bloqueios: problemas, repetidaNoArquivo: !!l.duplicataCsv }
}

// ---------- análise da fatura de um cartão ----------
// `linhas`: linhas do arquivo JÁ analisadas (com `correspondencia`, como a tela faz). -> { linhas, grupos, contadores, painel, status }
// o item de fixo do cartão não traz o indicador de valor variável: busca no cadastro
const comVariavel = (fixo, fixos) => ({ ...fixo, variavel: fixo.variavel ?? !!fixos.find((f) => f.id === fixo.id)?.variavel })

export function analisarFatura({ linhas, compras, cartoes, fixos = [], cartaoId, mes, aliases = [], modo = 'parcela', categorias = [], totalBanco = null }) {
  const conf = conferirFatura({ linhas, compras, cartoes, fixos, cartaoId, mes, aliases }, modo)
  const ctx = {
    foraDoMesIds: new Set(conf.foraDoMes.map((x) => x.linha._id)),
    contaFixaIds: new Set(conf.contaFixa.map((x) => x.linha._id)),
    contaFixaProvavel: new Map(conf.contaFixaProvavel.map((x) => [x.linha._id, comVariavel(x.fixo, fixos)])),
    contaFixaFora: new Map(conf.contaFixaFora.map((x) => [x.linha._id, comVariavel(x.fixo, fixos)])),
    categorias, mesFatura: mes,
    parcelamentoOk: (l) => cronogramaParcelamento(l, { mesFatura: mes, modoValor: modo, cartoes }).bate,
  }
  const doCartao = linhas.filter((l) => l.cartao_id === cartaoId && l.valor !== '' && !Number.isNaN(Number(l.valor)))
  // linhas idênticas dentro do próprio arquivo (duas compras iguais no mesmo dia): não bloqueia, só avisa
  const chaveDe = (l) => `${String(l.data).slice(0, 10)}|${normBasico(l.descricao)}|${Number(l.valor)}`
  const vezes = new Map()
  doCartao.forEach((l) => vezes.set(chaveDe(l), (vezes.get(chaveDe(l)) || 0) + 1))
  const comEvidencia = (l, c) => (c.motivos.includes('parcelamento_sem_registro') ? { avulsasParecidas: parcelasAvulsasParecidas(l, { compras, cartaoId, aliases, mesFatura: mes, modoValor: modo }) } : {})
  const classificadas = doCartao.map((l) => ({ ...l, duplicataCsv: vezes.get(chaveDe(l)) > 1, ...(() => { const c = classificarLinha({ ...l, duplicataCsv: vezes.get(chaveDe(l)) > 1 }, ctx); return { ...c, ...comEvidencia(l, c) } })() }))
  const por = (g) => classificadas.filter((l) => l.grupo === g)
  const registradas = por('registrada'), novas = por('nova'), revisao = por('revisao'), ignoradas = por('ignorada')
  const selecionadas = novas.filter((l) => l.selecionada)
  const deixadasDeFora = novas.filter((l) => !l.selecionada)
  // para cada compra que só está no app: linhas NOVAS do arquivo que podem ser a mesma compra com outro nome (mesmo valor e data próxima,
  // ou mesma parcela). Só sugere: quem decide é a pessoa (aba Só no app).
  const diasEntre = (a, b) => Math.abs(Math.round((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86400000))
  const divergenciasApp = conf.sobrandoNoFinapp.map((d) => {
    if (!d.compra) {
      // conta fixa deste cartão que não casou com nenhuma linha: sugere as linhas novas de mesmo valor (nome costuma ser outro: "AMIL" x "Plano de Saúde")
      const valorF = r2(Number(d.valor))
      const pares = [...novas, ...revisao.filter((x) => !x.correspondencia)]
        .filter((l) => Math.abs(valorParcelaLinha(l, modo) - valorF) < 0.02)
        .map((l) => ({ linhaId: l._id, nome: l.identificacao?.trim() || l.descricao, descricaoOriginal: l.descricaoOriginal, data: l.data, valor: r2(valorParcelaLinha(l, modo)), dias: null }))
      return pares.length && d.fixo ? { ...d, paresPossiveis: pares } : d
    }
    const c = d.compra
    const np = Number(c.parcelas) || 1
    const valorC = r2(Number(d.valor))
    const paresPossiveis = [...novas, ...revisao.filter((x) => !x.correspondencia)]
      .filter((l) => {
        if ((Number(l.parcela_total) || 1) !== np) return false
        if (Math.abs(valorParcelaLinha(l, modo) - valorC) >= 0.02) return false
        return np > 1 ? (Number(l.parcela_atual) || 1) === (Number(d.parcela) || 0) : diasEntre(l.data, c.data_compra) <= 5
      })
      .map((l) => ({ linhaId: l._id, nome: l.identificacao?.trim() || l.descricao, descricaoOriginal: l.descricaoOriginal, data: l.data, valor: r2(valorParcelaLinha(l, modo)), dias: np > 1 ? null : diasEntre(l.data, c.data_compra) }))
      .sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0))
    return paresPossiveis.length ? { ...d, paresPossiveis } : d
  })
  const bloqueadas = revisao.filter((l) => l.bloqueios.length)

  const v = (l) => valorParcelaLinha(l, modo)
  const somar = (ls, f = v) => r2(ls.reduce((t, l) => t + f(l), 0))
  const doTotal = classificadas.filter((l) => l.natureza !== 'pagamento')
  const naturezas = Object.fromEntries(['compra', 'credito', 'encargo', 'pagamento'].map((n) => [n, { qtd: classificadas.filter((l) => l.natureza === n).length, valor: somar(classificadas.filter((l) => l.natureza === n)) }]))
  const atualizacoes = registradas.filter((l) => l.decisao === 'atualizar' && l.correspondencia?.tipo === 'valor_diferente')
  const ajusteAtualizar = somar(atualizacoes, (l) => v(l) - (Number(l.correspondencia.compra.parcelas) > 1 ? Number(l.correspondencia.compra.valor_total) / Number(l.correspondencia.compra.parcelas) : Number(l.correspondencia.compra.valor_total)))
  const movidas = registradas.filter((l) => l.moverParaEstaFatura) // compras já lançadas que passam a contar nesta fatura
  const ajusteMover = somar(movidas)
  // contas fixas vinculadas: 'passar' coloca o valor da conta fixa dentro desta fatura; 'valor' troca o valor estimado pelo da fatura (só conta variável)
  const ajusteFixos = somar(classificadas.filter((l) => l.fixoVinculado), (l) => { const f = l.fixoVinculado; const v = Number(l.valor); return f.acao === 'passar' ? (f.variavel ? v : f.valor) : f.acao === 'valor' && f.variavel ? v - f.valor : 0 })
  const totalExtraido = somar(doTotal)
  const totalApp = r2(conf.totalFinapp)
  const novasSelecionadas = somar(selecionadas)
  const projetado = r2(totalApp + novasSelecionadas + ajusteAtualizar + ajusteMover + ajusteFixos)
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
      totalBanco: totalBanco != null ? Number(totalBanco) : null, totalExtraido, totalApp, novasSelecionadas, ajusteAtualizar, ajusteMover, ajusteFixos, projetado,
      diferenca, baseDiferenca: totalBanco != null ? 'banco' : 'arquivo', semTotalBanco: totalBanco == null,
      naturezas, valores: { confirmado: totalApp, estimado: r2(novasSelecionadas + ajusteAtualizar + ajusteMover + ajusteFixos), projetado },
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
  parcelamento_sem_registro: 'É uma parcela em andamento e o parcelamento não está no app: escolha como registrar antes de criar.',
  parcelamento_inconsistente: 'Pelo calendário do cartão, essa parcela não cairia neste mês: registre só esta parcela ou corrija o mês da fatura.',
  conta_fixa_valor: 'Parece uma conta fixa deste cartão, mas o valor da fatura é diferente do cadastrado. Se for a mesma, ela não é importada de novo.',
  conta_fixa_fora_do_cartao: 'Existe uma conta fixa com esse nome paga fora do cartão. Importar esta linha contaria a cobrança duas vezes.',
  outra_fatura: 'Já está lançada, mas em outra fatura (outro mês ou cartão).',
  dados_incompletos: 'Faltam dados obrigatórios para importar (categoria, pessoa, data ou valor).',
}

// Rótulos curtos dos motivos (para listas e selos).
export const ROTULO_MOTIVO = {
  correspondencia_provavel: 'Parece já lançada', valor_diferente: 'Valor diferente', parcelamento_ambiguo: 'Parcela diferente do esperado',
  parcelamento_sem_registro: 'Parcelamento não está no app', parcelamento_inconsistente: 'Parcela não cai neste mês', conta_fixa_valor: 'Conta fixa com valor diferente', conta_fixa_fora_do_cartao: 'Conta fixa fora do cartão', outra_fatura: 'Está em outra fatura', dados_incompletos: 'Faltam dados',
}

// De onde vem a diferença entre o app (projetado) e a fatura: lista o que ainda está em aberto, com valores, e o quanto cada grupo pesa.
// diferenca = projetado − base (banco, ou arquivo quando não há total do banco).
//   leitura  : arquivo − banco  (negativo: o arquivo traz menos que o banco, pode haver linha que não foi lida)
//   revisao  : linhas do arquivo ainda sem decisão (se forem compras que faltam, entram na conta quando importadas)
//   deixadas : linhas novas que você optou por não importar
//   soNoApp  : lançado no app para este cartão/mês e ausente do arquivo (pode ser de outra fatura)
export function detalheDiferenca(analise, modo = 'parcela') {
  const v = (l) => r2(valorParcelaLinha(l, modo))
  const p = analise.painel
  const revisao = analise.grupos.revisao.map((l) => ({ id: l._id, nome: l.identificacao?.trim() || l.descricao, data: l.data, valor: v(l), motivo: l.adiada ? 'Revisar depois' : ROTULO_MOTIVO[l.motivos[0]] || 'Revisar' }))
  const deixadas = analise.grupos.novas.filter((l) => !l.selecionada).map((l) => ({ id: l._id, nome: l.identificacao?.trim() || l.descricao, data: l.data, valor: v(l), motivo: 'Nova, deixada de fora' }))
  const soNoApp = analise.grupos.divergenciasApp.map((d, i) => ({ id: d.compra?.id || d.fixo?.id || `app${i}`, nome: d.compra ? d.compra.identificacao || d.compra.descricao : d.fixo?.nome, data: d.compra?.data_compra || null, valor: r2(d.valor), motivo: d.compra ? 'No app, fora do arquivo' : 'Conta fixa neste cartão', compra: d.compra || null }))
  const soma = (xs) => r2(xs.reduce((t, x) => t + x.valor, 0))
  const leitura = p.totalBanco != null ? r2(p.totalExtraido - p.totalBanco) : 0
  const totais = { revisao: soma(revisao), deixadas: soma(deixadas), soNoApp: soma(soNoApp), leitura }
  // estimativa: importar tudo o que está em aberto e tirar o que só está no app (supondo que seja de outra fatura)
  const seResolvido = r2(p.diferenca + totais.revisao + totais.deixadas - totais.soNoApp)
  // rede de segurança: linha nova que será CRIADA com mesmo valor e data próxima (até 3 dias) de algo que já está no app e não está no arquivo
  const dias = (a, b) => Math.abs(Math.round((new Date(`${String(a).slice(0, 10)}T12:00:00Z`) - new Date(`${String(b).slice(0, 10)}T12:00:00Z`)) / 86400000))
  const possiveisDuplicadas = []
  analise.grupos.novas.filter((l) => l.selecionada).forEach((l) => {
    const par = soNoApp.find((x) => x.compra && Math.abs(x.valor - v(l)) < 0.02 && x.data && dias(l.data, x.data) <= 3)
    if (par) possiveisDuplicadas.push({ id: l._id, nome: l.identificacao?.trim() || l.descricao, data: l.data, valor: v(l), noApp: par.nome, noAppData: par.data })
  })
  // linhas que o app ignorou por parecerem pagamento/saldo anterior: se o valor bate com o que falta no arquivo, é a suspeita nº 1
  const falta = Math.abs(leitura)
  const ignoradas = analise.grupos.ignoradas.map((l) => ({ id: l._id, nome: l.identificacao?.trim() || l.descricao, data: l.data, valor: v(l), motivo: 'Ignorada: parece pagamento ou saldo anterior', bateComFalta: falta > 0.1 && Math.abs(Math.abs(v(l)) - falta) <= 0.05 }))
  return { revisao, deixadas, soNoApp, ignoradas, totais, seResolvido, possiveisDuplicadas, diferenca: p.diferenca, baseDiferenca: p.baseDiferenca }
}
