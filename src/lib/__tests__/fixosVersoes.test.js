import { describe, it, expect } from 'vitest'
import { agruparVersoes, unirValores, chaveConta } from '../fixosVersoes'

const v1 = { id: 'a', nome: 'Condomínio', valor: 500, ativo: true, mes_inicio: null, mes_fim: '2026-09', pessoa: null }
const v2 = { id: 'b', nome: 'condominio', valor: 550, ativo: true, mes_inicio: '2026-10', mes_fim: null, pessoa: null }
const outra = { id: 'c', nome: 'Internet', valor: 100, ativo: true }

describe('versões de uma conta fixa', () => {
  it('nome sem acento/maiúscula e mesmo dono/cartão = mesma conta', () => {
    expect(chaveConta(v1)).toBe(chaveConta(v2))
    expect(chaveConta(v1)).not.toBe(chaveConta({ ...v2, pessoa: 'Gi' }))
  })
  it('agrupa e escolhe a versão que vale no mês', () => {
    const g = agruparVersoes([v1, outra, v2], '2026-10')
    expect(g).toHaveLength(2)
    const c = g.find((x) => x.principal.nome.toLowerCase().startsWith('cond'))
    expect(c.principal.id).toBe('b')
    expect(c.versoes.map((x) => x.id)).toEqual(['a', 'b'])
    expect(agruparVersoes([v1, v2], '2026-08')[0].principal.id).toBe('a')
  })
  it('conta encerrada mostra a última versão', () => {
    expect(agruparVersoes([{ ...v1 }], '2027-05')[0].principal.id).toBe('a')
  })
  it('valor real informado em uma versão vale para a conta toda (versão mais nova vence em conflito)', () => {
    const m = unirValores([v1, v2], new Map([['a', { '2026-09': 520, '2026-10': 530 }], ['b', { '2026-10': 560 }]]))
    expect(m.get('b')).toEqual({ '2026-09': 520, '2026-10': 560 })
    expect(m.get('a')).toEqual({ '2026-09': 520, '2026-10': 560 })
    expect(m.has('c')).toBe(false)
  })
})
