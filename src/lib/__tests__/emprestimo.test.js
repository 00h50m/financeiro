import { describe, it, expect } from 'vitest'
import { pmt, simular, cetMensal, taxaMensalDeAnual, taxaAnualDeMensal, impactoMensal, analisar, melhorInicio } from '../emprestimo'

describe('contas do empréstimo', () => {
  it('Price: 10.000 a 2% em 12x → parcela ~945,60; soma das amortizações fecha o principal', () => {
    expect(pmt(0.02, 12, 10000)).toBeCloseTo(945.596, 2)
    const s = simular({ valor: 10000, taxaMes: 0.02, prazo: 12 })
    expect(s.primeira).toBeCloseTo(945.6, 1)
    expect(s.parcelas.reduce((t, p) => t + p.amort, 0)).toBeCloseTo(10000, 1)
    expect(s.parcelas[11].saldo).toBe(0)
    expect(s.total).toBeCloseTo(945.6 * 12, 0)
  })
  it('sem custos extras, o CET é igual à taxa', () => {
    const s = simular({ valor: 10000, taxaMes: 0.02, prazo: 12 })
    expect(s.cetMes).toBeCloseTo(0.02, 4)
    expect(s.cetAno).toBeCloseTo(taxaAnualDeMensal(0.02), 3)
  })
  it('IOF, tarifa e seguro aumentam o CET', () => {
    const s = simular({ valor: 10000, taxaMes: 0.02, prazo: 12, iofPct: 3, tarifa: 200, seguroMes: 20 })
    expect(s.cetMes).toBeGreaterThan(0.02)
    expect(s.custo).toBeGreaterThan(simular({ valor: 10000, taxaMes: 0.02, prazo: 12 }).custo)
    expect(s.recebido).toBe(10000)
    expect(s.financiado).toBe(10500)
  })
  it('SAC: parcela inicial maior que a final e custo menor que Price', () => {
    const sac = simular({ valor: 10000, taxaMes: 0.02, prazo: 12, sistema: 'sac' })
    expect(sac.primeira).toBeGreaterThan(sac.ultima)
    expect(sac.custo).toBeLessThan(simular({ valor: 10000, taxaMes: 0.02, prazo: 12 }).custo)
  })
  it('entradas inválidas → null; taxa anual ↔ mensal', () => {
    expect(simular({ valor: 0, taxaMes: 0.02, prazo: 12 })).toBeNull()
    expect(simular({ valor: 1000, taxaMes: 0.02, prazo: 0 })).toBeNull()
    expect(taxaMensalDeAnual(0.2682)).toBeCloseTo(0.02, 3)
    expect(cetMensal(1000, [1000])).toBe(0)
  })
})

describe('análise: cabe no orçamento?', () => {
  const sim = simular({ valor: 6000, taxaMes: 0.02, prazo: 6 }) // parcela ~1071
  const dados = (renda, comp) => () => ({ renda, comprometido: comp })
  const rodar = (renda, comp, extra = {}) => analisar({ sim, primeiroMes: '2026-11', dadosDoMes: dados(renda, comp), rendaFallback: renda, ...extra })

  it('folgado: parcela pequena perto da renda → cabe', () => {
    const a = rodar(10000, 3000)
    expect(a.veredito).toBe('cabe')
    expect(a.meses).toHaveLength(6)
    expect(a.meses[0]).toMatchObject({ mes: '2026-11', sobraAntes: 7000 })
  })
  it('estoura o orçamento → não cabe e explica o pior mês', () => {
    const a = rodar(4000, 3500)
    expect(a.veredito).toBe('nao_cabe')
    expect(a.pontos.some((p) => p.tipo === 'ruim' && /negativo/.test(p.texto))).toBe(true)
  })
  it('parcela acima de 30% da renda mas sem estourar → apertado', () => {
    expect(rodar(3000, 1000).veredito).toBe('apertado')
  })
  it('sem renda cadastrada → não conclui', () => {
    expect(analisar({ sim, primeiroMes: '2026-11', dadosDoMes: dados(0, 500), rendaFallback: 0 }).veredito).toBe('sem_dados')
  })
  it('taxa alta gera alerta de cotar outras ofertas', () => {
    const cara = simular({ valor: 6000, taxaMes: 0.08, prazo: 6 })
    const a = analisar({ sim: cara, primeiroMes: '2026-11', dadosDoMes: dados(10000, 3000), rendaFallback: 10000 })
    expect(a.pontos.some((p) => /alta para crédito pessoal/.test(p.texto))).toBe(true)
  })
  it('prazos alternativos: o prazo atual aparece marcado e o mais longo tem parcela menor e custo maior', () => {
    const a = rodar(4000, 2500)
    const atual = a.alternativas.find((x) => x.atual)
    const p60 = a.alternativas.find((x) => x.prazo === 60)
    expect(atual.prazo).toBe(6)
    expect(p60.primeira).toBeLessThan(atual.primeira)
    expect(p60.custo).toBeGreaterThan(atual.custo)
  })
  it('melhor início: espera o mês em que passa a caber', () => {
    const dm = (mes) => ({ renda: 4000, comprometido: mes < '2027-02' ? 3500 : 1500 })
    const r = melhorInicio(sim, '2026-11', dm, 4000, 12)
    expect(r.inicio >= '2027-02').toBe(true)
    expect(melhorInicio(sim, '2026-11', () => ({ renda: 1000, comprometido: 990 }), 1000, 3)).toBeNull()
  })
  it('impactoMensal usa a renda de referência quando o mês futuro não tem renda', () => {
    const im = impactoMensal(sim, '2026-11', () => ({ renda: 0, comprometido: 100 }), 5000)
    expect(im[0]).toMatchObject({ renda: 5000, rendaEstimada: true })
  })
})

import { saldoDevedorEstimado, taxaDaObservacao } from '../emprestimo'
describe('quitar um empréstimo contratado', () => {
  it('saldo devedor estimado = valor presente das parcelas que faltam', () => {
    const s = simular({ valor: 10000, taxaMes: 0.02, prazo: 12 })
    // logo após pagar a 6ª parcela, faltam 6; o saldo devedor da tabela é o saldo depois da parcela 6
    const faltam = s.parcelas.slice(6).map((p) => p.valor)
    expect(saldoDevedorEstimado(faltam, 0.02)).toBeCloseTo(s.parcelas[5].saldo * 1.02, 0) // 1ª parcela que falta vence daqui a 1 mês: k=0 aqui, então vale saldo × (1+i)
    expect(saldoDevedorEstimado([], 0.02)).toBeNull()
  })
  it('lê a taxa gravada na observação', () => {
    expect(taxaDaObservacao('Empréstimo de R$ 10.000,00 · taxa 2,50% a.m. · CET 2,60% a.m.')).toBeCloseTo(0.025, 5)
    expect(taxaDaObservacao('sem taxa')).toBeNull()
  })
})
