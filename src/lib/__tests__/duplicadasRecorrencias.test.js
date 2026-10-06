import { describe, it, expect } from 'vitest'
import { acharSemelhantes } from '../duplicadas'
import { detectarRecorrencias } from '../recorrencias'
import { paraCsv } from '../csvExport'

let n = 0
const c = (o) => ({ id: 'k' + ++n, cartao_id: 'c1', descricao: 'Netflix', valor_total: 55.9, parcelas: 1, data_compra: '2026-10-05', categoria: 'Assinaturas', subcategoria: 'Streaming', pessoa: 'Gi', ...o })

describe('compra duplicada', () => {
  const base = [c({ descricao: 'Netflix', data_compra: '2026-10-05' }), c({ descricao: 'Mercado', valor_total: 80, data_compra: '2026-10-05' })]
  it('mesmo cartão, valor, dia e nome parecido → avisa', () => {
    expect(acharSemelhantes(c({ id: undefined, descricao: 'NETFLIX.COM', data_compra: '2026-10-06' }), base).map((x) => x.descricao)).toEqual(['Netflix'])
  })
  it('valor ou cartão diferente, ou muito distante no tempo → não avisa', () => {
    expect(acharSemelhantes(c({ id: undefined, valor_total: 59.9 }), base)).toEqual([])
    expect(acharSemelhantes(c({ id: undefined, cartao_id: 'c2' }), base)).toEqual([])
    expect(acharSemelhantes(c({ id: undefined, data_compra: '2026-10-20' }), base)).toEqual([])
  })
  it('não compara a compra com ela mesma', () => { expect(acharSemelhantes(base[0], base)).toEqual([]) })
})

describe('recorrências', () => {
  const meses = ['2026-07', '2026-08', '2026-09', '2026-10']
  const netflix = meses.map((m, i) => c({ data_compra: m + '-05', valor_total: i === 3 ? 59.9 : 55.9 }))
  it('assinatura mensal é detectada, com aviso de aumento de preço', () => {
    const r = detectarRecorrencias(netflix, [], '2026-10')
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ nome: 'Netflix', ultimo: 59.9, aumento: { de: 55.9, para: 59.9, pct: 7 } })
  })
  it('já cadastrada como conta fixa não aparece; ignorada também', () => {
    expect(detectarRecorrencias(netflix, [{ nome: 'Netflix' }], '2026-10')).toEqual([])
    expect(detectarRecorrencias(netflix, [], '2026-10', { ignoradas: ['netflix'] })).toEqual([])
  })
  it('compra comum (dois no mês, poucos meses, valor muito variável) não vira recorrência', () => {
    expect(detectarRecorrencias([c({ data_compra: '2026-09-05' }), c({ data_compra: '2026-10-05' })], [], '2026-10')).toEqual([])
    expect(detectarRecorrencias([...netflix, c({ data_compra: '2026-10-20' })], [], '2026-10')).toEqual([])
    const varia = meses.map((m, i) => c({ descricao: 'Uber', data_compra: m + '-05', valor_total: [10, 80, 15, 120][i] }))
    expect(detectarRecorrencias(varia, [], '2026-10')).toEqual([])
  })
})

describe('csv', () => {
  it('separador ;, vírgula decimal, aspas escapadas e BOM', () => {
    const csv = paraCsv([{ titulo: 'Nome', valor: (l) => l.n }, { titulo: 'Valor', valor: (l) => l.v }], [{ n: 'A; "b"', v: 1234.5 }])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv.split('\r\n')[0]).toBe('﻿Nome;Valor')
    expect(csv.split('\r\n')[1]).toBe('"A; ""b""";1234,5')
  })
})
