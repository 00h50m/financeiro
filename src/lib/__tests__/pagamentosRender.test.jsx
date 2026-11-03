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
describe('Pagamentos: lista única de contas', () => {
  const html = () => renderToString(<Pagamentos store={store} />).replace(/<!-- -->/g, '')
  it('abre com resumo compacto, abas e as contas na lista (a tarefa vem primeiro)', () => {
    const h = html()
    expect(h).toContain('Resumo dos pagamentos')
    for (const rotulo of ['A pagar', 'Atrasadas', 'Pagas', 'Todas']) expect(h).toContain(rotulo)
    expect(h).toContain('Contas do mês')
    // na aba "A pagar": Luz (fixa em aberto) e Escola (compra sem cartão); Aluguel já está paga e não aparece nesta aba
    expect(h).toContain('Luz'); expect(h).toContain('Escola'); expect(h).not.toContain('Aluguel')
    expect(h.indexOf('Contas do mês')).toBeLessThan(h.indexOf('Por categoria')) // o resumo por categoria vem depois da lista
  })
  it('cada conta tem uma ação principal "Pagar" com nome acessível', () => {
    const h = html()
    expect(h).toContain('aria-label="Pagar Luz"')
    expect(h).toContain('aria-label="Selecionar Luz"')
  })
  it('o resumo por categoria continua disponível, recolhido', () => {
    const h = html()
    expect(h).toContain('Por categoria'); expect(h).toContain('falta R$')
  })
})
