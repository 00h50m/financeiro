import { describe, it, expect } from 'vitest'
import { sugerirTetos, arredondar10 } from '../orcamentoSugestao'

describe('sugestão de tetos', () => {
  const hist = { Mercado: [800, 820, 780, 800, 840, 760], Lazer: [0, 0, 0, 0, 0, 600], Saúde: [100, 0, 90, 110, 100, 100] }
  const r = sugerirTetos(hist, { Saúde: 50 })
  const por = (c) => r.find((x) => x.categoria === c)

  it('arredonda para cima de 10 em 10', () => { expect(arredondar10(879.9)).toBe(880); expect(arredondar10(880)).toBe(880); expect(arredondar10(881)).toBe(890) })
  it('média dos 3 últimos meses + 10% de folga', () => {
    expect(por('Mercado')).toMatchObject({ media3: 800, media6: 800, atual: 0, sugerido: 880, irregular: false, nota: 'sem teto ainda' })
  })
  it('gasto só em um mês é marcado como irregular', () => {
    expect(por('Lazer')).toMatchObject({ media3: 200, mesesComGasto: 1, irregular: true })
    expect(por('Lazer').nota).toMatch(/irregular/)
  })
  it('compara com o teto atual', () => {
    expect(por('Saúde').atual).toBe(50)
    expect(por('Saúde').nota).toBe('gastando acima do teto atual')
  })
  it('ordena pela maior média', () => { expect(r.map((x) => x.categoria)[0]).toBe('Mercado') })
})
