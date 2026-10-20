import { describe, it, expect } from 'vitest'
import { simularPlano, resumoDividas, compararEstrategias } from '../dividas.js'

const d = (id, saldo, parcela, juros, extra = {}) => ({ id, nome: id, saldo, parcela, juros_mes: juros, ativa: true, ...extra })

describe('plano de dívidas', () => {
  it('uma dívida sem juros quita em saldo / orçamento meses', () => {
    const r = simularPlano([d('a', 1000, 100, 0)], { orcamento: 250, inicio: '2026-11' })
    expect(r.livreEm).toBe(3) // 250 × 4 meses = 1000 -> índice 3
    expect(r.livreMes).toBe('2027-02')
    expect(r.jurosTotal).toBe(0)
    expect(r.pagoTotal).toBe(1000)
  })
  it('avalanche gasta menos juros que bola de neve quando a maior dívida tem juros maiores', () => {
    const ds = [d('cartao', 5000, 150, 6), d('boleto', 800, 50, 1)]
    const c = compararEstrategias(ds, { orcamento: 800, inicio: '2026-11' })
    expect(c.avalanche.livreEm).not.toBeNull()
    expect(c.bola.livreEm).not.toBeNull()
    expect(c.avalanche.jurosTotal).toBeLessThan(c.bola.jurosTotal)
    expect(c.avalanche.ordemQuitacao[0].nome).toBe('cartao') // o extra vai para os juros mais altos
    expect(c.bola.ordemQuitacao[0].nome).toBe('boleto') // o extra vai para o menor saldo
  })
  it('bola de neve quita primeiro a de menor saldo', () => {
    const ds = [d('grande', 3000, 0, 2), d('pequena', 300, 0, 0.5)]
    const r = simularPlano(ds, { estrategia: 'bola', orcamento: 400, inicio: '2026-11' })
    expect(r.ordemQuitacao[0].nome).toBe('pequena')
  })
  it('a parcela de uma dívida quitada é redirecionada para a próxima (efeito bola de neve)', () => {
    const ds = [d('a', 200, 100, 0), d('b', 1000, 100, 0)]
    const r = simularPlano(ds, { estrategia: 'bola', orcamento: 200, inicio: '2026-11' })
    // a quita no mês 0 (200), depois todo o orçamento vai para b: 1000 − 100 (mês 0) = 900 → 5 meses (200 cada) a partir do mês 1
    expect(r.ordemQuitacao.map((x) => x.nome)).toEqual(['a', 'b'])
    expect(r.livreEm).toBe(5)
  })
  it('orçamento por mês (sazonal): meses com zero atrasam a quitação', () => {
    const r = simularPlano([d('a', 600, 0, 0)], { orcamento: [300, 0, 0, 300], inicio: '2026-11' })
    expect(r.livreEm).toBe(3)
  })
  it('avisa os meses em que o orçamento não cobre os mínimos', () => {
    const r = simularPlano([d('a', 5000, 400, 1), d('b', 5000, 400, 1)], { orcamento: 500, inicio: '2026-11', meses: 3 })
    expect(r.faltas[0]).toMatchObject({ mes: 0, falta: 300 })
  })
  it('juros maiores que o pagamento: não quita no prazo', () => {
    const r = simularPlano([d('a', 10000, 50, 10)], { orcamento: 50, inicio: '2026-11' })
    expect(r.livreEm).toBeNull()
    expect(r.naoQuitam[0].nome).toBe('a')
    expect(r.naoQuitam[0].saldo).toBeGreaterThan(10000)
  })
  it('só o mínimo vira a referência de economia', () => {
    const c = compararEstrategias([d('a', 2000, 100, 3)], { orcamento: 400, inicio: '2026-11' })
    expect(c.minimos.livreEm).not.toBeNull()
    expect(c.avalanche.economia).toBeGreaterThan(0)
  })
  it('resumo soma saldo, mínimos e juros do mês; ignora inativas e zeradas', () => {
    const r = resumoDividas([d('a', 1000, 100, 2, { atrasada: true }), d('b', 500, 50, 0), d('c', 0, 10, 5), d('x', 900, 90, 1, { ativa: false })])
    expect(r).toEqual({ qtd: 2, total: 1500, minimos: 150, jurosMes: 20, atrasadas: 1 })
  })
  it('sem dívidas, já está livre', () => {
    expect(simularPlano([], { orcamento: 100, inicio: '2026-11' }).livreEm).toBe(0)
  })
})
