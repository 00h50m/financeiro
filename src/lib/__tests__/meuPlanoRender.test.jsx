import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('../automacoes', () => ({ pedirExpertPlano: async () => ({ ok: false, erro: 'x' }) }))
import MeuPlano from '../../components/MeuPlano'

const plano = {
  situacao: 'vermelho', resumo: 'Faltam R$ 800 por mês.', diagnostico: ['Parcelas somam R$ 3.000'], meta: { sobra_mensal_alvo: 300, mes_de_volta_ao_azul: '2027-03' },
  acoes: [{ acao: 'Adiar o seguro', por_que: 'Evita estourar', tipo: 'adiar', valor: 400, quando: '2026-11' }], cronograma: [{ mes: '2026-11', objetivo: 'Fechar no zero', sobra_prevista: -200 }],
  tetos_semanais: [{ categoria: 'Mercado', valor: 150 }], regras_do_dia_a_dia: ['Abastecer uma vez por semana'], alertas: ['Falta lançar o mercado'],
}
const base = { rendas: [], rendaSazonal: [], compras: [], cartoes: [], fixos: [], faturas: [], adiamentos: [], fixosPagamentos: [], comprasPagamentos: [], dividas: [], config: {}, configOk: true, salvarPlanoVida: () => {} }
describe('MeuPlano (render)', () => {
  it('sem plano e sem a tabela: convite e aviso do SQL', () => {
    const html = renderToString(<MeuPlano store={{ ...base, planosVida: [], planosVidaOk: false }} />)
    expect(html).toContain('Montar meu plano')
    expect(html).toContain('inbox/36_planos_vida.sql')
  })
  it('com plano salvo: mostra ações, cronograma, tetos e histórico', () => {
    const html = renderToString(<MeuPlano store={{ ...base, planosVidaOk: true, planosVida: [
      { id: '1', criado_em: '2026-10-22T10:00:00Z', ativo: true, resumo: 'Atual', plano, snapshot: { sobra_real_media_12m: -300, meses_no_vermelho: 5 } },
      { id: '2', criado_em: '2026-09-20T10:00:00Z', ativo: false, resumo: 'Antigo', plano, snapshot: null },
    ] }} />)
    expect(html).toContain('Revisar meu plano')
    expect(html).toContain('Adiar o seguro')
    expect(html).toContain('Fechar no zero')
    expect(html).toContain('Mercado')
    expect(html).toContain('histórico de planos')
  })
})

describe('MeuPlano: acompanhamento da semana', () => {
  it('mostra o gasto da semana contra o teto do plano e o campo de perguntas', () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const plano2 = { ...plano, tetos_semanais: [{ categoria: 'Mercado', valor: 200 }] }
    const store = { ...base, planosVidaOk: true, planosVida: [{ id: '1', criado_em: '2026-10-22T10:00:00Z', ativo: true, resumo: 'Atual', plano: plano2, snapshot: null }],
      compras: [{ id: 1, data_compra: hoje, categoria: 'Mercado', valor_total: 80, parcelas: 1 }] }
    const html = renderToString(<MeuPlano store={store} />).replace(/<!-- -->/g, '')
    expect(html).toContain('esta semana')
    expect(html).toContain('Mercado')
    expect(html).toContain('do seu plano')
    expect(html).toContain('Pergunte antes de gastar')
  })
  it('sem plano usa a média reservada e avisa', () => {
    const html = renderToString(<MeuPlano store={{ ...base, planosVidaOk: true, planosVida: [] }} />)
    expect(html).toContain('Ainda não há tetos por semana')
  })
})
