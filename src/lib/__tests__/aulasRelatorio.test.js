import { describe, it, expect } from 'vitest'
import { relatorioAnual, csvRelatorio, anosComAulas } from '../aulasRelatorio.js'

const alunos = [{ id: 'a1', nome: 'Lucas' }, { id: 'a2', nome: 'Ana' }]
const aula = (id, aluno, data, status, min = 60) => ({ id, aluno_id: aluno, data, data_original: data, duracao_min: min, duracao_real_min: status === 'realizada' ? min : null, valor_hora_centavos: 10000, valor_centavos: status === 'realizada' ? (min * 10000) / 60 : null, status })
const aulas = [
  aula('1', 'a1', '2026-03-03', 'realizada'), aula('2', 'a1', '2026-03-10', 'realizada'), aula('3', 'a1', '2026-03-17', 'cancelada'),
  aula('4', 'a2', '2026-03-05', 'realizada', 90), aula('5', 'a1', '2026-07-07', 'realizada'),
  aula('6', 'a1', '2025-12-01', 'realizada'),
]

describe('relatório anual das aulas', () => {
  it('soma mês a mês e no ano, só do ano pedido', () => {
    const r = relatorioAnual(alunos, aulas, [], 2026)
    const mar = r.meses[2]
    expect(mar).toMatchObject({ realizadas: 3, canceladas: 1, minutos: 210, valor: 35000 })
    expect(r.total).toMatchObject({ realizadas: 4, valor: 45000 })
    expect(r.meses[0].temAulas).toBe(false)
  })
  it('marca meses fracos (abaixo de 60% da média dos meses com valor)', () => {
    const r = relatorioAnual(alunos, aulas, [], 2026)
    expect(r.media).toBe(22500)
    expect(r.fracos).toEqual(['2026-07']) // 10000 < 13500
  })
  it('filtra por aluno e mostra o total por aluno', () => {
    expect(relatorioAnual(alunos, aulas, [], 2026, 'a2').total.valor).toBe(15000)
    expect(relatorioAnual(alunos, aulas, [], 2026).porAluno.map((p) => [p.nome, p.valor])).toEqual([['Lucas', 30000], ['Ana', 15000]])
  })
  it('usa o fechamento (valor, recebimento e a receber)', () => {
    const f = [{ aluno_id: 'a1', mes: '2026-03', status: 'fechado', valor_centavos: 20000, recebido: true, recebido_centavos: 15000 }]
    const mar = relatorioAnual(alunos, aulas, f, 2026, 'a1').meses[2]
    expect(mar).toMatchObject({ valor: 20000, recebido: 15000, aReceber: 5000, fechado: true })
  })
  it('anos disponíveis e CSV', () => {
    expect(anosComAulas(aulas, 2026)).toEqual([2025, 2026])
    const csv = csvRelatorio(relatorioAnual(alunos, aulas, [], 2026))
    expect(csv.split('\n')[0]).toBe('Mês;Aulas realizadas;Horas;Canceladas/não realizadas;Valor;Recebido;A receber')
    expect(csv).toContain('Mar/2026;3;3,50;1;350,00;0,00;0,00')
  })
})

describe('relatório: mês vazio', () => {
  it('mês sem aulas não aparece como fechado', () => {
    expect(relatorioAnual(alunos, aulas, [], 2026).meses[0].fechado).toBe(false)
  })
})
