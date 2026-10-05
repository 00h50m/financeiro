import { describe, it, expect } from 'vitest'
import { periodoDe, interpretarPergunta, filtroDe, calcularResumo, formatarResumo } from '../resumo'

const HOJE = '2026-10-15' // quinta-feira
const c = (o) => ({ data_compra: '2026-10-10', valor_total: 10, categoria: 'Alimentação', subcategoria: 'Mercado', descricao: 'mercado', pessoa: 'Giovanna', ...o })

describe('periodoDe', () => {
  it('sem nada: mês atual até hoje', () => expect(periodoDe('', HOJE)).toMatchObject({ de: '2026-10-01', ate: HOJE, nome: 'outubro' }))
  it('semana: de segunda até hoje', () => expect(periodoDe('semana', HOJE)).toMatchObject({ de: '2026-10-12', ate: HOJE }))
  it('semana passada', () => expect(periodoDe('na semana passada', HOJE)).toMatchObject({ de: '2026-10-05', ate: '2026-10-11' }))
  it('mês passado inteiro', () => expect(periodoDe('mes passado', HOJE)).toMatchObject({ de: '2026-09-01', ate: '2026-09-30', nome: 'setembro' }))
  it('hoje e ontem', () => {
    expect(periodoDe('hoje', HOJE)).toMatchObject({ de: HOJE, ate: HOJE })
    expect(periodoDe('ontem', HOJE)).toMatchObject({ de: '2026-10-14', ate: '2026-10-14' })
  })
  it('devolve o que sobrou como filtro', () => expect(periodoDe('em mercado este mês', HOJE).resto).toBe('em mercado'))
})

describe('interpretarPergunta', () => {
  it('reconhece perguntas', () => {
    expect(interpretarPergunta('Quanto gastei em mercado este mês?').texto).toBe('em mercado este mes')
    expect(interpretarPergunta('quanto a gente gastou na semana passada').texto).toBe('na semana passada')
  })
  it('não confunde gasto com pergunta', () => {
    expect(interpretarPergunta('gastei 20 no mercado')).toBeNull()
    expect(interpretarPergunta('mercado 20')).toBeNull()
  })
})

describe('calcularResumo', () => {
  const compras = [c({}), c({ valor_total: 30, categoria: 'Transporte', subcategoria: 'Uber/99/Táxi', descricao: 'uber', pessoa: 'Sabrina' }),
    c({ data_compra: '2026-09-30', valor_total: 500 }), c({ valor_total: 5.5, descricao: 'padaria' })]
  const per = { de: '2026-10-01', ate: HOJE }
  it('soma só o período e agrupa por categoria', () => {
    const r = calcularResumo(compras, per)
    expect(r).toMatchObject({ total: 45.5, n: 3 })
    expect(r.porCategoria[0]).toEqual(['Transporte', 30])
  })
  it('filtra por termo (categoria, subcategoria ou descrição) sem acento', () => {
    expect(calcularResumo(compras, { ...per, filtro: filtroDe('em mercado', []) }).total).toBe(15.5)
    expect(calcularResumo(compras, { ...per, filtro: filtroDe('uber', []) }).total).toBe(30)
    expect(calcularResumo(compras, { ...per, filtro: filtroDe('alimentacao', []) }).total).toBe(15.5)
  })
  it('filtra por pessoa pelo apelido', () => {
    const f = filtroDe('do gi', [{ nome: 'Giovanna', apelidos: ['gi'] }])
    expect(f.tipo).toBe('pessoa')
    expect(calcularResumo(compras, { ...per, filtro: f }).total).toBe(15.5)
  })
  it('mostra mensagem clara quando não acha nada', () => {
    const r = calcularResumo(compras, { ...per, filtro: filtroDe('pizza', []) })
    expect(formatarResumo(r, { ...periodoDe('', HOJE), filtro: filtroDe('pizza', []) })).toContain('Não achei compras')
  })
  it('texto final traz total e aviso das parceladas', () => {
    const t = formatarResumo(calcularResumo(compras, per), { ...periodoDe('', HOJE) })
    expect(t).toContain('3 compras')
    expect(t).toContain('parceladas contam inteiras')
  })
})
