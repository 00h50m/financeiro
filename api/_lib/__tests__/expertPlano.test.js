import { describe, it, expect } from 'vitest'
import { limparPlanoVida, criarExpert } from '../expertPlano.js'
import rota from '../../expert-plano.js'

const acao = (o = {}) => ({ acao: 'Adiar o seguro', por_que: 'Evita estourar o mês', tipo: 'adiar', valor: 400, quando: '2026-11', ...o })
const bom = (o = {}) => ({
  situacao: 'vermelho', resumo: 'Faltam R$ 800 por mês.', diagnostico: ['Parcelas somam R$ 3.000'], meta: { sobra_mensal_alvo: 300, mes_de_volta_ao_azul: '2027-03' },
  acoes: [acao()], cronograma: [{ mes: '2026-11', objetivo: 'Fechar no zero', sobra_prevista: -200 }], tetos_semanais: [{ categoria: 'Mercado', valor: 150 }],
  regras_do_dia_a_dia: ['Abastecer uma vez por semana'], alertas: ['Falta lançar o mercado'], ...o,
})
const res = () => ({ status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } })

describe('limparPlanoVida', () => {
  it('mantém o plano válido', () => {
    const p = limparPlanoVida(bom())
    expect(p.meta).toEqual({ sobra_mensal_alvo: 300, mes_de_volta_ao_azul: '2027-03' })
    expect(p.acoes[0]).toEqual(acao())
    expect(p.cronograma).toEqual([{ mes: '2026-11', objetivo: 'Fechar no zero', sobra_prevista: -200 }])
  })
  it('limpa o que vem torto', () => {
    const p = limparPlanoVida(bom({ situacao: 'x', meta: { sobra_mensal_alvo: 'abc', mes_de_volta_ao_azul: '2027-13' }, acoes: [acao({ tipo: 'inventado', valor: 1e12 }), acao({ acao: ' ' })], cronograma: [{ mes: 'jan', objetivo: 'x', sobra_prevista: 1 }], tetos_semanais: [{ categoria: 'A', valor: -5 }] }))
    expect(p.situacao).toBe('apertado')
    expect(p.meta).toEqual({ sobra_mensal_alvo: null, mes_de_volta_ao_azul: null })
    expect(p.acoes).toHaveLength(1)
    expect(p.acoes[0]).toMatchObject({ tipo: 'outro', valor: null })
    expect(p.cronograma).toEqual([])
    expect(p.tetos_semanais).toEqual([])
  })
  it('sem ações: null', () => {
    expect(limparPlanoVida(null)).toBeNull()
    expect(limparPlanoVida(bom({ acoes: [] }))).toBeNull()
  })
})

describe('expert', () => {
  it('manda o contexto e lê o JSON; resposta cortada vira null', async () => {
    let enviado
    const client = { messages: { create: async (a) => { enviado = a; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(bom()) }] } } } }
    const p = await criarExpert('k', { client }).plano({ meses: [{ mes: '2026-10', sobra_real: -200 }] })
    expect(enviado.messages[0].content).toContain('"sobra_real":-200')
    expect(enviado.system).toContain('SOMENTE números')
    expect(p.acoes).toHaveLength(1)
    const cortado = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [] }) } }
    expect(await criarExpert('k', { client: cortado }).plano({ meses: [] })).toBeNull()
  })
})

describe('rota expert-plano', () => {
  it('só POST e exige login', async () => {
    const r1 = res(); await rota({ method: 'GET', headers: {} }, r1); expect(r1.code).toBe(405)
    process.env.SUPABASE_URL = 'http://localhost:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    const r2 = res(); await rota({ method: 'POST', headers: {}, body: { contexto: { meses: [] } } }, r2); expect(r2.code).toBe(401)
  })
})

describe('perguntas ao expert', () => {
  it('limparResposta', async () => {
    const { limparResposta } = await import('../expertPlano.js')
    expect(limparResposta({ veredito: 'pode', resposta: ' Cabe: sobram R$ 40 no mercado. ', impacto: 'resta R$ 40' })).toEqual({ veredito: 'pode', resposta: 'Cabe: sobram R$ 40 no mercado.', impacto: 'resta R$ 40' })
    expect(limparResposta({ veredito: 'xpto', resposta: 'ok', impacto: null }).veredito).toBe('informacao')
    expect(limparResposta({ resposta: '  ' })).toBeNull()
    expect(limparResposta(null)).toBeNull()
  })
  it('perguntar manda a semana no prompt e a rota responde', async () => {
    let enviado
    const client = { messages: { create: async (a) => { enviado = a; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ veredito: 'com_cuidado', resposta: 'Cabe, mas aperta.', impacto: null }) }] } } } }
    const r = await criarExpert('k', { client }).perguntar({ semana_atual: { total: { resta: 120 } }, meses: [] }, 'posso gastar 100 no mercado?')
    expect(enviado.system).toContain('CURTO')
    expect(enviado.messages[0].content).toContain('"resta":120')
    expect(enviado.messages[0].content).toContain('posso gastar 100 no mercado?')
    expect(r.veredito).toBe('com_cuidado')
    const cortado = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [] }) } }
    expect(await criarExpert('k', { client: cortado }).perguntar({ meses: [] }, 'x')).toBeNull()
  })
  it('rota: com pergunta devolve a resposta; sem login, 401', async () => {
    process.env.SUPABASE_URL = 'http://localhost:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    const r1 = res(); await rota({ method: 'POST', headers: {}, body: { contexto: { meses: [] }, pergunta: 'x' } }, r1); expect(r1.code).toBe(401)
  })
})
