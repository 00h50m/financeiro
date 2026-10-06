import { describe, it, expect } from 'vitest'
import { mediaRecente, pendenciasValorVariavel } from '../fixosVariaveis'

const com = (f, valores) => Object.defineProperty({ ...f }, 'valores', { value: valores, enumerable: false })
const energia = com({ id: 1, nome: 'Energia', valor: 280, ativo: true, variavel: true, dia_vencimento: 10 }, { '2026-07': 300, '2026-08': 320, '2026-09': 340 })

describe('contas variáveis', () => {
  it('média dos últimos valores reais antes do mês', () => {
    expect(mediaRecente(energia, '2026-10')).toEqual({ media: 320, meses: 3 })
    expect(mediaRecente(energia, '2026-09', 2)).toEqual({ media: 310, meses: 2 })
    expect(mediaRecente(com({ id: 2 }, {}), '2026-10')).toBeNull()
  })
  it('vencida: este mês, passou do dia e ainda é estimativa', () => {
    const p = pendenciasValorVariavel([energia], '2026-10-15')
    expect(p.find((x) => x.mes === '2026-10')).toMatchObject({ tipo: 'vencida', diasAtraso: 5 })
    expect(pendenciasValorVariavel([energia], '2026-10-08').find((x) => x.mes === '2026-10')).toBeUndefined()
  })
  it('meses passados sem valor real aparecem; com valor real não', () => {
    const p = pendenciasValorVariavel([energia], '2026-10-05')
    expect(p).toEqual([])
    const semSet = com({ id: 1, nome: 'Energia', valor: 280, ativo: true, variavel: true }, { '2026-08': 320 })
    expect(pendenciasValorVariavel([semSet], '2026-10-05', { voltar: 2 }).map((x) => [x.mes, x.tipo])).toEqual([['2026-09', 'passado']])
  })
  it('conta fixa comum nunca gera pendência', () => {
    expect(pendenciasValorVariavel([{ id: 3, nome: 'Internet', valor: 100, ativo: true, dia_vencimento: 1 }], '2026-10-20')).toEqual([])
  })
})
