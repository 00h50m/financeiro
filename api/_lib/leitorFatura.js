// Lê o PDF de uma fatura de cartão com a API da Anthropic e devolve as linhas no mesmo formato do CSV padronizado.
// A leitura nunca grava nada: as linhas entram na tela de importação, onde a pessoa confere antes de confirmar.
import Anthropic from '@anthropic-ai/sdk'

const MODELO = 'claude-sonnet-5-5'
export const MAX_LINHAS = 500

const SISTEMA = `Você lê faturas de cartão de crédito brasileiras (PDF) e extrai os lançamentos de compras.
Extraia apenas o que está escrito no documento; nunca invente linhas nem valores.
- Inclua cada compra, parcela, estorno e crédito listados como lançamento da fatura.
- NÃO inclua: pagamento da fatura anterior, saldo anterior, totais, resumo, limites, encargos futuros nem simulações de parcelamento.
- data: AAAA-MM-DD. Faturas mostram só dia e mês: use o ano da data de vencimento ou fechamento, e o ano anterior quando o mês da compra for depois do mês da fatura (ex.: compra de dezembro numa fatura de janeiro).
- descricao: o texto do estabelecimento como está na fatura, sem o "03/10" de parcela.
- valor: em reais, número positivo para compras; NEGATIVO para estorno, crédito ou devolução. Nas parceladas, o valor da parcela cobrada nesta fatura.
- parcela_atual e parcela_total: só quando a linha indicar parcela (ex.: "PARC 03/10" é 3 e 10); senão null.
- cartao: nome do cartão/banco e final, se aparecer (ex.: "Nubank final 1234"); senão null.
- total_fatura: o total a pagar desta fatura, se estiver impresso; senão null.
Se o documento não for uma fatura de cartão ou não der para ler, responda legivel=false.`

const nulo = (tipo) => ({ anyOf: [{ type: tipo }, { type: 'null' }] })
const SCHEMA = {
  type: 'object',
  properties: {
    legivel: { type: 'boolean' },
    cartao: nulo('string'),
    total_fatura: nulo('number'),
    lancamentos: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          data: { type: 'string' },
          descricao: { type: 'string' },
          valor: { type: 'number' },
          parcela_atual: nulo('integer'),
          parcela_total: nulo('integer'),
        },
        required: ['data', 'descricao', 'valor', 'parcela_atual', 'parcela_total'],
        additionalProperties: false,
      },
    },
  },
  required: ['legivel', 'cartao', 'total_fatura', 'lancamentos'],
  additionalProperties: false,
}

const dataReal = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso) && new Date(iso + 'T12:00:00Z').toISOString().slice(0, 10) === iso
const parcela = (n) => (Number.isInteger(n) && n >= 1 && n <= 48 ? n : null)

// Valida o que a IA devolveu: data de verdade, valor razoável, nome limpo. Linhas ruins ficam de fora e são contadas.
// -> { linhas, descartadas, cartao, totalFatura } no formato das colunas do CSV, ou null se não for fatura.
export function limparFatura(j) {
  if (!j || j.legivel !== true || !Array.isArray(j.lancamentos)) return null
  const linhas = []
  let descartadas = 0
  for (const l of j.lancamentos.slice(0, MAX_LINHAS)) {
    const valor = Number(l?.valor)
    const descricao = typeof l?.descricao === 'string' ? l.descricao.replace(/\s+/g, ' ').trim().slice(0, 120) : ''
    if (!descricao || !Number.isFinite(valor) || valor === 0 || Math.abs(valor) >= 1e6 || !dataReal(l?.data)) { descartadas++; continue }
    let atual = parcela(l.parcela_atual)
    let total = parcela(l.parcela_total)
    if (!atual || !total || atual > total) { atual = null; total = null }
    linhas.push({
      data: l.data, descricao, valor: String(Math.round(valor * 100) / 100), categoria: '',
      parcela_atual: atual ? String(atual) : '', parcela_total: total ? String(total) : '', cartao: '', observacao: '',
    })
  }
  descartadas += Math.max(0, j.lancamentos.length - MAX_LINHAS)
  if (!linhas.length) return null
  const totalFatura = Number.isFinite(Number(j.total_fatura)) && Number(j.total_fatura) > 0 ? Math.round(Number(j.total_fatura) * 100) / 100 : null
  return { linhas, descartadas, cartao: typeof j.cartao === 'string' ? j.cartao.trim().slice(0, 80) : '', totalFatura }
}

export function criarLeitorFatura(apiKey, { client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55000 }) } = {}) {
  return {
    // pdfBase64: o PDF em base64. Devolve o resultado de limparFatura ou null se não deu para ler.
    async ler(pdfBase64, hoje) {
      const r = await client.messages.create({
        model: MODELO,
        max_tokens: 16000,
        system: SISTEMA,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: `Hoje é ${hoje}. Extraia os lançamentos desta fatura de cartão.` },
          ],
        }],
      })
      if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null
      const texto = r.content.find((b) => b.type === 'text')?.text
      let j
      try { j = JSON.parse(texto) } catch { return null }
      return limparFatura(j)
    },
  }
}
