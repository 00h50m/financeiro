import { describe, it, expect } from 'vitest'
import { serieMensal, resumoParaSerie, comparativos } from '../evolucao.js'
import { montarResumoMensal, textoDoResumo } from '../resumoMensal.js'

const base = {
  compras: [], cartoes: [], faturas: [], fixosPagamentos: [], saldoAjustes: [], comprasPagamentos: [], fechamentos: [], divisoes: [], divisoesRepasses: [],
  fixos: [{ id: 'f', nome: 'Aluguel', valor: 1000, ativo: true, categoria: 'Casa', subcategoria: 'Aluguel', dia_vencimento: 5 }],
  rendas: [{ mes: '2026-09', giovanna: 3000 }, { mes: '2026-10', giovanna: 3000 }],
}

describe('início do app nos gráficos e resumos', () => {
  it('sem data de início, setembro continua com dados', () => {
    expect(resumoParaSerie(base, '2026-09').renda).toBe(3000)
  })
  it('com início em 2026-10, setembro vira mês vazio e outubro segue normal', () => {
    const d = { ...base, inicioApp: '2026-10' }
    expect(resumoParaSerie(d, '2026-09')).toMatchObject({ renda: 0, despesas: 0, fonte: 'antes do início' })
    const [set, out] = serieMensal(d, '2026-10', 2)
    expect(set.temDados).toBe(false)
    expect(out.temDados).toBe(true)
  })
  it('comparativo não usa o mês anterior ao início', () => {
    const c = comparativos({ ...base, inicioApp: '2026-10' }, '2026-10', 'despesas')
    expect(c.itens[0].referencia).toBeNull()
  })
  it('resumo mensal de um mês anterior ao início explica em vez de mostrar números', () => {
    const r = montarResumoMensal({ ...base, inicioApp: '2026-10' }, '2026-09', '2026-10-13')
    expect(r.vazio).toBe(true)
    expect(textoDoResumo(r)).toContain('só considera os dados a partir de')
  })
})

import { validarFechamento, riscosDoMes } from '../fechamento.js'
import { projecao } from '../graficos.js'

describe('início do app: fechamento e projeção', () => {
  const d = { ...base, fechamentosOk: true, eventos: [], inicioApp: '2026-10' }
  it('primeiro fechamento no mês de início não fala em "meses passados" nem cobra mês anterior', () => {
    const v = validarFechamento(d, '2026-10', { hoje: '2026-10' })
    expect(v.alertas.join(' ')).not.toContain('primeiro fechamento')
    expect(riscosDoMes(d, '2026-10', '2026-10').some((r) => String(r.texto).includes('Set/26'))).toBe(false)
  })
  it('sem data de início o alerta antigo continua', () => {
    const v = validarFechamento({ ...d, inicioApp: null }, '2026-10', { hoje: '2026-10' })
    expect(v.alertas.join(' ')).toContain('primeiro fechamento')
  })
  it('projeção não usa o à vista de meses anteriores ao início', () => {
    const comCompra = { ...d, compras: [{ id: 'c', data_compra: '2026-09-10', valor_total: 900, parcelas: 1, categoria: 'Diversos', subcategoria: 'Outros', pessoa: 'Giovanna' }] }
    const p = projecao(comCompra, '2026-10', 1)
    expect(p[0].aVistaEstimado).toBe(0) // setembro está antes do início: não vira "gasto médio" estimado
    expect(projecao({ ...comCompra, inicioApp: null }, '2026-10', 1)[0].aVistaEstimado).toBeGreaterThan(0)
  })
})
