import { describe, it, expect, beforeEach } from 'vitest'
import { processarUpdate } from '../bot.js'
import { vencimentosProximos, textoVencimentos, enviarLembretesVencimento } from '../vencimentos.js'
import cron from '../../cron-vencimentos.js'
import { criarFakeDb, criarFakeTg, msg, GI } from './fakes.js'

const SEXTA = new Date('2026-10-09T11:00:00Z') // 08h em São Paulo
const dados = (extra = {}) => ({
  compras: [], cartoes: [], fixos: [{ id: 'f1', nome: 'Internet', valor: 100, ativo: true, dia_vencimento: 10, mes_inicio: '2026-01' }, { id: 'f2', nome: 'Aluguel', valor: 900, ativo: true, dia_vencimento: 9, mes_inicio: '2026-01' }, { id: 'f3', nome: 'Gás', valor: 50, ativo: true, dia_vencimento: 20, mes_inicio: '2026-01' }],
  fixosValores: [], faturas: [], rendas: [], fixosPagamentos: [], comprasPagamentos: [], comprasPagamentosOk: false, saldoAjustes: [], pessoas: [], ...extra,
})

describe('lembrete de vencimentos', () => {
  it('separa o que vence hoje e amanhã e ignora o que já foi pago', () => {
    const v = vencimentosProximos(dados(), '2026-10-09')
    expect(v.hoje.map((e) => e.titulo)).toEqual(['Aluguel'])
    expect(v.amanha.map((e) => e.titulo)).toEqual(['Internet'])
    const pago = vencimentosProximos(dados({ fixosPagamentos: [{ fixo_id: 'f2', mes: '2026-10', pago: true }] }), '2026-10-09')
    expect(pago.hoje).toEqual([])
  })
  it('sem nada a vencer não manda mensagem', () => {
    expect(textoVencimentos(vencimentosProximos(dados(), '2026-10-15'))).toBeNull()
  })
  it('amanhã no mês seguinte também vale', () => {
    const v = vencimentosProximos(dados({ fixos: [{ id: 'f1', nome: 'Internet', valor: 100, ativo: true, dia_vencimento: 1, mes_inicio: '2026-01' }] }), '2026-10-31')
    expect(v.amanha.map((e) => e.titulo)).toEqual(['Internet'])
  })
  it('texto lista hoje e amanhã com os valores', () => {
    const t = textoVencimentos(vencimentosProximos(dados(), '2026-10-09'))
    expect(t).toContain('Hoje:')
    expect(t).toContain('Aluguel: R$ 900,00')
    expect(t).toContain('Amanhã:')
    expect(t).toContain('/avisos off')
  })
})

describe('envio dos lembretes', () => {
  let db, tg
  beforeEach(() => { db = criarFakeDb(); db.dadosResumoMensal = async () => dados(); tg = criarFakeTg() })
  it('manda só para quem ligou /avisos on', async () => {
    expect(await enviarLembretesVencimento({ db, tg, agora: () => SEXTA })).toEqual({ enviados: 0, falhas: 0 })
    await processarUpdate(msg(GI, '/avisos on'), { db, tg, agora: () => SEXTA })
    tg.enviadas.length = 0
    expect(await enviarLembretesVencimento({ db, tg, agora: () => SEXTA })).toEqual({ enviados: 1, falhas: 0 })
    expect(tg.enviadas[0].text).toContain('Aluguel')
  })
  it('a rota do cron pede o segredo', async () => {
    delete process.env.CRON_SECRET
    const res = { status(c) { this.code = c; return this }, json() { return this }, end() { return this } }
    await cron({ method: 'GET', headers: {} }, res)
    expect(res.code).toBe(503)
  })
})
