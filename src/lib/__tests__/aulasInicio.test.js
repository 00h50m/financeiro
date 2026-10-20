import { describe, it, expect } from 'vitest'
import { cartaoAulasInicio } from '../aulasInicio.js'

const alunos = [{ id: 'a1', nome: 'Lucas', ativo: true }, { id: 'a2', nome: 'Ana', ativo: true }]
const aula = (id, aluno, data, status = 'prevista', horario = null) => ({ id, aluno_id: aluno, data, status, horario, duracao_min: 60, valor_hora_centavos: 10000 })
const base = (extra = {}) => ({ aulasOk: true, alunos, aulas: [], aulasFech: [], aulasMesBase: {}, inicioApp: '2026-10', ...extra })

describe('cartão de aulas no Início', () => {
  it('só aparece com alunos cadastrados e no mês atual', () => {
    expect(cartaoAulasInicio({ ...base(), alunos: [] }, '2026-10-15', '2026-10')).toBeNull()
    expect(cartaoAulasInicio({ ...base({ aulas: [aula('1', 'a1', '2026-10-15')] }) }, '2026-10-15', '2026-09')).toBeNull()
    expect(cartaoAulasInicio({ ...base(), aulasOk: false }, '2026-10-15', '2026-10')).toBeNull()
  })
  it('lista as aulas de hoje por horário e conta as de dias passados ainda previstas, sem contar as de hoje', () => {
    const d = base({ aulas: [aula('1', 'a1', '2026-10-15', 'prevista', '15:00'), aula('2', 'a2', '2026-10-15', 'prevista', '09:00'), aula('3', 'a1', '2026-10-13'), aula('4', 'a1', '2026-10-14'), aula('5', 'a1', '2026-10-16')] })
    const c = cartaoAulasInicio(d, '2026-10-15', '2026-10')
    expect(c.hoje.map((x) => x.aula.id)).toEqual(['2', '1'])
    expect(c.atrasadas).toBe(2)
  })
  it('traz o valor do mês e o que está fechado sem recebimento', () => {
    const d = base({ aulasMesBase: { '2026-10': { valor: 480, recebido: 0, aReceber: 480 } }, aulasFech: [{ aluno_id: 'a1', mes: '2026-09', status: 'fechado', valor_centavos: 32000, recebido: false }, { aluno_id: 'a2', mes: '2026-09', status: 'fechado', valor_centavos: 10000, recebido: true }] })
    const c = cartaoAulasInicio(d, '2026-10-15', '2026-10')
    expect(c.mes.aReceber).toBe(480)
    expect(c).toMatchObject({ aReceberFechado: 320, nFechadas: 1 })
  })
  it('sem nada para mostrar devolve null', () => {
    expect(cartaoAulasInicio(base(), '2026-10-15', '2026-10')).toBeNull()
  })
})
