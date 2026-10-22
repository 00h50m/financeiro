import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import PlanoDividas from '../../components/PlanoDividas'

const hoje = new Date().toISOString().slice(0, 7)
describe('PlanoDividas (render)', () => {
  it('mostra "seu mês de verdade" com a reserva do dia a dia', () => {
    const store = {
      dividas: [{ id: 'd1', nome: 'Cartão', saldo: 3000, parcela: 200, juros_mes: 10, ativa: true }], dividasOk: true,
      rendas: [{ mes: hoje, giovanna: 5000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }], rendaSazonal: [], compras: [
        { id: 1, data_compra: `${new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 10)).toISOString().slice(0, 10)}`, categoria: 'Combustível', valor_total: 400, parcelas: 1 },
      ], cartoes: [], fixos: [], faturas: [], adiamentos: [], fixosPagamentos: [], comprasPagamentos: [], config: {}, configOk: true, definirConfig: () => {}, salvarDivida: () => {}, removerDivida: () => {},
    }
    const html = renderToString(<PlanoDividas store={store} />)
    expect(html).toContain('seu mês de verdade')
    expect(html).toContain('Combustível')
  })
})
