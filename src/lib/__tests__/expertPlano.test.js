import { describe, it, expect } from 'vitest'
import { montarContextoExpert, snapshotDoPlano } from '../expertPlano'
import { reservaVariavel, sobraReal } from '../gastoVariavel'
import { projecaoRenda, perfilDeLinhas } from '../rendaSazonal'

const store = {
  dividas: [{ id: 'd1', nome: 'Cartão', saldo: 3000, parcela: 200, juros_mes: 10, ativa: true }],
  rendas: [{ mes: '2026-10', giovanna: 3000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }], rendaSazonal: [],
  compras: [{ id: 1, data_compra: '2026-09-10', categoria: 'Mercado', valor_total: 900, parcelas: 1 }],
  cartoes: [], fixos: [{ id: 'f1', nome: 'Aluguel', valor: 2500, ativo: true, dia_vencimento: 5, inicio: '2026-01' }], faturas: [], adiamentos: [], fixosPagamentos: [], comprasPagamentos: [],
  reservaFontes: [{ id: 'r1', nome: 'Poupança', valor: 2540, liquidez: 'na_hora' }, { id: 'r2', nome: 'FGTS', valor: 3000, liquidez: 'travado' }],
  alunos: [{ id: 'a', nome: 'Ana', ativo: true, valor_hora_centavos: 10000 }], aulasProg: [{ aluno_id: 'a', dia_semana: 2, horario: '14:00', duracao_min: 60, vigencia_inicio: '2020-01-01', vigencia_fim: null }],
}
const proj = projecaoRenda(store, perfilDeLinhas([]), '2026-10', 12)
const reserva = reservaVariavel(store.compras, '2026-10')
const real = sobraReal(proj, reserva, '2026-10')

describe('contexto do expert', () => {
  it('traz reserva, aulas e o plano anterior', () => {
    const ctx = montarContextoExpert(store, { hoje: '2026-10-22', real, reserva, sobrasOrcamento: real.map((m) => Math.max(0, m.sobraReal)), planoAnterior: { criado_em: '2026-09-20T10:00:00Z', plano: { resumo: 'Antigo', meta: { sobra_mensal_alvo: 100 }, acoes: [{ acao: 'Cortar lazer', tipo: 'cortar', valor: 200, quando: null, por_que: 'x' }], tetos_semanais: [{ categoria: 'Mercado', valor: 200 }] } } })
    expect(ctx.objetivo).toContain('voltar a sobrar')
    expect(ctx.reserva_emergencia).toEqual({ total: 5540, na_hora: 2540, poucos_dias: 0, travado: 3000 })
    expect(ctx.aulas_particulares.horas_por_semana).toBe(1)
    expect(ctx.plano_anterior).toMatchObject({ criado_em: '2026-09-20', resumo: 'Antigo' })
    expect(ctx.plano_anterior.acoes[0]).not.toHaveProperty('por_que')
    expect(ctx.meses).toHaveLength(12)
    expect(JSON.stringify(ctx).length).toBeLessThan(30000)
  })
  it('sem reserva/aulas/plano anterior vira null', () => {
    const ctx = montarContextoExpert({ ...store, reservaFontes: [], alunos: [], aulasProg: [] }, { hoje: '2026-10-22', real, reserva, sobrasOrcamento: [] })
    expect(ctx.reserva_emergencia).toBeNull()
    expect(ctx.aulas_particulares).toBeNull()
    expect(ctx.plano_anterior).toBeNull()
  })
  it('snapshot: meses no vermelho, reserva e dívida', () => {
    const s = snapshotDoPlano(store, { real, reserva })
    expect(s.meses_no_vermelho).toBe(real.filter((m) => m.sobraReal < 0).length)
    expect(s.divida_total).toBe(3000)
    expect(s.reserva_emergencia).toBe(5540)
  })
})
