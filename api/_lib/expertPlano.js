// Expert de mudança financeira (aba "Meu plano"): recebe os números que o app já calculou e devolve um plano para voltar a sobrar.
// A IA explica e prioriza: não faz conta nem grava nada. Ver também consultorDividas.js (mesmo padrão).
import Anthropic from '@anthropic-ai/sdk'

const MODELO = 'claude-sonnet-5-5'
export const MAX_CONTEXTO = 80_000
export const TIPOS = ['adiar', 'cortar', 'renegociar', 'aumentar_renda', 'pagar', 'guardar', 'outro']

const SISTEMA = `Você é um consultor financeiro pessoal experiente, direto, realista e gentil, acompanhando uma pessoa no Brasil que está no vermelho e quer VOLTAR A SOBRAR mantendo o padrão de vida o máximo possível (ela vai continuar tendo gastos). Escreva em português do Brasil, simples, sem jargão.
Você recebe um JSON com os números calculados pelo app: renda e sobra real por mês, dívidas, gastos do dia a dia por categoria (reservado e teto por semana), contas do mês, parcelamentos que terminam, reserva de emergência, receita das aulas particulares e, se houver, o plano anterior.
Regras:
- Use SOMENTE números que estão no JSON. Nunca invente valores, taxas, datas, bancos ou produtos. Se faltar dado, diga o que falta em "alertas".
- "sobra_real" já desconta o dia a dia reservado; negativa = mês no vermelho. A meta é fechar todos os meses no azul e depois formar folga.
- Seja honesto: se com os dados não dá para voltar ao azul só cortando, diga isso e mostre quanto falta por mês e quais alavancas existem (renda extra, renegociar, adiar, vender algo).
- Diagnóstico: de 3 a 5 causas do vermelho, cada uma com o número que a explica.
- Ações: concretas, curtas, em ordem de prioridade (1º o que evita multa/corte/juros altos, 2º o que tem maior efeito por menor sacrifício). Cada uma com tipo, motivo, valor em reais do JSON (ou null) e quando (mês AAAA-MM, ou null).
- Cronograma: os próximos 6 meses, com o objetivo do mês e a sobra prevista (use "sobra_real" do JSON; some ao efeito das ações só se for um valor do JSON).
- Tetos semanais: por categoria do dia a dia, usando os valores do JSON como base (pode propor um teto menor, justificando nas ações).
- Regras do dia a dia: 3 a 5 regras práticas e curtas para o comportamento (ex.: abastecer só uma vez por semana).
- Se houver plano anterior, diga em "resumo" o que mudou desde então.
- Não prometa resultado, não recomende investimento, empréstimo novo nem cartão novo. Para dívidas, oriente negociar com o credor e usar canais oficiais de renegociação, sem citar empresas.
- Decisões pessoais (vender algo, trabalhar mais) apresente como opção.`

const nulo = (tipo) => ({ anyOf: [{ type: tipo }, { type: 'null' }] })
const ACAO = {
  type: 'object',
  properties: { acao: { type: 'string' }, por_que: { type: 'string' }, tipo: { type: 'string', enum: TIPOS }, valor: nulo('number'), quando: nulo('string') },
  required: ['acao', 'por_que', 'tipo', 'valor', 'quando'], additionalProperties: false,
}
const SCHEMA = {
  type: 'object',
  properties: {
    situacao: { type: 'string', enum: ['vermelho', 'apertado', 'controlado'] },
    resumo: { type: 'string' },
    diagnostico: { type: 'array', items: { type: 'string' } },
    meta: { type: 'object', properties: { sobra_mensal_alvo: nulo('number'), mes_de_volta_ao_azul: nulo('string') }, required: ['sobra_mensal_alvo', 'mes_de_volta_ao_azul'], additionalProperties: false },
    acoes: { type: 'array', items: ACAO },
    cronograma: { type: 'array', items: { type: 'object', properties: { mes: { type: 'string' }, objetivo: { type: 'string' }, sobra_prevista: nulo('number') }, required: ['mes', 'objetivo', 'sobra_prevista'], additionalProperties: false } },
    tetos_semanais: { type: 'array', items: { type: 'object', properties: { categoria: { type: 'string' }, valor: { type: 'number' } }, required: ['categoria', 'valor'], additionalProperties: false } },
    regras_do_dia_a_dia: { type: 'array', items: { type: 'string' } },
    alertas: { type: 'array', items: { type: 'string' } },
  },
  required: ['situacao', 'resumo', 'diagnostico', 'meta', 'acoes', 'cronograma', 'tetos_semanais', 'regras_do_dia_a_dia', 'alertas'], additionalProperties: false,
}

const txt = (t, max) => (typeof t === 'string' ? t.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const numero = (n) => (n != null && n !== '' && Number.isFinite(Number(n)) && Math.abs(Number(n)) < 1e9 ? Math.round(Number(n) * 100) / 100 : null)
const mesOk = (m) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(m || '') ? m : null)
const lista = (l, n, max) => (Array.isArray(l) ? l : []).slice(0, n).map((x) => txt(x, max)).filter(Boolean)

// Valida o que a IA devolveu. null se vier sem ações.
export function limparPlanoVida(j) {
  if (!j || typeof j !== 'object') return null
  const acoes = (Array.isArray(j.acoes) ? j.acoes : []).slice(0, 12).map((a) => ({
    acao: txt(a?.acao, 240), por_que: txt(a?.por_que, 300), tipo: TIPOS.includes(a?.tipo) ? a.tipo : 'outro', valor: numero(a?.valor),
    quando: mesOk(a?.quando) || (a?.quando ? txt(a.quando, 40) : null),
  })).filter((a) => a.acao)
  if (!acoes.length) return null
  return {
    situacao: ['vermelho', 'apertado', 'controlado'].includes(j.situacao) ? j.situacao : 'apertado',
    resumo: txt(j.resumo, 700),
    diagnostico: lista(j.diagnostico, 6, 280),
    meta: { sobra_mensal_alvo: numero(j.meta?.sobra_mensal_alvo), mes_de_volta_ao_azul: mesOk(j.meta?.mes_de_volta_ao_azul) },
    acoes,
    cronograma: (Array.isArray(j.cronograma) ? j.cronograma : []).slice(0, 12).map((c) => ({ mes: mesOk(c?.mes), objetivo: txt(c?.objetivo, 240), sobra_prevista: numero(c?.sobra_prevista) })).filter((c) => c.mes && c.objetivo),
    tetos_semanais: (Array.isArray(j.tetos_semanais) ? j.tetos_semanais : []).slice(0, 12).map((t) => ({ categoria: txt(t?.categoria, 40), valor: numero(t?.valor) })).filter((t) => t.categoria && t.valor != null && t.valor >= 0),
    regras_do_dia_a_dia: lista(j.regras_do_dia_a_dia, 6, 200),
    alertas: lista(j.alertas, 6, 240),
  }
}

export function criarExpert(apiKey, { client = new Anthropic({ apiKey, maxRetries: 1, timeout: 55000 }) } = {}) {
  return {
    async plano(contexto) {
      const r = await client.messages.create({
        model: MODELO, max_tokens: 6000, system: SISTEMA,
        output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        messages: [{ role: 'user', content: `Dados do app (JSON):\n${JSON.stringify(contexto)}\n\nMonte o plano para voltar a sobrar.` }],
      })
      if (r.stop_reason === 'refusal' || r.stop_reason === 'max_tokens') return null
      const texto = r.content.find((b) => b.type === 'text')?.text
      try { return limparPlanoVida(JSON.parse(texto)) } catch { return null }
    },
  }
}
