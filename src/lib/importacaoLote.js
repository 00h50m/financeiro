// Importação de fatura: lote, chave de repetição e gravação atômica (função do banco `aplicar_importacao`, inbox/37).
// A leitura e a análise nunca gravam; só a confirmação chama o banco, uma vez, com tudo.
import { normBasico } from './normalizacao.js'
import { calcMesInicio } from './utils.js'
import { opcaoDaLinha, compraDoParcelamento } from './parcelamentoImportacao.js'
import { valorParcelaLinha } from './importacao.js'
import { limparDescricao } from './normalizacao.js'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// Impressão digital do conteúdo (cartão + mês + linhas lidas): o mesmo arquivo gera sempre a mesma chave, em qualquer ordem de linhas.
export async function chaveDoArquivo({ cartaoId = '', mes = '', linhas = [] }) {
  const canon = linhas
    .map((l) => [String(l.data || '').slice(0, 10), normBasico(l.descricao || l.descricaoOriginal || ''), r2(l.valor).toFixed(2), Number(l.parcela_atual) || 1, Number(l.parcela_total) || 1, l.cartao_id || ''].join('|'))
    .sort()
  const texto = `${cartaoId}#${mes}#${canon.join('\n')}`
  const bytes = new TextEncoder().encode(texto)
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export const novoIdImportacao = () => globalThis.crypto.randomUUID()

// Linhas prontas (marcadas e sem problema) → compras no formato da função do banco.
// Parcela em andamento (k > 1) é reconstruída como sempre (começa k-1 meses antes do mês da fatura); a próxima parte da evolução
// troca isso por uma prévia com confirmação.
export function montarCompras(prontas, { mesFatura, cartoes, faturaMesOk, valorTotalLinha, modoValor }) {
  return prontas.map((l) => {
    const n = Number(l.parcela_total) || 1
    const k = Number(l.parcela_atual) || 1
    const soEsta = k > 1 && opcaoDaLinha(l) === 'so_esta'
    const completo = k > 1 && !soEsta
    const cartao = cartoes.find((c) => c.id === l.cartao_id)
    const mesF = mesFatura.split('-').reverse().join('/')
    // completo: 1ª parcela k-1 meses antes (ancorada por fatura_mes); só esta: uma compra de uma vez, com a data da própria linha
    const dataCompra = completo ? compraDoParcelamento(l, { mesFatura, modoValor }).data_compra : l.data
    const nota = soEsta ? `Parcela ${k}/${n}: registrada só esta parcela na importação da fatura de ${mesF}` : completo ? `Parcela ${k}/${n} na importação (início estimado pela fatura de ${mesF})` : ''
    if (soEsta) {
      return {
        descricao_original: l.descricaoOriginal || l.descricao, data_compra: dataCompra, descricao: limparDescricao(l.descricao),
        ...(l.identificacao.trim() ? { identificacao: l.identificacao.trim() } : {}),
        categoria: l.categoria, subcategoria: l.subcategoria, pessoa: l.pessoa, cartao_id: l.cartao_id,
        valor_total: r2(valorParcelaLinha(l, modoValor)), parcelas: 1,
        ...(faturaMesOk && mesFatura ? { fatura_mes: mesFatura } : {}),
        obs: [l.observacao, nota].filter(Boolean).join(' · ') || undefined,
      }
    }
    return {
      descricao_original: l.descricaoOriginal || l.descricao,
      data_compra: dataCompra,
      descricao: limparDescricao(l.descricao),
      ...(l.identificacao.trim() ? { identificacao: l.identificacao.trim() } : {}),
      categoria: l.categoria,
      subcategoria: l.subcategoria,
      pessoa: l.pessoa,
      cartao_id: l.cartao_id,
      valor_total: valorTotalLinha(l, modoValor),
      parcelas: n,
      ...(faturaMesOk && completo ? { fatura_mes: compraDoParcelamento(l, { mesFatura, modoValor }).fatura_mes } : faturaMesOk && mesFatura && k === 1 && cartao && calcMesInicio(l.data, cartao) !== mesFatura ? { fatura_mes: mesFatura } : {}),
      obs: [l.observacao, nota].filter(Boolean).join(' · ') || undefined,
    }
  })
}

// Linhas como foram lidas, para guardar no lote (base da conciliação posterior). Só os campos do arquivo.
export const linhasLidas = (linhas) => linhas.map((l) => ({ data: l.data, descricao: l.descricaoOriginal || l.descricao, valor: l.valor, parcela_atual: l.parcela_atual, parcela_total: l.parcela_total, cartao: l.cartaoNome, observacao: l.observacao }))

// A função do banco ainda não existe (inbox/37 não rodado)?
const semFuncao = (e) => e?.code === 'PGRST202' || e?.code === '42883' || /aplicar_importacao/.test(String(e?.message || '')) && /could not find|does not exist|schema cache/i.test(String(e?.message || ''))

// Chama o banco. `dados`: { cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas, compras }.
// -> { status_importacao, status_conciliacao, criadas, repetida?, motivo?, concluida_em?, semProtecao? }
export async function aplicarImportacao(sb, { importacaoId, dados, usuario = null }) {
  const r = await sb.rpc('aplicar_importacao', { p_importacao: importacaoId, p_dados: dados, p_usuario: usuario })
  if (!r.error) return r.data
  if (!semFuncao(r.error)) throw r.error
  if ((dados.atualizar || []).length || (dados.mover || []).length) throw new Error('Para atualizar valores ou mover compras de fatura, rode o arquivo inbox/38_importacao_assistente.sql no Supabase.')
  // Banco sem a atualização 37: grava como antes (uma única inserção), avisando que não há proteção contra repetição.
  const origem = dados.origem_leitura === 'pdf' ? 'pdf' : 'csv'
  const ins = await sb.from('compras').insert(dados.compras.map((c) => ({ ...c, origem })))
  if (ins.error) throw ins.error
  return { status_importacao: 'concluida', status_conciliacao: 'pendente', criadas: dados.compras.length, semProtecao: true }
}

// Rascunho: guarda o trabalho em andamento no lote para retomar depois. Devolve { ok, indisponivel }: sem a atualização 38 do banco,
// o assistente funciona do mesmo jeito, só não retoma e não atualiza valores nem move compras de fatura.
export async function salvarRascunho(sb, { importacaoId, dados, usuario = null }) {
  const r = await sb.rpc('salvar_rascunho_importacao', { p_importacao: importacaoId, p_dados: dados, p_usuario: usuario })
  if (!r.error) return { ok: !r.data?.ignorado, indisponivel: false }
  if (semFuncao(r.error)) return { ok: false, indisponivel: true }
  throw r.error
}
export async function descartarRascunho(sb, importacaoId) {
  const r = await sb.rpc('descartar_rascunho_importacao', { p_importacao: importacaoId })
  if (r.error && !semFuncao(r.error)) throw r.error
}
// Rascunhos em andamento (mais recente primeiro). Vazio quando o banco não tem a atualização.
export async function listarRascunhos(sb) {
  const r = await sb.from('importacoes_fatura').select('id,cartao_id,mes,arquivo_nome,origem_leitura,total_banco,linhas,decisoes,atualizado_em').eq('status_importacao', 'rascunho').order('atualizado_em', { ascending: false }).limit(10)
  return r.error ? [] : r.data || []
}

// Texto do resultado para a tela: importação e conciliação são coisas diferentes.
export function textoResultado(r) {
  if (r.repetida) {
    const quando = r.concluida_em ? ` em ${String(r.concluida_em).slice(0, 10).split('-').reverse().join('/')}` : ''
    return { tipo: 'aviso', titulo: `Esta fatura já foi importada${quando}.`, detalhe: 'Nada foi gravado de novo. Se alguma linha for outra compra, marque-a manualmente e importe só ela.' }
  }
  const partes = [`${r.criadas} lançamento${r.criadas === 1 ? '' : 's'} gravado${r.criadas === 1 ? '' : 's'}`]
  if (r.atualizadas) partes.push(`${r.atualizadas} valor${r.atualizadas === 1 ? '' : 'es'} atualizado${r.atualizadas === 1 ? '' : 's'}`)
  if (r.movidas) partes.push(`${r.movidas} compra${r.movidas === 1 ? '' : 's'} movida${r.movidas === 1 ? '' : 's'} de fatura`)
  const conc = { conciliada: 'Fatura conciliada: todas as linhas estão resolvidas e os valores fecham.', parcial: 'Conciliação parcial: ainda há pendências ou diferenças para investigar.' }
  return {
    tipo: 'ok',
    titulo: `Importação concluída: ${partes.join(', ')}.`,
    detalhe: conc[r.status_conciliacao] || 'A conciliação com a fatura ainda está pendente.',
    aviso: r.semProtecao ? 'Seu banco ainda não tem a atualização 37: a importação foi gravada sem a proteção contra repetição. Rode o arquivo inbox/37_importacao_nucleo.sql no Supabase.' : null,
  }
}
