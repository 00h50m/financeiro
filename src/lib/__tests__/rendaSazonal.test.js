import { describe, it, expect } from 'vitest'
import { proximoFator, perfilDeLinhas, fatorDe, temPerfil, rendaPrevista, projecaoRenda, planoDeReserva } from '../rendaSazonal'

const renda = (mes, o = {}) => ({ mes, giovanna: 0, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0, ...o })

describe('fatores', () => {
  it('o toque alterna normal → 70% → 40% → 0 → normal', () => {
    expect([1, 0.7, 0.4, 0].map(proximoFator)).toEqual([0.7, 0.4, 0, 1])
  })
  it('perfil: sem registro vale 1', () => {
    const p = perfilDeLinhas([{ campo: 'sabrina', mes_do_ano: 1, fator: 0 }])
    expect(fatorDe(p, 'sabrina', '2027-01')).toBe(0)
    expect(fatorDe(p, 'sabrina', '2027-02')).toBe(1)
    expect(fatorDe(p, 'giovanna', '2027-01')).toBe(1)
    expect(temPerfil(p)).toBe(true)
    expect(temPerfil({})).toBe(false)
    expect(temPerfil(perfilDeLinhas([{ campo: 'sabrina', mes_do_ano: 3, fator: 1 }]))).toBe(false)
  })
})

describe('rendaPrevista', () => {
  const perfil = perfilDeLinhas([
    { campo: 'sabrina', mes_do_ano: 1, fator: 0 },
    { campo: 'sabrina', mes_do_ano: 7, fator: 0 },
    { campo: 'extra_sabrina', mes_do_ano: 1, fator: 0.4 },
    { campo: 'extra_sabrina', mes_do_ano: 12, fator: 0.4 },
  ])
  const rendas = [renda('2026-10', { giovanna: 5000, sabrina: 3000, extra_sabrina: 1000 })]
  it('mês cadastrado vale o cadastrado, sem estimar', () => {
    expect(rendaPrevista(rendas, perfil, '2026-10')).toEqual({ valor: 9000, estimada: false })
  })
  it('mês sem renda aplica o fator de cada fonte', () => {
    const jan = rendaPrevista(rendas, perfil, '2027-01')
    expect(jan.estimada).toBe(true)
    expect(jan.porCampo.sabrina).toBe(0)
    expect(jan.porCampo.extra_sabrina).toBe(400)
    expect(jan.valor).toBe(5000 + 0 + 400)
    expect(rendaPrevista(rendas, perfil, '2026-11').valor).toBe(9000)
  })
  it('desfaz o fator do mês cadastrado para achar o valor normal', () => {
    const r = [renda('2026-12', { giovanna: 5000, extra_sabrina: 400 })] // dezembro é 40%: o normal é 1000
    expect(rendaPrevista(r, perfil, '2027-02').porCampo.extra_sabrina).toBe(1000)
  })
  it('sem nenhuma renda antes não inventa valor', () => {
    expect(rendaPrevista([], perfil, '2027-01').valor).toBe(0)
  })
})

describe('projecaoRenda + planoDeReserva', () => {
  const cartoes = []
  const base = {
    cartoes, compras: [], faturas: [], fixosPagamentos: [], saldoAjustes: [], comprasPagamentos: [], comprasPagamentosOk: true,
    fixos: [{ id: 'f', nome: 'Aluguel', valor: 4000, dia_vencimento: 5, mes_inicio: '2026-01', ativo: true }],
    rendas: [renda('2026-10', { giovanna: 5000, sabrina: 3000 })],
  }
  const perfil = perfilDeLinhas([{ campo: 'sabrina', mes_do_ano: 1, fator: 0 }, { campo: 'sabrina', mes_do_ano: 2, fator: 0 }])
  const proj = projecaoRenda(base, perfil, '2026-10', 6)
  it('mostra o mês fraco no vermelho', () => {
    expect(proj.map((m) => m.sobra)).toEqual([4000, 4000, 4000, 1000, 1000, 4000]) // out, nov, dez, jan, fev, mar
    expect(proj[3].mes).toBe('2027-01')
    expect(proj[3].renda).toBe(5000)
  })
  it('plano quando o aluguel passa da renda dos meses fracos', () => {
    const forte = { ...base, fixos: [{ ...base.fixos[0], valor: 6000 }] }
    const p = projecaoRenda(forte, perfil, '2026-10', 6) // sobra: +2000 nos meses bons, -1000 em jan e fev
    const plano = planoDeReserva(p, 0)
    expect(plano.tem).toBe(true)
    expect(plano.mesesDeficit).toEqual(['2027-01', '2027-02'])
    expect(plano.buraco).toBe(2000)
    expect(plano.mesesAntes).toBe(3)
    expect(plano.porMes).toBeCloseTo(666.67, 1)
    expect(plano.sobraAntes).toBe(6000)
    expect(plano.cobreComSobras).toBe(true)
  })
  it('reserva atual abate o que precisa guardar', () => {
    const forte = { ...base, fixos: [{ ...base.fixos[0], valor: 6000 }] }
    const plano = planoDeReserva(projecaoRenda(forte, perfil, '2026-10', 6), 1500)
    expect(plano.precisa).toBe(500)
  })
  it('sem mês no vermelho não há plano', () => {
    expect(planoDeReserva(proj, 0)).toEqual({ tem: false })
  })
  it('dois períodos fracos têm planos separados (as sobras do meio cobrem o segundo)', () => {
    const meses = [
      { mes: '2026-10', sobra: 1000 }, { mes: '2026-11', sobra: 1000 },
      { mes: '2027-01', sobra: -1500 }, { mes: '2027-02', sobra: -500 },
      { mes: '2027-03', sobra: 3000 }, { mes: '2027-04', sobra: 3000 },
      { mes: '2027-07', sobra: -2000 },
    ]
    const p = planoDeReserva(meses, 0)
    expect(p.janelas).toHaveLength(2)
    expect(p.janelas[0]).toMatchObject({ buraco: 2000, mesesAntes: 2, porMes: 1000, sobraAntes: 2000, cobreComSobras: true, inicioGuardar: '2026-10', fimGuardar: '2026-11' })
    expect(p.janelas[1]).toMatchObject({ buraco: 2000, mesesAntes: 2, porMes: 1000, sobraAntes: 6000, cobreComSobras: true })
    expect(p.buraco).toBe(4000)
  })
  it('a reserva abate a primeira janela e o que sobra vai para a seguinte', () => {
    const meses = [{ mes: '2026-10', sobra: 500 }, { mes: '2026-11', sobra: -1000 }, { mes: '2026-12', sobra: 800 }, { mes: '2027-01', sobra: -1000 }]
    const p = planoDeReserva(meses, 1500)
    expect(p.janelas[0].precisa).toBe(0)
    expect(p.janelas[1].precisa).toBe(500)
    expect(p.precisa).toBe(500)
  })
  it('no vermelho já neste mês: não dá para guardar antes', () => {
    const plano = planoDeReserva([{ mes: '2026-10', sobra: -300 }, { mes: '2026-11', sobra: 500 }], 0)
    expect(plano.mesesAntes).toBe(0)
    expect(plano.porMes).toBeNull()
    expect(plano.cobreComSobras).toBe(false)
  })
})
