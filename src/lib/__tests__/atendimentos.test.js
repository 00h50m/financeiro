import { describe, it, expect } from 'vitest'
import { resumoMes, atendimentosPorMes, somarPorMes, patchRealizar, patchReceber, patchDesfazer, patchEncerrar, novoAtendimento, conflitoDeHorario, resumoClientes, porData } from '../atendimentos'
import { rendasComAulas, aulasAReceberPorMes } from '../aulasFechamento'

const a = (id, data, status, valor, extra = {}) => ({ id, cliente_id: 'c1', servico_nome: 'Limpeza de pele', data, horario: null, duracao_min: 60, valor, custo_material: 10, status, pago: false, ...extra })
const lista = [
  a(1, '2026-10-05', 'realizado', 150, { pago: true }), a(2, '2026-10-06', 'realizado', 200), a(3, '2026-10-20', 'agendado', 120),
  a(4, '2026-10-07', 'cancelado', 100), a(5, '2026-10-08', 'faltou', 100), a(6, '2026-11-02', 'agendado', 300),
]

describe('atendimentos', () => {
  it('resumo do mês: faturado, previsto, recebido, a receber e lucro', () => {
    const r = resumoMes(lista.filter((x) => x.data.startsWith('2026-10')))
    expect(r).toMatchObject({ realizados: 2, agendados: 1, cancelados: 1, faltas: 1, faturado: 350, previsto: 120, recebido: 150, aReceber: 200, material: 20, lucro: 330, minutos: 120 })
  })
  it('entrada por mês no formato da renda (cancelado e faltou não contam)', () => {
    const m = atendimentosPorMes(lista)
    expect(m['2026-10']).toEqual({ valor: 470, recebido: 150, aReceber: 200, projetada: false, porAluno: [] })
    expect(m['2026-11'].valor).toBe(300)
    const rendas = rendasComAulas([{ mes: '2026-10', giovanna: 1000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }], m)
    expect(rendas.find((r) => r.mes === '2026-10').extra_sabrina).toBe(470)
    expect(rendas.find((r) => r.mes === '2026-11').sintetica).toBe(true)
    expect(aulasAReceberPorMes(m)).toEqual({ '2026-10': 200 })
  })
  it('somar com outra entrada (aulas) por mês', () => {
    const s = somarPorMes({ '2026-10': { valor: 100, recebido: 0, aReceber: 100, projetada: true, porAluno: [] } }, atendimentosPorMes(lista))
    expect(s['2026-10'].valor).toBe(570)
    expect(s['2026-10'].aReceber).toBe(300)
    expect(s['2026-11'].valor).toBe(300)
  })
  it('mudanças de estado', () => {
    expect(patchRealizar(lista[2], { pago: true, forma: 'Pix', hoje: '2026-10-20' })).toEqual({ status: 'realizado', pago: true, forma_pagamento: 'Pix', data_pagamento: '2026-10-20' })
    expect(patchRealizar(lista[2], { pago: false, hoje: '2026-10-20' })).toMatchObject({ status: 'realizado', pago: false, data_pagamento: null })
    expect(patchReceber(lista[1], { forma: 'Dinheiro', hoje: '2026-10-21' })).toEqual({ pago: true, forma_pagamento: 'Dinheiro', data_pagamento: '2026-10-21' })
    expect(patchDesfazer()).toMatchObject({ status: 'agendado', pago: false })
    expect(patchEncerrar('faltou')).toMatchObject({ status: 'faltou', pago: false })
  })
  it('novo atendimento herda do serviço e dá para trocar o valor', () => {
    const servico = { id: 's1', nome: 'Peeling', preco: 180, duracao_min: 45, custo_material: 30 }
    expect(novoAtendimento({ cliente: { id: 'c1' }, servico, data: '2026-10-30' })).toMatchObject({ servico_id: 's1', servico_nome: 'Peeling', valor: 180, duracao_min: 45, custo_material: 30, status: 'agendado' })
    expect(novoAtendimento({ cliente: { id: 'c1' }, servico, data: '2026-10-30', valor: 150 }).valor).toBe(150)
  })
  it('conflito de horário só quando os dois têm horário', () => {
    const l = [a(1, '2026-10-30', 'agendado', 100, { horario: '14:00', duracao_min: 60 })]
    expect(conflitoDeHorario(l, { data: '2026-10-30', horario: '14:30', duracao_min: 60 })?.id).toBe(1)
    expect(conflitoDeHorario(l, { data: '2026-10-30', horario: '15:00', duracao_min: 60 })).toBeNull()
    expect(conflitoDeHorario(l, { data: '2026-10-30', horario: null, duracao_min: 60 })).toBeNull()
    expect(conflitoDeHorario(l, { data: '2026-10-30', horario: '14:30', duracao_min: 60 }, 1)).toBeNull()
  })
  it('resumo por cliente e ordem da agenda', () => {
    const r = resumoClientes([{ id: 'c1', nome: 'Ana' }, { id: 'c2', nome: 'Bia' }], lista)
    expect(r[0]).toMatchObject({ total: 2, gasto: 350, ultimo: '2026-10-06', proximo: '2026-10-20', aReceber: 200 })
    expect(r[1]).toMatchObject({ total: 0, ultimo: null, proximo: null })
    expect([a(1, '2026-10-02', 'agendado', 1, { horario: '10:00' }), a(2, '2026-10-02', 'agendado', 1), a(3, '2026-10-01', 'agendado', 1)].sort(porData).map((x) => x.id)).toEqual([3, 1, 2])
  })
})
