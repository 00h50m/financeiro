import { describe, it, expect } from 'vitest'
import { semanaDe, tetosDaSemana, gastoPorCategoria, acompanhamentoSemana } from '../semanaPlano'

const c = (data_compra, categoria, valor_total, extra = {}) => ({ data_compra, categoria, valor_total, parcelas: 1, ...extra })
describe('semana do plano', () => {
  it('semana de segunda a domingo', () => {
    expect(semanaDe('2026-10-22')).toEqual({ inicio: '2026-10-19', fim: '2026-10-25', dia: 4, diasRestantes: 4 }) // quinta
    expect(semanaDe('2026-10-25')).toMatchObject({ inicio: '2026-10-19', dia: 7, diasRestantes: 1 }) // domingo
    expect(semanaDe('2026-10-19')).toMatchObject({ inicio: '2026-10-19', dia: 1, diasRestantes: 7 }) // segunda
  })
  it('tetos: do plano; sem plano, a média reservada', () => {
    expect(tetosDaSemana({ tetos_semanais: [{ categoria: 'Mercado', valor: 150 }] }, null)).toEqual([{ categoria: 'Mercado', valor: 150, origem: 'plano' }])
    expect(tetosDaSemana(null, { categorias: [{ categoria: 'Combustível', reservado: 400, porSemana: 92.31 }, { categoria: 'Lazer', reservado: 0, porSemana: 0 }] })).toEqual([{ categoria: 'Combustível', valor: 92.31, origem: 'media' }])
  })
  it('só conta compra à vista/1x, dentro da semana', () => {
    const g = gastoPorCategoria([c('2026-10-20', 'Mercado', 80), c('2026-10-21', 'Mercado', 40), c('2026-10-26', 'Mercado', 99), c('2026-10-20', 'Mercado', 500, { parcelas: 5 }), c('2026-10-22', 'Lazer', 30, { origem: 'recorrente' })], '2026-10-19', '2026-10-25')
    expect([...g]).toEqual([['Mercado', 120]])
  })
  it('acompanhamento: status por categoria, ritmo, sem teto e semanas anteriores', () => {
    const compras = [c('2026-10-19', 'Mercado', 130), c('2026-10-20', 'Combustível', 100), c('2026-10-21', 'Lazer', 70), c('2026-10-12', 'Mercado', 200), c('2026-10-05', 'Mercado', 50)]
    const r = acompanhamentoSemana({ compras, hoje: '2026-10-22', tetos: [{ categoria: 'mercado', valor: 150 }, { categoria: 'Combustível', valor: 300 }, { categoria: 'Alimentação', valor: 100 }] })
    const por = Object.fromEntries(r.itens.map((i) => [i.categoria, i]))
    expect(por['mercado']).toMatchObject({ gasto: 130, restante: 20, status: 'atencao' })
    expect(por['Combustível']).toMatchObject({ gasto: 100, status: 'ok', ritmo: false })
    expect(por['Alimentação']).toMatchObject({ gasto: 0, status: 'ok' })
    expect(r.semTeto).toEqual([{ categoria: 'Lazer', gasto: 70 }])
    expect(r.total).toMatchObject({ teto: 550, gasto: 300, restante: 250, status: 'ok' })
    expect(r.anteriores[0]).toMatchObject({ inicio: '2026-10-12', gasto: 200, status: 'ok' })
    expect(r.anteriores[1]).toMatchObject({ inicio: '2026-10-05', gasto: 50 })
    expect(r.anteriores[2]).toMatchObject({ inicio: '2026-09-28', gasto: 0 })
  })
  it('estourou e no ritmo de estourar', () => {
    const r = acompanhamentoSemana({ compras: [c('2026-10-19', 'Mercado', 160), c('2026-10-19', 'Lazer', 90)], hoje: '2026-10-20', tetos: [{ categoria: 'Mercado', valor: 150 }, { categoria: 'Lazer', valor: 200 }] })
    expect(r.itens.find((i) => i.categoria === 'Mercado').status).toBe('estourou')
    expect(r.itens.find((i) => i.categoria === 'Lazer').ritmo).toBe(true) // 90 em 2 dias → ~315 na semana
  })
})
