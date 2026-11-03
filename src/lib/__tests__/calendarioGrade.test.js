import { describe, it, expect } from 'vitest'
import { grade } from '../calendario'

describe('grade do calendário', () => {
  const ev = (dia, pago = false, valor = 100) => ({ chave: `e${dia}`, dia, tipo: 'fixo', titulo: 'x', valor, pago, aba: 'pagamentos' })
  it('outubro de 2026 começa numa quinta e tem 31 dias em semanas de domingo a sábado', () => {
    const g = grade('2026-10', [], '2026-10-15')
    expect(g[0].slice(0, 4).every((c) => c === null)).toBe(true) // dom a qua vazios
    expect(g[0][4].dia).toBe(1)
    expect(g.flat().filter(Boolean)).toHaveLength(31)
    expect(g.every((s) => s.length === 7)).toBe(true)
  })
  it('estado do dia: atrasada (aberta e já venceu), aberta (futura), paga e vazio', () => {
    const g = grade('2026-10', [ev(5), ev(20), ev(10, true)], '2026-10-15').flat().filter(Boolean)
    const d = (n) => g.find((c) => c.dia === n)
    expect(d(5).estado).toBe('atrasada'); expect(d(20).estado).toBe('aberta'); expect(d(10).estado).toBe('paga'); expect(d(3).estado).toBeNull()
    expect(d(15).hoje).toBe(true)
  })
  it('mês passado em aberto: tudo atrasado; mês futuro: nada atrasado; soma do dia', () => {
    const passado = grade('2026-09', [ev(25)], '2026-10-15').flat().filter(Boolean)
    expect(passado.find((c) => c.dia === 25).estado).toBe('atrasada')
    const futuro = grade('2026-11', [ev(2, false, 50), ev(2, false, 70)], '2026-10-15').flat().filter(Boolean)
    expect(futuro.find((c) => c.dia === 2)).toMatchObject({ estado: 'aberta', total: 120 })
  })
})
