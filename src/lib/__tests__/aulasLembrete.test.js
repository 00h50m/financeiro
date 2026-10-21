import { describe, it, expect } from 'vitest'
import { pendenciasDeAulas, textoLembreteAulas } from '../aulasLembrete.js'
import { enviarLembretesAulas } from '../../../api/_lib/lembreteAulas.js'
import { processarUpdate } from '../../../api/_lib/bot.js'
import { criarFakeDb, criarFakeTg, msg, GI } from '../../../api/_lib/__tests__/fakes.js'

const alunos = [{ id: 'a1', nome: 'Lucas' }, { id: 'a2', nome: 'Ana' }]
const aula = (id, aluno, data, status) => ({ id, aluno_id: aluno, data, status })

describe('lembretes das aulas', () => {
  it('aulas de dias passados ainda previstas aparecem, agrupadas por aluno', () => {
    const p = pendenciasDeAulas({ alunos, aulas: [aula('1', 'a1', '2026-10-06', 'prevista'), aula('2', 'a1', '2026-10-08', 'prevista'), aula('3', 'a2', '2026-10-13', 'prevista'), aula('4', 'a2', '2026-10-01', 'realizada')] }, '2026-10-13')
    expect(p.atrasadas).toEqual([{ aluno: 'Lucas', qtd: 2, desde: '2026-10-06' }]) // a de hoje ainda não é atraso
  })
  it('mês anterior sem fechar só é lembrado nos dias 1, 3, 5 e 7', () => {
    const dados = { alunos, aulas: [aula('1', 'a1', '2026-10-06', 'realizada'), aula('2', 'a2', '2026-10-08', 'realizada')], aulasFech: [{ aluno_id: 'a2', mes: '2026-10', status: 'fechado' }] }
    expect(pendenciasDeAulas(dados, '2026-11-03').fechar).toEqual([{ mes: '2026-10', alunos: ['Lucas'] }])
    expect(pendenciasDeAulas(dados, '2026-11-04').fechar).toEqual([])
  })
  it('mês anterior ao início do app não é cobrado', () => {
    const dados = { alunos, aulas: [aula('1', 'a1', '2026-09-08', 'realizada')], aulasFech: [], inicioApp: '2026-10' }
    expect(pendenciasDeAulas(dados, '2026-10-03').fechar).toEqual([])
  })
  it('fechado há mais de 7 dias sem recebimento é lembrado às segundas', () => {
    const f = [{ aluno_id: 'a1', mes: '2026-09', status: 'fechado', valor_centavos: 32000, recebido: false, fechado_em: '2026-10-01T12:00:00Z' }]
    expect(pendenciasDeAulas({ alunos, aulas: [], aulasFech: f }, '2026-10-12').receber).toEqual([{ aluno: 'Lucas', mes: '2026-09', valor: 320 }]) // segunda
    expect(pendenciasDeAulas({ alunos, aulas: [], aulasFech: f }, '2026-10-13').receber).toEqual([]) // terça
    expect(pendenciasDeAulas({ alunos, aulas: [], aulasFech: [{ ...f[0], recebido: true }] }, '2026-10-12').receber).toEqual([])
  })
  it('sem pendência não há mensagem', () => {
    expect(textoLembreteAulas({ atrasadas: [], fechar: [], receber: [] })).toBeNull()
  })
  it('texto lista as pendências', () => {
    const t = textoLembreteAulas({ atrasadas: [{ aluno: 'Lucas', qtd: 2, desde: '2026-10-06' }], fechar: [{ mes: '2026-09', alunos: ['Ana'] }], receber: [{ aluno: 'Lucas', mes: '2026-09', valor: 320 }] })
    expect(t).toContain('Lucas: 2 aulas ainda como previstas (desde 06/10)')
    expect(t).toContain('Set/26: Ana')
    expect(t).toContain('R$ 320,00')
  })
  it('envia só para quem ligou /avisos on', async () => {
    const db = criarFakeDb(); const tg = criarFakeTg()
    db.dadosAulas = async () => ({ alunos, aulas: [aula('1', 'a1', '2026-10-06', 'prevista')], aulasFech: [] })
    const agora = () => new Date('2026-10-13T14:00:00Z')
    expect(await enviarLembretesAulas({ db, tg, agora })).toEqual({ enviados: 0, falhas: 0 })
    await processarUpdate(msg(GI, '/avisos on'), { db, tg, agora })
    tg.enviadas.length = 0
    expect(await enviarLembretesAulas({ db, tg, agora })).toEqual({ enviados: 1, falhas: 0 })
    expect(tg.enviadas[0].text).toContain('Lucas')
  })
})

describe('lembrete: follow-up de pausa e saída prevista', () => {
  const al = [{ id: 'a1', nome: 'Lucas', ativo: true, saida_prevista: '2026-12-20' }]
  it('avisa 3 dias antes de voltar e no dia 1 sobre saídas', () => {
    const pausas = [{ id: 'p', aluno_id: 'a1', inicio: '2026-10-01', fim: '2026-10-14', motivo: 'viagem' }]
    const p = pendenciasDeAulas({ alunos: al, aulas: [], pausas }, '2026-10-13')
    expect(p.followups).toHaveLength(1)
    expect(p.saidas).toHaveLength(0)
    expect(textoLembreteAulas(p)).toContain('Lucas: volta em 15/10 (viagem)')
    const q = pendenciasDeAulas({ alunos: al, aulas: [], pausas: [] }, '2026-11-01')
    expect(textoLembreteAulas(q)).toContain('Saídas previstas')
  })
})
