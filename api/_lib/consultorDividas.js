// Consultor de dívidas com a API da Anthropic. Recebe os números que o app já calculou e devolve um plano em duas fases
// (estabilizar o mês, depois quitar) ou responde um "e se...". A IA só explica e prioriza: não faz conta nem grava nada.
import Anthropic from '@anthropic-ai/sdk'

const MODELO = 'claude-sonnet-5-5'
const MAX_CONTEXTO = 60_000

const SISTEMA = `Você é um consultor financeiro pessoal, direto e gentil, ajudando uma pessoa no Brasil a sair do vermelho. Escreva em português do Brasil, simples, sem jargão.
Você recebe um JSON com os números calculados pelo app (dívidas, sobra real por mês, gastos do dia a dia reservados, planos avalanche/bola de neve, contas do mês, parcelamentos que terminam, contas atrasadas).
Regras:
- Use SOMENTE números que estão no JSON. Nunca invente valores, taxas, datas, bancos ou produtos. Se faltar dado, diga o que falta.
- Os valores estão em reais; "sobra_real" já desconta o dia a dia. Mês com sobra_real negativa está no vermelho.
- Fase 1 "estabilizar": o que fazer para fechar o mês atual e os próximos 2 sem estourar (o que pagar primeiro, o que adiar com menor custo, o que cortar, quando renegociar).
- Fase 2 "quitar": o caminho até quitar tudo, na ordem do plano mais barato, citando mês e dívida.
- Priorize: 1) o que gera multa/juros altos ou corte de serviço essencial, 2) juros maiores, 3) o resto.
- Cada passo precisa ser uma ação concreta, curta, com o motivo. Use o valor em reais do JSON quando existir (ou null).
- Não prometa resultado, não recomende investimento, empréstimo novo nem cartão novo. Sugira negociar com o credor e usar feirões/canais oficiais de renegociação, sem citar empresas específicas.
- Se algo exigir decisão pessoal (vender algo, aumentar renda), apresente como opção.
- Seja honesto: se a conta não fecha, diga isso com clareza e mostre o que falta por mês.`

const nulo = (tipo) => ({ anyOf: [{ type: tipo }, { type: 'null' }] })
const PASSO = {
  type: 'object',
  properties: { acao: { type: 'string' }, por_que: { type: 'string' }, valor: nulo('number'), quando: nulo('string') },
  required: ['acao', 'por_que', 'valor', 'quando'], additionalProperties: false,
}
const SCHEMA_PLANO = {
  type: 'object',
  properties: {
    situacao: { type: 'string', enum: ['vermelho', 'apertado', 'controlado'] },
    resumo: { type: 'string' },
    fase1: { type: 'object', properties: { titulo: { type: 'string' }, passos: { type: 'array', items: PASSO } }, required: ['titulo', 'passos'], additionalProperties: false },
    fase2: { type: 'object', properties: { titulo: { type: 'string' }, passos: { type: 'array', items: PASSO } }, required: ['titulo', 'passos'], additionalProperties: false },
    tetos_semanais: { type: 'array', items: { type: 'object', properties: { categoria: { type: 'string' }, valor: { type: 'number' } }, required: ['categoria', 'valor'], additionalProperties: false } },
    alertas: { type: 'array', items: { type: 'string' } },
  },
  required: ['situacao', 'resumo', 'fase1', 'fase2', 'tetos_semanais', 'alertas'], additionalProperties: false,
}
const SCHEMA_RESPOSTA = {
  type: 'object',
  properties: { resposta: { type: 'string' }, impacto: nulo('string') },
  required: ['resposta', 'impacto'], additionalProperties: false,
}

const txt = (t, max) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const numero = (n) => (Number.isFinite(Number(n)) && Math.abs(Number(n)) < 1e9 ? Math.round(Number(n) * 100) / 100 : null)
const passos = (l) => (Array.isArray(l) ? l.slice(0, 8) : []).map((p) => ({ acao: txt(p?.acao, 240), por_que: txt(p?.por_que, 300), valor: p?.valor == null ? null : numero(p.valor), quando: p?.quando ? txt(p.quando, 40) : null })).filter((p) => p.acao)

// Valida o que a IA devolveu. null se vier sem as duas fases.
export function limparPlano(j) {
  if (!j || typeof j !== 'object') return null
  const f1 = passos(j.fase1?.passos), f2 = passos(j.fase2?.passos)
  if (!f1.length && !f2.length) return null
  return {
    situacao: ['vermelho', 'apertado', 'controlado'].includes(j.situacao) ? j.situacao : 'apertado',
    resumo: txt(j.resumo, 600),
    fase1: { titulo: txt(j.fase1?.titulo, 80) || 'Estabilizar o mês', passos: f1 },
    fase2: { titulo: txt(j.fase2?.titulo, 80) || 'Quitar as dívidas', passos: f2 },
    tetos_semanais: (Array.isArray(j.tetos_semanais) ? j.tetos_semanais : []).slice(0, 10).map((t) => ({ categoria: txt(t?.categoria, 40), valor: numero(t?.valor) })).filter((t) => t.categoria && t.valor != null && t.valor >= 0),
    alertas: (Array.isArray(j.alertas) ? j.alertas : []).slice(0, 5).map((a) => txt(a, 240)).filter(Boolean),
  }
}
export const limparResposta = (j) => (j && txt(j.resposta, 1500) ? { resposta: txt(j.resposta, 1500), impacto: j.impacto ? txt(j.impacto, 300) : null } : null)

export function criarConsultor(apiKey, { client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55000 }) } = {}) {
  async function chamar(schema, mensagem) {
    const r = await client.messages.create({
      model: MODELO, max_tokens: 4000, system: SISTEMA,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      messages: [{ role: 'user', content: mensagem }],
    })
    if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null
    const texto = r.content.find((b) => b.type === 'text')?.text
    try { return JSON.parse(texto) } catch { return null }
  }
  return {
    async plano(contexto) {
      return limparPlano(await chamar(SCHEMA_PLANO, `Dados do app (JSON):\n${JSON.stringify(contexto)}\n\nMonte o plano em duas fases.`))
    },
    async perguntar(contexto, pergunta) {
      return limparResposta(await chamar(SCHEMA_RESPOSTA, `Dados do app (JSON):\n${JSON.stringify(contexto)}\n\nPergunta da pessoa: ${JSON.stringify(txt(pergunta, 300))}\n\nResponda curto e use os números do JSON; em "impacto" resuma o efeito em reais por mês ou em meses, se der para saber, senão null.`))
    },
  }
}
export { MAX_CONTEXTO }
