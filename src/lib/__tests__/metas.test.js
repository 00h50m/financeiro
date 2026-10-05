import { describe, it, expect } from 'vitest'
import { valorComSinal, saldoMeta, deltaParaSaldo, alvoDaMeta, situacaoDaMeta, mesesParaAlvo, sugerirDestinoSobra } from '../metas'

const mov = (meta_id, valor) => ({ id: Math.random(), meta_id, valor })
const reserva = { id: 'r', nome: 'Reserva', tipo: 'reserva', meta_meses: 6, base_custo: 'total', prioridade: 1, ativa: true }
const viagem = { id: 'v', nome: 'Viagem', tipo: 'objetivo', valor_alvo: 3000, prazo: '2027-03-15', prioridade: 2, ativa: true }
const custos = { custoFixos: 1000, custoTotal: 2000 }

describe('movimentos e saldo', () => {
  it('aporte soma, retirada subtrai, ajuste vem com sinal', () => {
    expect(valorComSinal('aporte', 100)).toBe(100)
    expect(valorComSinal('retirada', 100)).toBe(-100)
    expect(valorComSinal('retirada', -100)).toBe(-100)
    expect(valorComSinal('ajuste', -30)).toBe(-30)
  })
  it('saldo é a soma só dos movimentos da meta', () => {
    const ms = [mov('r', 500), mov('r', -200), mov('v', 999)]
    expect(saldoMeta(ms, 'r')).toBe(300)
  })
  it('ajuste grava só a diferença', () => {
    expect(deltaParaSaldo(300, 450)).toBe(150)
    expect(deltaParaSaldo(300, 100)).toBe(-200)
    expect(deltaParaSaldo(0.1 + 0.2, 0.3)).toBe(0)
  })
})

describe('alvo e situação', () => {
  it('reserva: meses × custo conforme a base', () => {
    expect(alvoDaMeta(reserva, custos)).toBe(12000)
    expect(alvoDaMeta({ ...reserva, base_custo: 'fixos' }, custos)).toBe(6000)
  })
  it('objetivo com prazo calcula o ritmo mensal', () => {
    const s = situacaoDaMeta(viagem, [mov('v', 600)], custos, '2026-10-05')
    expect(s.falta).toBe(2400)
    expect(s.pct).toBe(20)
    expect(s.mesesAtePrazo).toBe(5)
    expect(s.porMesNecessario).toBe(480)
  })
  it('meta atingida não tem falta', () => {
    const s = situacaoDaMeta(viagem, [mov('v', 3000)], custos, '2026-10-05')
    expect(s.atingida).toBe(true)
    expect(s.falta).toBe(0)
  })
  it('prazo vencido é sinalizado', () => {
    expect(situacaoDaMeta({ ...viagem, prazo: '2026-01-01' }, [], custos, '2026-10-05').prazoVencido).toBe(true)
  })
  it('meses para o alvo', () => {
    expect(mesesParaAlvo(1000, 300)).toBe(4)
    expect(mesesParaAlvo(1000, 0)).toBe(null)
    expect(mesesParaAlvo(0, 0)).toBe(0)
  })
})

describe('sugerirDestinoSobra', () => {
  const metas = [viagem, reserva] // fora de ordem de propósito
  it('respeita prioridade e o ritmo do prazo', () => {
    const r = sugerirDestinoSobra(1000, metas, [], custos, '2026-10-05')
    expect(r.linhas[0].nome).toBe('Reserva')
    expect(r.linhas[0].valor).toBe(1000)
    expect(r.livre).toBe(0)
  })
  it('transborda para a próxima meta e deixa o resto livre', () => {
    const ms = [mov('r', 11900)]
    const r = sugerirDestinoSobra(1000, metas, ms, custos, '2026-10-05')
    expect(r.linhas.map((l) => [l.nome, l.valor])).toEqual([['Reserva', 100], ['Viagem', 600]])
    expect(r.livre).toBe(300)
  })
  it('sobra negativa ou zero não sugere nada', () => {
    expect(sugerirDestinoSobra(-50, metas, [], custos, '2026-10-05')).toEqual({ destinado: 0, livre: 0, linhas: [] })
  })
  it('percentual configurável', () => {
    const r = sugerirDestinoSobra(1000, [reserva], [], custos, '2026-10-05', { percentual: 50 })
    expect(r.destinado).toBe(500)
    expect(r.livre).toBe(500)
  })
  it('metas arquivadas e já atingidas ficam de fora', () => {
    const r = sugerirDestinoSobra(500, [{ ...reserva, ativa: false }, viagem], [mov('v', 3000)], custos, '2026-10-05')
    expect(r.linhas).toEqual([])
  })
})
