import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('../useStore', () => ({}))
import Pagamentos from '../../components/Pagamentos'

const mes = new Date().toISOString().slice(0, 7)
const store = {
  cartoes: [], fixos: [{ id: 'f1', nome: 'Aluguel', valor: 2000, categoria: 'Moradia', ativo: true, dia_vencimento: 5, mes_inicio: '2026-01' }, { id: 'f2', nome: 'Luz', valor: 300, categoria: 'Moradia', ativo: true, dia_vencimento: 10, mes_inicio: '2026-01' }],
  fixosPagamentos: [{ fixo_id: 'f1', mes, pago: true }], compras: [{ id: 'c1', data_compra: `${mes}-06`, descricao: 'Escola', categoria: 'Educação', valor_total: 500, parcelas: 1, cartao_id: null, pago: false }],
  faturas: [], rendas: [{ mes, giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }], saldoAjustes: [], comprasPagamentos: [], comprasPagamentosOk: false, adiamentos: [], dividas: [], fechamentos: [], divisoes: [], aulasAReceber: {},
  config: {}, configOk: true, adiamentosOk: false, dividasOk: false,
}
describe('Pagamentos: por categoria', () => {
  it('mostra o total, o pago e o que falta de cada categoria', () => {
    const html = renderToString(<Pagamentos store={store} />).replace(/<!-- -->/g, '')
    expect(html).toContain('Por categoria')
    expect(html).toContain('Moradia')
    expect(html).toContain('Educação')
    expect(html).toContain('falta R$')
    expect(html).toContain('Total do mês')
  })
})
