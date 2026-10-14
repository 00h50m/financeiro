import { describe, it, expect } from 'vitest'
import { lerMeta, situacaoMeta, CHAVE_META_AULAS } from '../aulasMeta.js'

const aula = (id, status, min = 60, hora = 10000) => ({ id, status, data: '2026-10-06', duracao_min: min, duracao_real_min: status === 'realizada' ? min : null, valor_hora_centavos: hora, valor_centavos: status === 'realizada' ? (min * hora) / 60 : null })

describe('meta de renda das aulas', () => {
  it('lê a meta da config em reais (vazia = sem meta)', () => {
    expect(lerMeta({ [CHAVE_META_AULAS]: '4000' })).toBe(400000)
    expect(lerMeta({ [CHAVE_META_AULAS]: '1234,50' })).toBe(123450)
    expect(lerMeta({ [CHAVE_META_AULAS]: '' })).toBe(0)
    expect(lerMeta({})).toBe(0)
  })
  it('calcula o que falta em valor, horas e aulas', () => {
    const aulas = [aula('1', 'realizada'), aula('2', 'prevista'), aula('3', 'cancelada')]
    const s = situacaoMeta({ metaCentavos: 100000, previstoCentavos: 20000, apuradoCentavos: 10000, aulasMes: aulas })
    expect(s).toMatchObject({ falta: 80000, mediaHora: 10000, minutosFalta: 480, aulasFalta: 8, pctPrevisto: 20, pctApurado: 10, atingida: false })
  })
  it('meta atingida e limite de 100%', () => {
    const s = situacaoMeta({ metaCentavos: 50000, previstoCentavos: 70000, apuradoCentavos: 70000, aulasMes: [aula('1', 'realizada')] })
    expect(s).toMatchObject({ falta: 0, atingida: true, pctPrevisto: 100, aulasFalta: 0 })
  })
  it('mês sem aulas estima pelo valor/hora dos alunos ativos', () => {
    const s = situacaoMeta({ metaCentavos: 60000, previstoCentavos: 0, apuradoCentavos: 0, aulasMes: [], alunosAtivos: [{ valor_hora_centavos: 8000 }, { valor_hora_centavos: 12000 }] })
    expect(s).toMatchObject({ mediaHora: 10000, minutosFalta: 360, aulasFalta: 6 })
  })
  it('sem meta nada é calculado', () => {
    expect(situacaoMeta({ metaCentavos: 0, previstoCentavos: 5000, apuradoCentavos: 0 })).toMatchObject({ meta: 0, atingida: false, pctPrevisto: 0 })
  })
})
