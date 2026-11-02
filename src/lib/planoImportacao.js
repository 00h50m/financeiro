// O que a confirmação vai gravar (e o que continua em aberto), a partir da análise da fatura. Puro: a tela só mostra e envia.
import { montarCompras, linhasLidas } from './importacaoLote.js'
import { opcaoDaLinha, cronogramaParcelamento } from './parcelamentoImportacao.js'
import { valorTotalLinha, valorParcelaLinha } from './importacao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Compra dividida em categorias: o valor vale para a soma das partes, então não dá para "atualizar" por aqui.
export const ehCompraDividida = (compra) => !!compra?.grupo_id

// Prévia de uma parcela em andamento: o que será registrado, parcela por parcela, e o que é estimativa.
//   opcao 'completo': cria o parcelamento inteiro (as anteriores caem em meses passados, a data da compra original é estimada)
//   opcao 'so_esta':  uma compra de uma vez só com esta parcela (nada muda nos meses passados)
export function previaParcelamento(l, mesFatura, modoValor, { cartoes = [], fechamentos = [] } = {}) {
  const k = Number(l.parcela_atual) || 1
  const n = Number(l.parcela_total) || 1
  const opcao = opcaoDaLinha(l) || 'completo'
  const cron = cronogramaParcelamento(l, { mesFatura, modoValor, cartoes, fechamentos })
  const primeira = cron.parcelas[0]?.mes || mesFatura
  const ultima = cron.parcelas[cron.parcelas.length - 1]?.mes || mesFatura
  return {
    opcao, descricao: l.identificacao?.trim() || l.descricao, parcelaAtual: k, total: n, valorParcela: r2(valorParcelaLinha(l, modoValor)), valorTotal: r2(valorTotalLinha(l, modoValor)),
    primeiraParcela: primeira, ultimaParcela: ultima,
    anteriores: k - 1, // ficam no passado (meses antes desta fatura)
    restantes: n - k + 1, // esta e as seguintes
    dataEstimada: opcao === 'completo', // a data da compra original não consta na fatura: o app usa o dia 1 do mês da 1ª parcela
    cronograma: cron.parcelas, mesesFechados: opcao === 'completo' ? cron.fechados : [], bate: cron.bate,
    // com o parcelamento completo, os meses passados passam a incluir esta parcela (muda o total deles)
    alteraMesesPassados: opcao === 'completo' && k > 1,
  }
}

// `analise`: resultado de analisarFatura. -> { dados (para o banco), previa (para a tela) }
export function montarPlano({ analise, mesFatura, cartoes, faturaMesOk, modoValor, cartaoId, arquivo = {}, linhasDoArquivo = [], fechamentos = [] }) {
  const selecionadas = analise.linhas.filter((l) => l.grupo === 'nova' && l.selecionada)
  const compras = montarCompras(selecionadas, { mesFatura, cartoes, faturaMesOk, valorTotalLinha, modoValor })

  const atualizar = analise.linhas
    .filter((l) => l.grupo === 'registrada' && l.decisao === 'atualizar' && l.correspondencia?.tipo === 'valor_diferente')
    .map((l) => {
      const c = l.correspondencia.compra
      return { compra_id: c.id, descricao: c.identificacao || c.descricao, valor_anterior: Number(c.valor_total), valor_total: r2(valorTotalLinha(l, modoValor)), dividida: ehCompraDividida(c) }
    })
  const mover = analise.linhas
    .filter((l) => l.grupo === 'registrada' && l.moverParaEstaFatura)
    .map((l) => {
      const c = l.correspondencia.compra
      return { compra_id: c.id, descricao: c.identificacao || c.descricao, fatura_mes_anterior: c.fatura_mes || null, fatura_mes: mesFatura, valor: r2(valorParcelaLinha(l, modoValor)) }
    })
  const vinculadas = analise.linhas.filter((l) => l.grupo === 'registrada' && l.confirmada)
  const parcelamentos = selecionadas.filter((l) => (Number(l.parcela_atual) || 1) > 1).map((l) => previaParcelamento(l, mesFatura, modoValor, { cartoes, fechamentos }))
  const abertas = analise.linhas.filter((l) => l.grupo === 'revisao')
  const deixadas = analise.linhas.filter((l) => l.grupo === 'nova' && !l.selecionada)
  const v = (l) => r2(valorParcelaLinha(l, modoValor))

  const decisoes = {
    versao: 1,
    pendencias: abertas.map((l) => ({ linha: l._id, descricao: l.descricaoOriginal || l.descricao, valor: v(l), motivos: l.motivos, adiada: !!l.adiada })),
    deixadasDeFora: deixadas.map((l) => ({ linha: l._id, descricao: l.descricaoOriginal || l.descricao, valor: v(l) })),
    divergenciasApp: analise.grupos.divergenciasApp.map((d) => ({ compra_id: d.compra?.id || null, nome: d.compra ? (d.compra.identificacao || d.compra.descricao) : d.fixo?.nome, valor: r2(d.valor) })),
    vinculadas: vinculadas.map((l) => ({ linha: l._id, compra_id: l.correspondencia?.compra?.id || null, decisao: l.decisao })),
  }

  const dados = {
    cartao_id: cartaoId || null, mes: mesFatura, arquivo_nome: arquivo.nome || '', origem_leitura: arquivo.origem || 'csv',
    total_banco: analise.painel.totalBanco, total_extraido: analise.painel.totalExtraido,
    linhas: linhasLidas(linhasDoArquivo), compras,
    atualizar: atualizar.filter((a) => !a.dividida).map(({ compra_id, valor_anterior, valor_total }) => ({ compra_id, valor_anterior, valor_total })),
    mover: mover.map(({ compra_id, fatura_mes_anterior, fatura_mes }) => ({ compra_id, fatura_mes_anterior, fatura_mes })),
    decisoes, status_conciliacao: analise.statusProjetado,
  }

  const previa = {
    gravar: {
      criar: { qtd: compras.length, valor: r2(selecionadas.reduce((t, l) => t + v(l), 0)), itens: selecionadas.map((l) => ({ id: l._id, nome: l.identificacao?.trim() || l.descricao, data: l.data, valor: v(l), categoria: l.categoria })) },
      atualizar, mover, parcelamentos, vinculadas: vinculadas.length,
    },
    emAberto: { revisao: abertas.length, adiadas: abertas.filter((l) => l.adiada).length, divergenciasApp: analise.grupos.divergenciasApp.length, deixadasDeFora: deixadas.length },
    ignoradas: analise.linhas.filter((l) => l.grupo === 'ignorada').length,
    projetado: analise.painel.projetado, diferenca: analise.painel.diferenca, baseDiferenca: analise.painel.baseDiferenca,
    statusProjetado: analise.statusProjetado,
    // nada para gravar? (só pendências): a tela oferece salvar o rascunho em vez de confirmar
    temAlgoParaGravar: compras.length + atualizar.filter((a) => !a.dividida).length + mover.length > 0,
    atualizacoesBloqueadas: atualizar.filter((a) => a.dividida),
  }
  return { dados, previa }
}
