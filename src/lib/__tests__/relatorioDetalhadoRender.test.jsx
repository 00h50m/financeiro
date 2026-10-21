import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import RelatorioDetalhado from '../../components/aulas/RelatorioDetalhado'

describe('RelatorioDetalhado (render)', () => {
  it('renderiza sem erro com e sem dados', () => {
    const vazio = renderToString(<RelatorioDetalhado store={{ alunos: [], aulas: [], aulasFech: [], aulasPausas: [] }} />)
    expect(vazio).toContain('Sem aulas nesse período')
    const store = { alunos: [{ id: 'a', nome: 'Ana', serie: '3em', ativo: true, inicio: '2026-01-10', saida_prevista: '2026-12-20' }], aulas: [{ id: 1, aluno_id: 'a', data: new Date().toISOString().slice(0, 10), status: 'realizada', duracao_min: 60, duracao_real_min: 60, valor_hora_centavos: 8000 }], aulasFech: [], aulasPausas: [] }
    const html = renderToString(<RelatorioDetalhado store={store} metaCentavos={100000} />)
    expect(html).toContain('Ana')
    expect(html).toContain('Receita em risco')
  })
})
