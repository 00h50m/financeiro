import { describe, it, expect } from 'vitest'
import { planoReposicao, saidaEfetiva } from '../aulasReposicao'
import { receitaMensal, agendaSemanal, SEMANAS_POR_MES } from '../aulasSimulador'

const prog = (aluno, dia, horario, duracao_min) => ({ aluno_id: aluno, dia_semana: dia, horario, duracao_min, vigencia_inicio: '2026-01-01', vigencia_fim: null })
const alunos = [
  { id: 'a', nome: 'Ana', ativo: true, valor_hora_centavos: 10000, serie: '3em' },
  { id: 'b', nome: 'Bia', ativo: true, valor_hora_centavos: 8000, serie: '8ef' },
  { id: 'c', nome: 'Caio', ativo: true, valor_hora_centavos: 9000, saida_prevista: '2027-03-15' },
]
const progs = [prog('a', 2, '14:00', 60), prog('a', 4, '14:00', 60), prog('b', 3, '16:00', 90), prog('c', 1, '10:00', 60)]
const hoje = '2026-10-21'

describe('reposição de saídas', () => {
  it('saída efetiva: prevista, estimada por série, ou nenhuma', () => {
    expect(saidaEfetiva(alunos[2], hoje)).toEqual({ data: '2027-03-15', estimada: false })
    expect(saidaEfetiva(alunos[0], hoje)).toEqual({ data: '2026-12-20', estimada: true })
    expect(saidaEfetiva(alunos[0], '2026-12-28').data).toBe('2027-12-20')
    expect(saidaEfetiva(alunos[1], hoje)).toBeNull()
  })
  it('perda, receita depois, linha do tempo e reposição', () => {
    const slots = agendaSemanal(alunos, progs, hoje)
    const p = planoReposicao({ alunos, programacoes: progs, hoje, valorHora: 10000, horasPorAluno: 120 })
    expect(p.receitaHoje).toBe(receitaMensal(slots))
    const perdaAna = Math.round(10000 * 2 * SEMANAS_POR_MES)
    const perdaCaio = Math.round(9000 * 1 * SEMANAS_POR_MES)
    expect(p.saidas.map((x) => x.nome)).toEqual(['Ana', 'Caio'])
    expect(p.saidas[0].receitaMensal).toBe(perdaAna)
    expect(p.perdaTotal).toBe(perdaAna + perdaCaio)
    expect(p.receitaDepois).toBe(p.receitaHoje - p.perdaTotal)
    // linha do tempo: Ana ainda dá aula em dez/2026, some em jan/2027; Caio some em abr/2027
    const mes = (m) => p.linhas.find((l) => l.mes === m)
    expect(mes('2026-12').perda).toBe(0)
    expect(mes('2027-01').perda).toBe(perdaAna)
    expect(mes('2027-04').perda).toBe(p.perdaTotal)
    expect(p.minutosVagos).toBe(180)
    expect(p.ganhoPorAluno).toBe(Math.round(10000 * 2 * SEMANAS_POR_MES))
    expect(p.alunosNecessarios).toBe(2) // 1,0x de Ana + Caio (~0,45x) = 1,45 → 2 alunos de 2 h
    expect(p.saidas[0].captarAte).toBe('2026-10')
    expect(p.saidas[0].alunosParaRepor).toBe(1)
    expect(p.semDataOuSerie).toBe(0) // todos têm série ou data de saída
  })
  it('sem saídas', () => {
    const p = planoReposicao({ alunos: [alunos[1]], programacoes: progs, hoje, valorHora: 10000 })
    expect(p.semSaidas).toBe(true)
    expect(p.perdaTotal).toBe(0)
    expect(p.alunosNecessarios).toBe(0)
  })
})
