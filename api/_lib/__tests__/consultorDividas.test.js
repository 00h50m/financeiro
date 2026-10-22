import { describe, it, expect } from 'vitest'
import { limparPlano, limparResposta, criarConsultor } from '../consultorDividas.js'
import rota from '../../consultor-dividas.js'

const passo = (o = {}) => ({ acao: 'Pagar o cartão primeiro', por_que: 'Juros mais altos', valor: 500, quando: '2026-11', ...o })
const bom = (o = {}) => ({ situacao: 'vermelho', resumo: 'Faltam R$ 300 por mês.', fase1: { titulo: 'Estabilizar', passos: [passo()] }, fase2: { titulo: 'Quitar', passos: [passo({ valor: null, quando: null })] }, tetos_semanais: [{ categoria: 'Mercado', valor: 150 }], alertas: ['Atenção ao mês 12'], ...o })
const res = () => ({ status(c) { this.code = c; return this }, json(b) { this.body = b; return this }, end() { return this } })

describe('limparPlano', () => {
  it('mantém o plano válido e limpa o que vem torto', () => {
    const p = limparPlano(bom())
    expect(p.situacao).toBe('vermelho')
    expect(p.fase1.passos[0]).toEqual({ acao: 'Pagar o cartão primeiro', por_que: 'Juros mais altos', valor: 500, quando: '2026-11' })
    expect(p.tetos_semanais).toEqual([{ categoria: 'Mercado', valor: 150 }])
    const sujo = limparPlano(bom({ situacao: 'xpto', tetos_semanais: [{ categoria: '', valor: 5 }, { categoria: 'A', valor: -1 }, { categoria: 'B', valor: 'x' }], fase1: { passos: [passo({ acao: '  ' }), passo({ valor: 1e12 })] } }))
    expect(sujo.situacao).toBe('apertado')
    expect(sujo.tetos_semanais).toEqual([])
    expect(sujo.fase1.passos).toHaveLength(1)
    expect(sujo.fase1.passos[0].valor).toBeNull()
  })
  it('sem passos ou lixo: null', () => {
    expect(limparPlano(null)).toBeNull()
    expect(limparPlano(bom({ fase1: { passos: [] }, fase2: { passos: [] } }))).toBeNull()
    expect(limparResposta({ resposta: '  ' })).toBeNull()
    expect(limparResposta({ resposta: 'Cortar 300 adianta 2 meses.', impacto: null })).toEqual({ resposta: 'Cortar 300 adianta 2 meses.', impacto: null })
  })
})

describe('consultor', () => {
  it('manda os números do app no prompt e lê o JSON', async () => {
    let enviado
    const client = { messages: { create: async (a) => { enviado = a; return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(bom()) }] } } } }
    const p = await criarConsultor('k', { client }).plano({ dividas: [{ nome: 'Cartão', saldo: 3000 }] })
    expect(enviado.messages[0].content).toContain('"saldo":3000')
    expect(enviado.system).toContain('SOMENTE números')
    expect(p.fase1.passos).toHaveLength(1)
  })
  it('pergunta usa o schema de resposta e resposta cortada vira null', async () => {
    const client = { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ resposta: 'Adianta 2 meses.', impacto: '+300/mês' }) }] }) } }
    expect((await criarConsultor('k', { client }).perguntar({ dividas: [] }, 'e se cortar lazer?')).impacto).toBe('+300/mês')
    const cortado = { messages: { create: async () => ({ stop_reason: 'max_tokens', content: [] }) } }
    expect(await criarConsultor('k', { client: cortado }).plano({ dividas: [] })).toBeNull()
  })
})

describe('rota consultor-dividas', () => {
  it('só POST e exige login', async () => {
    const r1 = res(); await rota({ method: 'GET', headers: {} }, r1); expect(r1.code).toBe(405)
    process.env.SUPABASE_URL = 'http://localhost:54321'; process.env.SUPABASE_SERVICE_ROLE_KEY = 'k'
    const r2 = res(); await rota({ method: 'POST', headers: {}, body: { contexto: { dividas: [] } } }, r2); expect(r2.code).toBe(401)
  })
})
