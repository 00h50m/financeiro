import { describe, it, expect } from 'vitest'
import { aulasPorMes, rendasComAulas, aulasAReceberPorMes, valorAlunoMes, pendenciasDoMes, montarFechamento, diferencaRecebimento, mensagemFechamento } from '../aulasFechamento.js'
import { resumoDoMes } from '../financeiro.js'

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
