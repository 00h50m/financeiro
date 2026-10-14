import { describe, it, expect } from 'vitest'
import { aulasParaAtualizar, acharAluno, lerComandoAula } from '../aulasBot.js'

const alunos = [{ id: 'a1', nome: 'Lucas Silva' }, { id: 'a2', nome: 'Ana' }, { id: 'a3', nome: 'Ana Clara' }, { id: 'a4', nome: 'João', ativo: false }]
const aula = (id, aluno, data, status = 'prevista') => ({ id, aluno_id: aluno, data, status, duracao_min: 60 })

describe('aulas pelo Telegram', () => {
  it('lista previstas de hoje para trás, mais recentes primeiro, sem meses fechados', () => {
    const aulas = [aula('1', 'a1', '2026-10-06'), aula('2', 'a1', '2026-10-13'), aula('3', 'a1', '2026-10-14'), aula('4', 'a2', '2026-10-12', 'realizada'), aula('5', 'a2', '2026-09-30')]
    const r = aulasParaAtualizar({ alunos, aulas, aulasFech: [{ aluno_id: 'a2', mes: '2026-09', status: 'fechado' }] }, '2026-10-13')
    expect(r.itens.map((i) => i.aula.id)).toEqual(['2', '1']) // a de amanhã, a realizada e a de mês fechado ficam fora
    expect(r.total).toBe(2)
  })
  it('respeita o limite e o início do app', () => {
    const aulas = Array.from({ length: 12 }, (_, i) => aula(String(i), 'a1', `2026-10-${String(i + 1).padStart(2, '0')}`))
    expect(aulasParaAtualizar({ alunos, aulas }, '2026-10-13').itens).toHaveLength(10)
    expect(aulasParaAtualizar({ alunos, aulas, inicioApp: '2026-11' }, '2026-10-13').total).toBe(0)
  })
  it('acha o aluno por nome parcial, sem acento', () => {
    expect(acharAluno(alunos, 'lucas').aluno.id).toBe('a1')
    expect(acharAluno(alunos, 'ana').aluno.id).toBe('a2') // nome inteiro vence "Ana Clara"
    expect(acharAluno(alunos, 'clara').aluno.id).toBe('a3')
    expect(acharAluno(alunos, 'joao').erro).toBe('nenhum') // inativo
    expect(acharAluno([{ id: 'x', nome: 'Pedro A' }, { id: 'y', nome: 'Pedro B' }], 'pedro').erro).toBe('varios')
  })
  it('lê data e duração do comando', () => {
    expect(lerComandoAula('/aula Lucas hoje 1h', '2026-10-13')).toEqual({ nome: 'lucas', data: '2026-10-13', minutos: 60 })
    expect(lerComandoAula('aula ana ontem 90', '2026-10-13')).toEqual({ nome: 'ana', data: '2026-10-12', minutos: 90 })
    expect(lerComandoAula('Lucas 08/10 1h30', '2026-10-13')).toEqual({ nome: 'lucas', data: '2026-10-08', minutos: 90 })
    expect(lerComandoAula('Lucas Silva 2', '2026-10-13')).toEqual({ nome: 'lucas silva', data: '2026-10-13', minutos: 120 })
    expect(lerComandoAula('lucas', '2026-10-13')).toEqual({ nome: 'lucas', data: '2026-10-13', minutos: null })
  })
})

import { processarUpdate } from '../../../api/_lib/bot.js'
import { criarFakeDb, criarFakeTg, msg, GI } from '../../../api/_lib/__tests__/fakes.js'

const AGORA = () => new Date('2026-10-13T15:00:00Z') // terça, 12h em São Paulo
const cbq = (id, data, uid = GI) => ({ update_id: 9000 + Math.floor(Math.random() * 1e6), callback_query: { id: 'q' + id, data, from: { id: uid, is_bot: false }, message: { message_id: 7, chat: { id: uid, type: 'private' } } } })

function ambiente() {
  const db = criarFakeDb(); const tg = criarFakeTg()
  const al = [{ id: 'a1', nome: 'Lucas Silva', ativo: true, valor_hora_centavos: 10000 }, { id: 'a2', nome: 'Ana', ativo: true, valor_hora_centavos: 8000 }]
  const aulas = [
    { id: 'u1', aluno_id: 'a1', data: '2026-10-13', horario: '15:00', status: 'prevista', origem: 'recorrente', duracao_min: 60, valor_hora_centavos: 10000, historico: [] },
    { id: 'u2', aluno_id: 'a1', data: '2026-10-06', status: 'prevista', origem: 'recorrente', duracao_min: 60, valor_hora_centavos: 10000, historico: [] },
  ]
  db.s.dadosAulas = { alunos: al, aulas, aulasFech: [], inicioApp: '2026-10' }
  return { db, tg, aulas, deps: { db, tg, agora: AGORA } }
}
const textos = (tg) => tg.enviadas.map((e) => e.text)

describe('bot: /aulas e /aula', () => {
  it('/aulas lista as previstas com botões', async () => {
    const { tg, deps } = ambiente()
    await processarUpdate(msg(GI, '/aulas'), deps)
    expect(textos(tg)[0]).toContain('Aulas para atualizar')
    const botoes = tg.enviadas[0].markup.inline_keyboard.flat()
    expect(botoes[0].text).toContain('Lucas Silva')
    expect(botoes[0].callback_data).toBe('au|u1|r')
  })
  it('tocar em ✓ registra como realizada, uma vez só, e dá para desfazer', async () => {
    const { tg, aulas, deps } = ambiente()
    await processarUpdate(cbq(1, 'au|u1|r'), deps)
    expect(aulas[0]).toMatchObject({ status: 'realizada', duracao_real_min: 60, valor_centavos: 10000 })
    expect(textos(tg).join()).toContain('registrada como realizada')
    await processarUpdate(cbq(2, 'au|u1|r'), deps) // toque repetido
    expect(aulas[0].historico.filter((h) => h.tipo === 'realizada')).toHaveLength(1)
    await processarUpdate(cbq(3, 'au|u1|d'), deps)
    expect(aulas[0].status).toBe('prevista')
  })
  it('✕ pergunta o que houve e grava cancelada sem cobrança', async () => {
    const { tg, aulas, deps } = ambiente()
    await processarUpdate(cbq(1, 'au|u2|c'), deps)
    expect(tg.enviadas.at(-1).markup.inline_keyboard.flat().map((b) => b.callback_data)).toContain('au|u2|ca')
    await processarUpdate(cbq(2, 'au|u2|ca'), deps)
    expect(aulas[1]).toMatchObject({ status: 'cancelada', quem: 'aluno', valor_centavos: null })
  })
  it('mês fechado do aluno bloqueia', async () => {
    const { db, aulas, deps } = ambiente()
    db.s.dadosAulas.aulasFech = [{ aluno_id: 'a1', mes: '2026-10', status: 'fechado' }]
    await processarUpdate(cbq(1, 'au|u1|r'), deps)
    expect(aulas[0].status).toBe('prevista')
  })
  it('/aula Lucas hoje 90 realiza a prevista do dia com a duração dita', async () => {
    const { tg, aulas, deps } = ambiente()
    await processarUpdate(msg(GI, '/aula Lucas hoje 90'), deps)
    expect(aulas[0]).toMatchObject({ status: 'realizada', duracao_real_min: 90, valor_centavos: 15000 })
    expect(textos(tg).join()).toContain('aula realizada')
  })
  it('sem prevista no dia, pede a duração; com duração cria avulsa realizada e dá para desfazer', async () => {
    const { db, tg, deps } = ambiente()
    await processarUpdate(msg(GI, '/aula Ana hoje'), deps)
    expect(textos(tg).join()).toContain('Não achei aula prevista')
    await processarUpdate(msg(GI, '/aula Ana hoje 1h'), deps)
    const nova = db.s.dadosAulas.aulas.find((a) => a.aluno_id === 'a2')
    expect(nova).toMatchObject({ origem: 'avulsa', status: 'realizada', valor_centavos: 8000 })
    await processarUpdate(cbq(5, `au|${nova.id}|x`), deps)
    expect(db.s.dadosAulas.aulas.some((a) => a.aluno_id === 'a2')).toBe(false)
  })
  it('data futura e aluno inexistente não registram nada', async () => {
    const { tg, aulas, deps } = ambiente()
    await processarUpdate(msg(GI, '/aula Lucas 20/10 1h'), deps)
    await processarUpdate(msg(GI, '/aula Zeca hoje 1h'), deps)
    expect(aulas.every((a) => a.status === 'prevista')).toBe(true)
    expect(textos(tg).join()).toContain('ainda não chegou')
    expect(textos(tg).join()).toContain('Não achei esse aluno')
  })
})
