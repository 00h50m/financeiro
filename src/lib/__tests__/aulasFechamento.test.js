import { describe, it, expect } from 'vitest'
import { aulasPorMes, rendasComAulas, aulasAReceberPorMes, valorAlunoMes, pendenciasDoMes, montarFechamento, diferencaRecebimento, mensagemFechamento } from '../aulasFechamento.js'
import { resumoDoMes, rendaDoMes } from '../financeiro.js'
import { rendaPrevista } from '../rendaSazonal.js'

const al = { id: 'a1', nome: 'Lucas', responsavel: 'Marta Silva' }
const aula = (id, data, status, extra = {}) => ({ id, aluno_id: 'a1', data, data_original: data, horario: null, duracao_min: 60, duracao_real_min: status === 'realizada' ? 60 : null, valor_hora_centavos: 8000, valor_centavos: status === 'realizada' ? 8000 : null, status, origem: 'recorrente', historico: [], ...extra })
const aulas = [aula('1', '2026-10-06', 'realizada'), aula('2', '2026-10-13', 'prevista'), aula('3', '2026-10-20', 'cancelada'), aula('4', '2026-10-27', 'realizada', { origem: 'reposicao' })]

describe('fechamento das aulas', () => {
  it('pendência é só aula prevista', () => {
    expect(pendenciasDoMes(aulas, 'a1', '2026-10').map((a) => a.id)).toEqual(['2'])
  })
  it('foto do fechamento cobra só realizadas', () => {
    const f = montarFechamento(aulas, 'a1', '2026-10')
    expect(f.qtd_aulas).toBe(2)
    expect(f.valor_centavos).toBe(16000)
    expect(f.minutos).toBe(120)
  })
  it('mês aberto vale realizadas + previstas; fechado vale o snapshot; sem cobrança vale 0', () => {
    expect(valorAlunoMes(aulas, [], 'a1', '2026-10').valor).toBe(24000)
    const fechado = [{ aluno_id: 'a1', mes: '2026-10', status: 'fechado', valor_centavos: 16000 }]
    expect(valorAlunoMes(aulas, fechado, 'a1', '2026-10')).toMatchObject({ valor: 16000, aReceber: 16000 })
    expect(valorAlunoMes(aulas, [{ ...fechado[0], status: 'sem_cobranca' }], 'a1', '2026-10').valor).toBe(0)
  })
  it('recebimento reduz o a receber e não cria renda', () => {
    const f = [{ aluno_id: 'a1', mes: '2026-10', status: 'fechado', valor_centavos: 16000, recebido: true, recebido_centavos: 16000 }]
    const v = valorAlunoMes(aulas, f, 'a1', '2026-10')
    expect(v).toMatchObject({ valor: 16000, recebido: 16000, aReceber: 0 })
  })
  it('reabrir mês recebido mostra a diferença', () => {
    const f = { recebido: true, recebido_centavos: 16000, valor_centavos: 16000 }
    expect(diferencaRecebimento(f, 24000)).toBe(8000)
    expect(diferencaRecebimento(f, 8000)).toBe(-8000)
    expect(diferencaRecebimento({ recebido: false }, 24000)).toBe(0)
  })
})

describe('integração com a renda', () => {
  const porMes = aulasPorMes([al], aulas, [])
  it('soma em extra_sabrina sem alterar a renda digitada', () => {
    const manual = [{ id: 'r', mes: '2026-10', giovanna: 4500, sabrina: 0, extra_sabrina: 100, mesada: 0, outros: 0 }]
    const ef = rendasComAulas(manual, porMes)
    expect(ef.find((r) => r.mes === '2026-10').extra_sabrina).toBe(340)
    expect(manual[0].extra_sabrina).toBe(100)
  })
  it('mês sem renda cadastrada ganha linha só com as aulas', () => {
    const ef = rendasComAulas([], porMes)
    expect(ef).toHaveLength(1)
    expect(ef[0]).toMatchObject({ mes: '2026-10', extra_sabrina: 240, sintetica: true })
  })
  it('sem aulas devolve as rendas como estão', () => {
    const r = [{ mes: '2026-10', giovanna: 1 }]
    expect(rendasComAulas(r, {})).toBe(r)
  })
  it('disponível hoje não conta o a receber, mas a sobra projetada conta (competência)', () => {
    const d = { rendas: rendasComAulas([], porMes), aulasAReceber: aulasAReceberPorMes(porMes), fixos: [], faturas: [], compras: [], cartoes: [], fixosPagamentos: [], saldoAjustes: [], comprasPagamentos: [] }
    const com = resumoDoMes(d, '2026-10', { usarSaldoAnterior: false })
    const sem = resumoDoMes({ ...d, aulasAReceber: {} }, '2026-10', { usarSaldoAnterior: false })
    expect(com.renda).toBe(240)
    expect(com.disponivel).toBe(0)
    expect(sem.disponivel).toBe(240)
    expect(com.sobraProjetada).toBe(sem.sobraProjetada)
  })
})

describe('mensagem', () => {
  const f = montarFechamento(aulas, 'a1', '2026-10')
  it('lista só realizadas e não vaza observação interna', () => {
    const m = mensagemFechamento(al, '2026-10', f.itens, f.valor_centavos, { aulasMes: [{ ...aulas[0], observacao: 'segredo interno' }] })
    expect(m).toContain('Olá, Marta!')
    expect(m).toContain('06/10')
    expect(m).not.toContain('20/10')
    expect(m).not.toContain('segredo')
    expect(m).toContain('2 aulas')
  })
  it('resumo opcional traz cancelamentos e reposições', () => {
    const m = mensagemFechamento(al, '2026-10', f.itens, f.valor_centavos, { resumo: true, aulasMes: aulas })
    expect(m).toContain('sem cobrança): 20/10')
    expect(m).toContain('Reposições realizadas: 27/10')
  })
})

describe('projeção das aulas nos meses à frente', () => {
  const aluno = { id: 'a1', nome: 'Lucas', ativo: true, inicio: '2026-09-01', valor_hora_centavos: 10000 }
  const prog = [{ id: 'p1', aluno_id: 'a1', dia_semana: 2, duracao_min: 60, vigencia_inicio: '2026-09-01' }] // terças
  it('mês sem aulas geradas vem da programação semanal e é marcado como projetado', () => {
    const m = aulasPorMes([aluno], [], [], { programacoes: prog, desde: '2026-11', meses: 3 })
    expect(m['2026-11']).toMatchObject({ valor: 400, projetada: true }) // 4 terças em nov/26
    expect(m['2026-12'].valor).toBe(500) // 5 terças em dez/26
    expect(m['2026-10']).toBeUndefined() // antes de `desde` nada é projetado
  })
  it('mês com aulas geradas usa o que existe, não a projeção', () => {
    const real = [{ id: 'x', aluno_id: 'a1', data: '2026-11-03', data_original: '2026-11-03', duracao_min: 60, valor_hora_centavos: 10000, status: 'prevista' }]
    const m = aulasPorMes([aluno], real, [], { programacoes: prog, desde: '2026-11', meses: 2 })
    expect(m['2026-11']).toMatchObject({ valor: 100, projetada: false })
  })
  it('sem `desde` não projeta (comportamento do passo 2)', () => {
    expect(aulasPorMes([aluno], [], [], { programacoes: prog })).toEqual({})
  })
  it('aulas projetadas não fazem o mês parecer cadastrado: salário continua estimado', () => {
    const manual = [{ mes: '2026-10', giovanna: 4000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }]
    const m = aulasPorMes([aluno], [], [], { programacoes: prog, desde: '2026-11', meses: 2 })
    const rs = rendasComAulas(manual, m)
    const nov = rendaDoMes(rs, '2026-11', { estimar: true })
    expect(nov).toEqual({ valor: 4400, estimada: true })
    expect(rendaPrevista(rs, {}, '2026-11')).toMatchObject({ valor: 4400, estimada: true })
    expect(rendaDoMes(rs, '2026-11').valor).toBe(400) // sem estimar: só as aulas
  })
  it('mês com renda digitada soma as aulas por cima', () => {
    const manual = [{ mes: '2026-11', giovanna: 4000, extra_sabrina: 100, mesada: 0, outros: 0, sabrina: 0 }]
    const rs = rendasComAulas(manual, aulasPorMes([aluno], [], [], { programacoes: prog, desde: '2026-11', meses: 1 }))
    expect(rendaDoMes(rs, '2026-11')).toEqual({ valor: 4500, estimada: false })
  })
})

describe('projeção respeita períodos sem aula', () => {
  it('férias tiram as aulas do mês projetado', () => {
    const al = { id: 'a1', nome: 'Lucas', ativo: true, inicio: '2026-09-01', valor_hora_centavos: 10000 }
    const prog = [{ id: 'p1', aluno_id: 'a1', dia_semana: 2, duracao_min: 60, vigencia_inicio: '2026-09-01' }]
    const pausas = [{ aluno_id: null, inicio: '2027-01-01', fim: '2027-01-31' }]
    expect(aulasPorMes([al], [], [], { programacoes: prog, pausas, desde: '2026-12', meses: 3 })['2027-01']).toBeUndefined()
    expect(aulasPorMes([al], [], [], { programacoes: prog, pausas, desde: '2026-12', meses: 3 })['2027-02'].valor).toBe(400)
  })
})
