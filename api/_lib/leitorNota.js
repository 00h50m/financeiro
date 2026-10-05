// Lê a foto de uma notinha/comprovante com a API da Anthropic e devolve só o que o bot precisa.
// A leitura nunca vira compra sozinha: o resultado entra no mesmo fluxo de resumo + Confirmar do texto.
import Anthropic from '@anthropic-ai/sdk'

const MODELO = 'claude-sonnet-5-5'

const SISTEMA = `Você lê fotos de notas fiscais, cupons e comprovantes de pagamento brasileiros.
Extraia apenas o que está escrito na imagem; nunca invente.
- valor_total: o total pago (não subtotais nem troco), em reais, como número (ex.: 89.9).
- estabelecimento: nome curto do local (ex.: "Outback", "Mercado Pago"), sem CNPJ nem endereço.
- data: a data da compra no formato AAAA-MM-DD, só se estiver impressa; senão null.
- parcelas: número de parcelas, só se estiver impresso; senão null.
Se a imagem não for uma nota ou comprovante, ou não der para ler o total, responda legivel=false.`

const SCHEMA = {
  type: 'object',
  properties: {
    legivel: { type: 'boolean' },
    valor_total: { anyOf: [{ type: 'number' }, { type: 'null' }] },
    estabelecimento: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    data: { anyOf: [{ type: 'string' }, { type: 'null' }] },
    parcelas: { anyOf: [{ type: 'integer' }, { type: 'null' }] },
  },
  required: ['legivel', 'valor_total', 'estabelecimento', 'data', 'parcelas'],
  additionalProperties: false,
}

// "2026-02-31" não existe (o Date do JS empurraria para março): só vale se voltar igual.
const dataReal = (iso) => new Date(iso + 'T12:00:00Z').toISOString().slice(0, 10) === iso

// Valida o que a IA devolveu: valor positivo e razoável, data de verdade e não futura, nome curto.
export function limparLeitura(j, hoje) {
  if (!j || j.legivel !== true) return null
  const valor = Number(j.valor_total)
  if (!Number.isFinite(valor) || valor <= 0 || valor >= 1e6) return null
  const data = typeof j.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.data) && j.data <= hoje && dataReal(j.data) ? j.data : null
  const nome = typeof j.estabelecimento === 'string' ? j.estabelecimento.replace(/\s+/g, ' ').trim().slice(0, 80) : ''
  const parcelas = Number.isInteger(j.parcelas) && j.parcelas >= 1 && j.parcelas <= 48 ? j.parcelas : null
  return { valor: Math.round(valor * 100) / 100, estabelecimento: nome || null, data, parcelas }
}

export function criarLeitorNota(apiKey, { client = new Anthropic({ apiKey, maxRetries: 1, timeout: 25000 }) } = {}) {
  return {
    // imagem: { base64, mediaType }. Devolve { valor, estabelecimento, data, parcelas } ou null se não deu para ler.
    async ler(imagem, hoje) {
      const r = await client.messages.create({
        model: MODELO,
        max_tokens: 1000,
        system: SISTEMA,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imagem.mediaType, data: imagem.base64 } },
            { type: 'text', text: `Hoje é ${hoje}. Leia a nota ou o comprovante da imagem.` },
          ],
        }],
      })
      if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null
      const texto = r.content.find((b) => b.type === 'text')?.text
      let j
      try { j = JSON.parse(texto) } catch { return null }
      return limparLeitura(j, hoje)
    },
  }
}
