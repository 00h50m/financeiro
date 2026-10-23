import { describe, it, expect } from 'vitest'
import { montarCheckinPlano } from '../checkinPlano'

const c = (data_compra, categoria, valor_total, extra = {}) => ({ data_compra, categoria, valor_total, parcelas: 1, ...extra })
const hoje = '2026-10-25' // domingo
const plano = {
  resumo: 'Faltam 800 por mês', meta: { sobra_mensal_alvo: 300, mes_de_volta_ao_azul: '2027-03' },
  tetos_semanais: [{ categoria: 'Mercado', valor: 150 }, { categoria: 'Combustível', valor: 100 }, { categoria: 'Lazer', valor: 80 }],
  acoes: [{ acao: 'Adiar o seguro', por_que: 'x', tipo: 'adiar', valor: 400, quando: '2026-11' }, { acao: 'Renegociar o cartão', por_que: 'x', tipo: 'renegociar', valor: null, quando: null }, { acao: 'Guardar a sobra', por_que: 'x', tipo: 'guardar', valor: 100, quando: '2027-06' }],
}
const compras = [c('2026-10-20', 'Mercado', 170), c('2026-10-21', 'Combustível', 85), c('2026-10-22', 'Lazer', 20), c('2026-10-23', 'Farmácia', 40), c('2026-10-13', 'Mercado', 120)]

describe('check-in de domingo do plano', () => {
  it('semana contra os tetos, próxima semana, próximos passos e meta', () => {
    const t = montarCheckinPlano({ plano, compras, hoje, planoDe: '2026-10-10' })
    expect(t).toContain('Check-in do plano · semana 19/10 a 25/10')
    expect(t).toContain('⚠️ Dia a dia: R$ 315,00 de R$ 330,00 (sobraram R$ 15,00)') // 170+85+20+40 = 95% do teto
    expect(t).toContain('🔴 Mercado: R$ 170,00 de R$ 150,00')
    expect(t).toContain('⚠️ Combustível: R$ 85,00 de R$ 100,00')
    expect(t).toContain('✅ Dentro do teto: Lazer')
    expect(t).toContain('Sem teto: Farmácia R$ 40,00')
    expect(t).toContain('Próxima semana (tetos):')
    expect(t).toContain('• Mercado: R$ 150,00')
    expect(t).toContain('• Adiar o seguro (R$ 400,00)')
    expect(t).toContain('• Renegociar o cartão')
    expect(t).not.toContain('Guardar a sobra') // longe demais
    expect(t).toContain('voltar ao azul em')
    expect(t).toContain('Plano de 10/10/2026')
  })
  it('sem plano: usa a média dos 3 meses anteriores e convida a gerar o plano', () => {
    const hist = [c('2026-07-10', 'Mercado', 600), c('2026-08-10', 'Mercado', 600), c('2026-09-10', 'Mercado', 600), c('2026-10-21', 'Mercado', 50)]
    const t = montarCheckinPlano({ plano: null, compras: hist, hoje })
    expect(t).toContain('Mercado: R$ 138,46') // 600 ÷ 4,33 semanas
    expect(t).toContain('Gere o seu plano no app')
  })
  it('sem plano e sem histórico não manda nada', () => {
    expect(montarCheckinPlano({ plano: null, compras: [c('2026-10-21', 'Mercado', 50)], hoje })).toBeNull()
    expect(montarCheckinPlano({ plano: { tetos_semanais: [], acoes: [] }, compras: [], hoje })).toBeNull()
  })
})
