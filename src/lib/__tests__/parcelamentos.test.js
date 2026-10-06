import { describe, it, expect } from 'vitest'
import { calendarioQuitacao, terminandoLogo, simularQuitacao, parcelamentosAtivos } from '../parcelamentos'

const cartoes = [{ id: 'c1', nome: 'Nubank', fechamento: 31 }]
let n = 0
const compra = (o) => ({ id: 'k' + ++n, cartao_id: 'c1', descricao: 'X', data_compra: '2026-10-05', valor_total: 300, parcelas: 3, ...o })
const tv = compra({ descricao: 'TV', valor_total: 1200, parcelas: 12, data_compra: '2026-10-05' })
const pneu = compra({ descricao: 'Pneu', valor_total: 300, parcelas: 3, data_compra: '2026-09-05' }) // out, nov... fech 31 → set, out, nov
const avista = compra({ parcelas: 1 })

describe('parcelamentos', () => {
  it('só considera compras parceladas com parcela daqui para frente', () => {
    expect(parcelamentosAtivos([tv, pneu, avista], cartoes, '2026-10').map((c) => c.descricao)).toEqual(['TV', 'Pneu'])
    expect(parcelamentosAtivos([pneu], cartoes, '2026-12')).toEqual([])
  })
  it('calendário de quitação soma o mês e marca o que termina', () => {
    const cal = calendarioQuitacao([tv, pneu], cartoes, '2026-10', 3)
    expect(cal.map((m) => [m.mes, m.total, m.qtd])).toEqual([['2026-10', 200, 2], ['2026-11', 200, 2], ['2026-12', 100, 1]])
    expect(cal[1].terminam.map((c) => c.descricao)).toEqual(['Pneu'])
  })
  it('terminando logo: até N meses, com quanto libera', () => {
    const r = terminandoLogo([tv, pneu], cartoes, '2026-10', 2)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ termino: '2026-11', mesesRestantes: 1, parcelasRestantes: 2, libera: 100 })
    expect(terminandoLogo([tv, pneu], cartoes, '2026-11', 0).map((x) => x.compra.descricao)).toEqual(['Pneu'])
  })
  it('simular quitação: restante, libera por mês e economia quando o banco informa o valor', () => {
    const s = simularQuitacao(tv, cartoes, '2026-10', 950)
    expect(s).toMatchObject({ restante: 1200, parcelasRestantes: 12, libera: 100, valorBanco: 950, economia: 250 })
    expect(s.descontoPct).toBeCloseTo(20.83, 1)
    expect(simularQuitacao(tv, cartoes, '2026-10').economia).toBeNull()
  })
})
