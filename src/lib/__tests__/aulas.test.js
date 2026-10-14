import { describe, it, expect } from 'vitest'
import {
  datasDaSemanaNoMes, diaDaSemana, somarDias, valorAula, lerDuracao, textoDuracao, reaisParaCentavos, gerarOcorrencias, planejarGeracao,
  aulasDoMes, valorDaAula, duracaoEfetiva, patchRealizar, patchEncerrar, patchDesfazer, patchRemarcar, patchEditar, novaReposicao,
  novaAvulsa, reposicaoAtiva, pendenteDeAtualizacao, aulasParaNovoValor, afetadasPorMudanca, diferencaProgramacao, programacaoVigente,
  resumoMes, frasePrevistoRealizado, previstasNaPausa,
} from '../aulas'

const aluno = (o = {}) => ({ id: 'a1', nome: 'Ana', valor_hora_centavos: 12000, inicio: '2026-11-01', fim: null, ativo: true, inativado_em: null, ...o })
const prog = (o) => ({ id: 'p' + Math.random().toString(36).slice(2, 7), dia_semana: 2, horario: null, duracao_min: 60, vigencia_inicio: '2026-11-01', vigencia_fim: null, ...o })
const AGORA = '2026-11-10T12:00:00.000Z'

describe('calendário (data local, sem fuso)', () => {
  it('dia da semana e soma de dias não deslocam por fuso', () => {
    expect(diaDaSemana('2026-11-01')).toBe(0) // domingo
    expect(diaDaSemana('2026-11-03')).toBe(2) // terça
    expect(somarDias('2026-11-30', 1)).toBe('2026-12-01')
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('mês com quatro e com cinco ocorrências do mesmo dia', () => {
    expect(datasDaSemanaNoMes('2026-11', 2)).toEqual(['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24']) // 4 terças
    expect(datasDaSemanaNoMes('2026-11', 1)).toHaveLength(5) // 5 segundas (02,09,16,23,30)
    expect(datasDaSemanaNoMes('2026-11', 0)).toEqual(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29'])
  })
})

describe('dinheiro e duração', () => {
  it('valor = valor/hora × minutos ÷ 60, em centavos', () => {
    expect(valorAula(12000, 60)).toBe(12000)
    expect(valorAula(12000, 90)).toBe(18000)
    expect(valorAula(12000, 45)).toBe(9000)
    expect(valorAula(10000, 20)).toBe(3333) // 33,33
    expect(valorAula(9999, 45)).toBe(7499) // 74,9925 → 74,99
  })
  it('lê duração digitada', () => {
    expect(lerDuracao('90')).toBe(90)
    expect(lerDuracao('1h30')).toBe(90)
    expect(lerDuracao('1h')).toBe(60)
    expect(lerDuracao('1,5')).toBe(90)
    expect(lerDuracao('45min')).toBe(45)
    expect(lerDuracao('abc')).toBeNull()
    expect(lerDuracao('0')).toBeNull()
  })
  it('texto da duração', () => {
    expect(textoDuracao(60)).toBe('1h')
    expect(textoDuracao(90)).toBe('1h30')
    expect(textoDuracao(45)).toBe('45min')
    expect(textoDuracao(125)).toBe('2h05')
  })
  it('reais digitados viram centavos', () => {
    expect(reaisParaCentavos('120')).toBe(12000)
    expect(reaisParaCentavos('89,90')).toBe(8990)
    expect(reaisParaCentavos('1.234,56')).toBe(123456)
    expect(reaisParaCentavos('89.90')).toBe(8990) // ponto decimal
    expect(reaisParaCentavos('1.234')).toBe(123400) // ponto de milhar
    expect(reaisParaCentavos('R$ 120,50')).toBe(12050)
    expect(reaisParaCentavos('')).toBeNull()
    expect(reaisParaCentavos('abc')).toBeNull()
  })
})

describe('geração das aulas do mês', () => {
  const a = aluno()
  const ps = [
    prog({ id: 'ter', dia_semana: 2, horario: '15:00', duracao_min: 60 }),
    prog({ id: 'qui', dia_semana: 4, horario: '16:00', duracao_min: 90 }),
    prog({ id: 'dom', dia_semana: 0, duracao_min: 45 }),
  ]
  it('durações diferentes, domingo incluído e ordem por data', () => {
    const o = gerarOcorrencias(a, ps, '2026-11')
    expect(o.map((x) => [x.data, x.duracao_min])).toEqual([
      ['2026-11-01', 45], ['2026-11-03', 60], ['2026-11-05', 90], ['2026-11-08', 45], ['2026-11-10', 60], ['2026-11-12', 90],
      ['2026-11-15', 45], ['2026-11-17', 60], ['2026-11-19', 90], ['2026-11-22', 45], ['2026-11-24', 60], ['2026-11-26', 90], ['2026-11-29', 45],
    ])
  })
  it('sábado e mais de uma aula no mesmo dia', () => {
    const o = gerarOcorrencias(a, [prog({ id: 's', dia_semana: 6, horario: '09:00' }), prog({ id: 's2', dia_semana: 6, horario: '14:00' })], '2026-11')
    expect(o.filter((x) => x.data === '2026-11-07').map((x) => x.horario)).toEqual(['09:00', '14:00'])
    expect(o).toHaveLength(8) // 4 sábados × 2
  })
  it('não gera antes do início nem depois do término', () => {
    const p = [prog({ id: 't', dia_semana: 2 })]
    expect(gerarOcorrencias(aluno({ inicio: '2026-11-10' }), p, '2026-11').map((x) => x.data)).toEqual(['2026-11-10', '2026-11-17', '2026-11-24'])
    expect(gerarOcorrencias(aluno({ fim: '2026-11-17' }), p, '2026-11').map((x) => x.data)).toEqual(['2026-11-03', '2026-11-10', '2026-11-17'])
    expect(gerarOcorrencias(a, p, '2026-10')).toEqual([])
  })
  it('vigência da programação: mudança vale a partir da data e preserva o antes', () => {
    const antes = prog({ id: 'v1', dia_semana: 2, duracao_min: 60, vigencia_fim: '2026-11-09' })
    const depois = prog({ id: 'v2', dia_semana: 2, duracao_min: 90, vigencia_inicio: '2026-11-10' })
    expect(gerarOcorrencias(a, [antes, depois], '2026-11').map((x) => [x.data, x.duracao_min])).toEqual([
      ['2026-11-03', 60], ['2026-11-10', 90], ['2026-11-17', 90], ['2026-11-24', 90],
    ])
  })
  it('aluno inativo não gera previsão depois da data de inativação', () => {
    const p = [prog({ id: 't', dia_semana: 2 })]
    expect(gerarOcorrencias(aluno({ ativo: false, inativado_em: '2026-11-12' }), p, '2026-11').map((x) => x.data)).toEqual(['2026-11-03', '2026-11-10'])
    expect(gerarOcorrencias(aluno({ ativo: false, inativado_em: null }), p, '2026-11')).toEqual([])
  })
  it('regerar não duplica e preserva edições, cancelamentos e remarcações', () => {
    const p = [prog({ id: 't', dia_semana: 2, horario: '15:00' })]
    const novas = planejarGeracao(a, p, [], '2026-11')
    expect(novas).toHaveLength(4)
    expect(novas[0]).toMatchObject({ aluno_id: 'a1', programacao_id: 't', status: 'prevista', origem: 'recorrente', valor_hora_centavos: 12000, data_original: '2026-11-03' })
    // simula o banco: uma remarcada (data mudou), uma cancelada, uma editada
    const banco = novas.map((n, i) => ({ ...n, id: 'x' + i }))
    banco[0] = { ...banco[0], data: '2026-11-05' } // remarcada: a data original continua ocupada
    banco[1] = { ...banco[1], status: 'cancelada' }
    banco[2] = { ...banco[2], duracao_min: 90 }
    expect(planejarGeracao(a, p, banco, '2026-11')).toEqual([])
    // abrir de novo / atualizar / recalcular continua sem criar nada, mesmo com a programação nova mais tarde
    const mais = [...p, prog({ id: 'q', dia_semana: 4 })]
    expect(planejarGeracao(a, mais, banco, '2026-11')).toHaveLength(4) // só as quintas, que são novas
  })
  it('a aula remarcada para outro mês não recria a data original', () => {
    const p = [prog({ id: 't', dia_semana: 2 })]
    const banco = planejarGeracao(a, p, [], '2026-11').map((n, i) => ({ ...n, id: 'x' + i }))
    banco[3] = { ...banco[3], data: '2026-12-02' } // 24/11 foi para dezembro
    expect(planejarGeracao(a, p, banco, '2026-11')).toEqual([])
    expect(aulasDoMes(banco, '2026-11')).toHaveLength(3)
    expect(aulasDoMes(banco, '2026-12')).toHaveLength(1) // competência acompanha a nova data
  })
  it('programação vigente numa data', () => {
    const v1 = prog({ id: 'v1', vigencia_fim: '2026-11-09' }); const v2 = prog({ id: 'v2', vigencia_inicio: '2026-11-10' })
    expect(programacaoVigente([v1, v2], '2026-11-05').map((p) => p.id)).toEqual(['v1'])
    expect(programacaoVigente([v1, v2], '2026-11-20').map((p) => p.id)).toEqual(['v2'])
  })
})

describe('estados da aula e valores', () => {
  const base = { id: 'x', aluno_id: 'a1', data: '2026-11-03', data_original: '2026-11-03', duracao_min: 60, valor_hora_centavos: 12000, status: 'prevista', origem: 'recorrente', historico: [] }
  it('realizada com duração diferente da prevista usa a efetiva', () => {
    const r = { ...base, ...patchRealizar(base, 90, AGORA) }
    expect(r).toMatchObject({ status: 'realizada', duracao_real_min: 90, valor_centavos: 18000, confirmada_em: AGORA })
    expect(duracaoEfetiva(r)).toBe(90)
    expect(valorDaAula(r)).toBe(18000)
    expect(valorDaAula(base)).toBe(12000) // prevista: calculada com a prevista
  })
  it('valor de aula realizada fica preservado quando o valor/hora do aluno muda', () => {
    const r = { ...base, ...patchRealizar(base, 60, AGORA) }
    const futura = { ...base, id: 'y', data: '2026-11-17' }
    const alvo = aulasParaNovoValor([r, futura], 'a1', '2026-11-10')
    expect(alvo.map((a) => a.id)).toEqual(['y']) // só a prevista futura
    expect(valorDaAula(r)).toBe(12000)
  })
  it('valor/hora só desta aula não é trocado pelo novo valor do aluno', () => {
    const a = { ...base, ...patchEditar(base, { valor_hora_centavos: 15000 }, AGORA) }
    expect(a.valor_hora_manual).toBe(true)
    expect(valorDaAula(a)).toBe(15000)
    expect(aulasParaNovoValor([a], 'a1', '2026-01-01')).toEqual([])
  })
  it('cancelada e não realizada ficam no histórico, sem cobrança, com quem e motivo', () => {
    const c = { ...base, ...patchEncerrar(base, 'cancelada', { quem: 'aluno', motivo: 'gripe' }, AGORA) }
    expect(c).toMatchObject({ status: 'cancelada', quem: 'aluno', motivo: 'gripe', valor_centavos: null })
    expect(c.historico).toHaveLength(1)
    const n = { ...base, ...patchEncerrar(base, 'nao_realizada', { quem: 'professora' }, AGORA) }
    expect(n.status).toBe('nao_realizada')
    expect(resumoMes([c, n]).apurado).toBe(0)
    expect(resumoMes([c, n]).previsto).toBe(0)
  })
  it('data passada não muda o status sozinha: fica pendente de atualização', () => {
    expect(pendenteDeAtualizacao(base, '2026-11-10')).toBe(true)
    expect(pendenteDeAtualizacao(base, '2026-11-03')).toBe(false)
    expect(base.status).toBe('prevista')
    expect(pendenteDeAtualizacao({ ...base, status: 'cancelada' }, '2026-11-10')).toBe(false)
  })
  it('remarcar mantém a mesma aula, a data original e o histórico (dentro do mês e entre meses)', () => {
    const r1 = { ...base, ...patchRemarcar(base, '2026-11-05', { motivo: 'prova' }, AGORA) }
    expect(r1).toMatchObject({ data: '2026-11-05', data_original: '2026-11-03', status: 'prevista' })
    expect(r1.historico[0]).toMatchObject({ tipo: 'remarcada', de: '2026-11-03', para: '2026-11-05', motivo: 'prova' })
    const r2 = { ...r1, ...patchRemarcar(r1, '2026-12-01', {}, AGORA) }
    expect(r2.data_original).toBe('2026-11-03')
    expect(r2.historico).toHaveLength(2)
    expect(aulasDoMes([r2], '2026-11')).toHaveLength(0)
    expect(aulasDoMes([r2], '2026-12')).toHaveLength(1)
    expect(() => patchRemarcar({ ...base, status: 'realizada' }, '2026-11-09', {}, AGORA)).toThrow()
  })
  it('editar só registra o que mudou e devolve null sem mudança', () => {
    expect(patchEditar(base, { data: '2026-11-03', duracao_min: 60 }, AGORA)).toBeNull()
    const p = patchEditar(base, { horario: '16:00', observacao: 'trazer caderno' }, AGORA)
    expect(p).toMatchObject({ horario: '16:00', observacao: 'trazer caderno' })
    expect(p.historico[0].campos).toEqual(['horario', 'observacao'])
  })
  it('editar a duração efetiva de uma realizada recalcula o valor', () => {
    const r = { ...base, ...patchRealizar(base, 60, AGORA) }
    const e = patchEditar(r, { duracao_real_min: 45 }, AGORA)
    expect(e.valor_centavos).toBe(9000)
  })
  it('desfazer volta a prevista e limpa o valor', () => {
    const r = { ...base, ...patchRealizar(base, 60, AGORA) }
    expect({ ...r, ...patchDesfazer(r, AGORA) }).toMatchObject({ status: 'prevista', valor_centavos: null, duracao_real_min: null })
  })
  it('aula avulsa fora da programação', () => {
    const av = novaAvulsa(aluno(), { data: '2026-11-14', duracao_min: 60 })
    expect(av).toMatchObject({ origem: 'avulsa', status: 'prevista', programacao_id: null, valor_hora_centavos: 12000 })
    expect(valorDaAula({ ...av, id: 'z' })).toBe(12000)
  })
  it('reposição: só de cancelada/não realizada, vinculada, e só ela é cobrada', () => {
    const canc = { ...base, ...patchEncerrar(base, 'cancelada', { quem: 'aluno' }, AGORA) }
    expect(() => novaReposicao(base, aluno(), { data: '2026-11-12', duracao_min: 60 })).toThrow()
    const rep = { ...novaReposicao(canc, aluno(), { data: '2026-11-12', duracao_min: 60 }), id: 'rep' }
    expect(rep).toMatchObject({ origem: 'reposicao', reposicao_de: 'x', status: 'prevista' })
    expect(reposicaoAtiva(canc, [canc, rep]).id).toBe('rep')
    const feita = { ...rep, ...patchRealizar(rep, 60, AGORA) }
    const r = resumoMes([canc, feita])
    expect(r.realizadas).toBe(1)
    expect(r.canceladas).toBe(1)
    expect(r.apurado).toBe(12000) // cobra uma vez só
    expect(r.minutosRealizados).toBe(60)
    expect(r.reposicoes).toBe(1)
  })
})

describe('mudança de programação', () => {
  it('mostra o que sai e o que entra', () => {
    const atuais = [prog({ dia_semana: 2, duracao_min: 60 }), prog({ dia_semana: 4, duracao_min: 90 })]
    const novas = [{ dia_semana: 2, horario: null, duracao_min: 60 }, { dia_semana: 4, horario: null, duracao_min: 60 }, { dia_semana: 0, horario: null, duracao_min: 45 }]
    const d = diferencaProgramacao(atuais, novas)
    expect(d.sai.map((l) => l.dia_semana)).toEqual([4])
    expect(d.entra.map((l) => [l.dia_semana, l.duracao_min])).toEqual([[4, 60], [0, 45]])
    expect(d.fica).toHaveLength(1)
  })
  it('afetadas: as intactas podem ser recriadas; editadas e remarcadas ficam; realizadas nunca', () => {
    const mk = (id, o = {}) => ({ id, aluno_id: 'a1', programacao_id: 'p1', origem: 'recorrente', status: 'prevista', data_original: '2026-11-17', data: '2026-11-17', historico: [], ...o })
    const aulas = [
      mk('intacta'), mk('editada', { historico: [{ tipo: 'editada' }] }), mk('realizada', { status: 'realizada' }),
      mk('antiga', { data_original: '2026-11-03' }), mk('outra-prog', { programacao_id: 'p9' }),
    ]
    const r = afetadasPorMudanca(aulas, 'a1', ['p1'], '2026-11-10')
    expect(r.removiveis.map((a) => a.id)).toEqual(['intacta'])
    expect(r.preservadas.map((a) => a.id)).toEqual(['editada'])
  })
})

describe('resumo do mês (previsto inicial, apurado, comparação)', () => {
  const mk = (id, data, status, extra = {}) => ({ id, aluno_id: 'a1', data, data_original: data, duracao_min: 60, valor_hora_centavos: 12000, status, origem: 'recorrente', historico: [], ...extra })
  const aulas = [
    mk('1', '2026-11-03', 'realizada', { duracao_real_min: 90, valor_centavos: 18000 }),
    mk('2', '2026-11-10', 'realizada', { duracao_real_min: 60, valor_centavos: 12000 }),
    mk('3', '2026-11-17', 'cancelada'),
    mk('4', '2026-11-24', 'nao_realizada'),
    mk('5', '2026-11-26', 'prevista', { origem: 'avulsa' }),
  ]
  const inicial = [{ aluno_id: 'a1', mes: '2026-11', qtd: 4, minutos: 240, valor_centavos: 48000 }]
  const r = resumoMes(aulas, inicial)
  it('contagens, horas e valores', () => {
    expect(r).toMatchObject({ previstas: 1, realizadas: 2, canceladas: 1, naoRealizadas: 1, minutosRealizados: 150, apurado: 30000, avulsas: 1, pendentes: 1 })
    expect(r.previsto).toBe(30000 + 12000) // apurado + a prevista que falta
    expect(r.inicial).toEqual({ qtd: 4, minutos: 240, valor: 48000 })
  })
  it('a previsão inicial não muda com cancelamentos', () => {
    const sem = resumoMes(aulas.map((a) => ({ ...a, status: 'cancelada' })), inicial)
    expect(sem.inicial.valor).toBe(48000)
    expect(sem.previsto).toBe(0)
  })
  it('frase de comparação', () => {
    const f = frasePrevistoRealizado(r)
    expect(f).toContain('Você começou o mês com 4 aulas previstas.')
    expect(f).toContain('Foram realizadas 2, cancelada 1, não realizada 1, ainda prevista 1.')
    expect(f).toContain('inicialmente previsto era')
    expect(frasePrevistoRealizado(resumoMes([], []))).toBe('')
  })
})

describe('períodos sem aula (férias e feriados)', () => {
  const al = { id: 'a1', nome: 'Lucas', ativo: true, inicio: '2026-09-01', valor_hora_centavos: 10000 }
  const prog = [{ id: 'p1', aluno_id: 'a1', dia_semana: 2, duracao_min: 60, vigencia_inicio: '2026-09-01' }] // terças de dezembro/26: 1, 8, 15, 22, 29
  it('não gera aulas dentro do período (todos ou só o aluno)', () => {
    const datas = (pausas) => gerarOcorrencias(al, prog, '2026-12', pausas).map((o) => o.data)
    expect(datas([])).toEqual(['2026-12-01', '2026-12-08', '2026-12-15', '2026-12-22', '2026-12-29'])
    expect(datas([{ aluno_id: null, inicio: '2026-12-15', fim: '2027-01-10' }])).toEqual(['2026-12-01', '2026-12-08'])
    expect(datas([{ aluno_id: 'outro', inicio: '2026-12-15', fim: '2027-01-10' }])).toHaveLength(5)
    expect(datas([{ aluno_id: 'a1', inicio: '2026-12-08', fim: '2026-12-08' }])).not.toContain('2026-12-08')
  })
  it('planejarGeracao respeita a pausa e ainda é idempotente', () => {
    const pausas = [{ aluno_id: null, inicio: '2026-12-15', fim: '2026-12-31' }]
    const novas = planejarGeracao(al, prog, [], '2026-12', pausas)
    expect(novas).toHaveLength(2)
    expect(planejarGeracao(al, prog, novas.map((n, i) => ({ ...n, id: String(i) })), '2026-12', pausas)).toHaveLength(0)
  })
  it('previstasNaPausa só pega previstas do escopo dentro do período', () => {
    const mk = (id, aluno, data, status = 'prevista') => ({ id, aluno_id: aluno, data, status })
    const aulas = [mk('1', 'a1', '2026-12-15'), mk('2', 'a2', '2026-12-16'), mk('3', 'a1', '2026-12-17', 'realizada'), mk('4', 'a1', '2027-01-20')]
    expect(previstasNaPausa(aulas, { aluno_id: null, inicio: '2026-12-10', fim: '2027-01-10' }).map((a) => a.id)).toEqual(['1', '2'])
    expect(previstasNaPausa(aulas, { aluno_id: 'a1', inicio: '2026-12-10', fim: '2027-01-10' }).map((a) => a.id)).toEqual(['1'])
  })
})
