import { describe, it, expect } from 'vitest'
import { saidaSugerida, riscoDeSaida, followupsPausa, saidasProximas, nomeSerie } from '../alunosCiclo'

describe('ciclo do aluno', () => {
  it('sugere dezembro só para quem termina o ciclo', () => {
    expect(saidaSugerida('3em', '2026-03-10')).toBe('2026-12-20')
    expect(saidaSugerida('pre', '2026-03-10')).toBe('2026-12-20')
    expect(saidaSugerida('8ef', '2026-03-10')).toBe('')
    expect(riscoDeSaida('3em')).toBe(true)
    expect(riscoDeSaida('1em')).toBe(false)
    expect(nomeSerie('3em')).toBe('3º ano (médio)')
  })
  const alunos = [{ id: 'a', nome: 'Ana', ativo: true }, { id: 'b', nome: 'Bia', ativo: false }]
  it('follow-up: pausa que termina em breve, atrasada ou já feita', () => {
    const pausas = [
      { id: 1, aluno_id: 'a', inicio: '2026-09-01', fim: '2026-10-25' },
      { id: 2, aluno_id: 'a', inicio: '2026-09-01', fim: '2026-12-30' },
      { id: 3, aluno_id: 'a', inicio: '2026-09-01', fim: '2026-10-10' },
      { id: 4, aluno_id: 'a', inicio: '2026-09-01', fim: '2026-10-25', followup_feito_em: '2026-10-20' },
      { id: 5, aluno_id: 'b', inicio: '2026-09-01', fim: '2026-10-25' },
      { id: 6, aluno_id: null, inicio: '2026-09-01', fim: '2026-10-25' },
    ]
    const r = followupsPausa(pausas, alunos, '2026-10-21')
    expect(r.map((x) => x.pausa.id)).toEqual([3, 1])
    expect(r[1].retorno).toBe('2026-10-26')
    expect(r[1].dias).toBe(5)
    expect(r[0].dias).toBeLessThan(0)
  })
  it('saídas próximas', () => {
    const r = saidasProximas([{ id: 'a', nome: 'Ana', saida_prevista: '2026-12-20' }, { id: 'b', nome: 'B', saida_prevista: '2027-06-01' }, { id: 'c', nome: 'C' }], '2026-11-10')
    expect(r.map((x) => x.aluno.id)).toEqual(['a'])
  })
})
