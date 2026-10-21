import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import SimuladorAluno from '../../components/aulas/SimuladorAluno'

describe('SimuladorAluno (render)', () => {
  it('renderiza com agenda e sem agenda', () => {
    const base = { definirConfig: () => {}, config: {} }
    const vazio = renderToString(<SimuladorAluno store={{ ...base, alunos: [], aulasProg: [] }} onClose={() => {}} />)
    expect(vazio).toContain('Posso aceitar mais um aluno?')
    const store = { ...base, config: { aulas_limite_horas_semana: '20' }, alunos: [{ id: 'a', nome: 'Ana', ativo: true, valor_hora_centavos: 10000 }], aulasProg: [{ aluno_id: 'a', dia_semana: 2, horario: '14:00', duracao_min: 60, vigencia_inicio: '2020-01-01', vigencia_fim: null }] }
    const html = renderToString(<SimuladorAluno store={store} metaCentavos={100000} onClose={() => {}} />)
    expect(html).toContain('Agenda hoje')
    expect(html).toContain('Horários livres')
  })
})
