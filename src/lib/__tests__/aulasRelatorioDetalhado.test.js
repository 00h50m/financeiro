import { describe, it, expect } from 'vitest'
import { relatorioDetalhado, mesesEntre, csvDetalhado } from '../aulasRelatorioDetalhado'

const alunos = [
  { id: 'a', nome: 'Ana', serie: '3em', ativo: true, inicio: '2026-01-10', saida_prevista: '2026-12-20' },
  { id: 'b', nome: 'Bia', serie: '8ef', ativo: true, inicio: '2026-03-01' },
  { id: 'c', nome: 'Caio', ativo: false, inicio: '2025-01-01' },
]
const aula = (id, aluno, data, status = 'realizada', min = 60, valorHora = 10000, extra = {}) => ({ id, aluno_id: aluno, data, status, duracao_min: min, duracao_real_min: min, valor_hora_centavos: valorHora, ...extra })
const aulas = [
  aula(1, 'a', '2026-09-02'), aula(2, 'a', '2026-09-09'), aula(3, 'a', '2026-10-07'),
  aula(4, 'b', '2026-09-03', 'realizada', 90, 8000), aula(5, 'b', '2026-09-10', 'cancelada'),
  aula(6, 'b', '2026-10-08', 'realizada', 60, 8000, { origem: 'avulsa', historico: [{ tipo: 'remarcada' }] }),
]
const base = { alunos, aulas, fechamentos: [], pausas: [], de: '2026-09', ate: '2026-10', hoje: '2026-10-21' }

describe('relatório detalhado', () => {
  it('meses do período', () => { expect(mesesEntre('2026-11', '2027-02')).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']) })
  it('por aluno: valor, horas, R$/hora, cancelamento e % da receita', () => {
    const r = relatorioDetalhado(base)
    const ana = r.porAluno.find((p) => p.alunoId === 'a')
    expect(ana.valor).toBe(30000)
    expect(ana.minutos).toBe(180)
    expect(ana.porHora).toBe(10000)
    const bia = r.porAluno.find((p) => p.alunoId === 'b')
    expect(bia.canceladas).toBe(1)
    expect(bia.taxaCancel).toBeCloseTo(1 / 3, 5)
    expect(bia.remarcacoes).toBe(1)
    expect(bia.avulsas).toBe(1)
    expect(bia.valor).toBe(12000 + 8000)
    expect(r.porAluno.map((p) => p.nome)).toEqual(['Ana', 'Bia'])
    expect(ana.pctReceita + bia.pctReceita).toBeCloseTo(1, 5)
    expect(r.porAluno.some((p) => p.alunoId === 'c')).toBe(false)
  })
  it('por mês: valor, alunos e variação', () => {
    const r = relatorioDetalhado({ ...base, metaCentavos: 40000 })
    expect(r.meses.map((m) => m.valor)).toEqual([20000 + 12000, 10000 + 8000])
    expect(r.meses[0].alunos).toBe(2)
    expect(r.meses[1].variacao).toBeCloseTo((18000 - 32000) / 32000, 5)
    expect(r.meses[0].abaixoDaMeta).toBe(true)
  })
  it('por série agrupa e soma', () => {
    const r = relatorioDetalhado(base)
    expect(r.porSerie.map((g) => g.nome)).toEqual(['8º ano (fundamental)', '3º ano (médio)'])
    expect(r.porSerie[1].alunos).toBe(1)
  })
  it('risco de perda: 3º ano com saída próxima, com receita mensal e % do total', () => {
    const r = relatorioDetalhado({ ...base, hoje: '2026-10-21' })
    expect(r.risco.lista).toHaveLength(1)
    expect(r.risco.lista[0].nome).toBe('Ana')
    expect(r.risco.lista[0].nivel).toBe('alto')
    expect(r.risco.valorMensal).toBeGreaterThan(0)
    expect(r.risco.pct).toBeGreaterThan(0)
    expect(r.risco.pct).toBeLessThan(1)
  })
  it('aluno pausado entra no risco e CSV tem cabeçalho', () => {
    const r = relatorioDetalhado({ ...base, pausas: [{ aluno_id: 'b', inicio: '2026-10-15', fim: '2026-11-15' }] })
    expect(r.risco.lista.map((x) => x.nome)).toContain('Bia')
    expect(csvDetalhado(r, 'aluno').split('\n')[0]).toContain('Aluno;Série')
    expect(csvDetalhado(r, 'risco').split('\n').length).toBe(1 + r.risco.lista.length)
  })
})
