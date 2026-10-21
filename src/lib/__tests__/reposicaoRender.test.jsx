import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import ReposicaoSaidas from '../../components/aulas/ReposicaoSaidas'

describe('ReposicaoSaidas (render)', () => {
  it('renderiza sem saídas e com saídas', () => {
    const vazio = renderToString(<ReposicaoSaidas store={{ alunos: [], aulasProg: [] }} onClose={() => {}} />)
    expect(vazio).toContain('Nenhum aluno com saída prevista')
    const store = { alunos: [{ id: 'a', nome: 'Ana', ativo: true, valor_hora_centavos: 10000, serie: '3em' }], aulasProg: [{ aluno_id: 'a', dia_semana: 2, horario: '14:00', duracao_min: 60, vigencia_inicio: '2020-01-01', vigencia_fim: null }] }
    const html = renderToString(<ReposicaoSaidas store={store} onClose={() => {}} onSimular={() => {}} />)
    expect(html).toContain('quem sai e quando')
    expect(html).toContain('Ana')
  })
})
