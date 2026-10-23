import { describe, it, expect } from 'vitest'
import { relatorioAtendimentos, csvAtendimentos, mesesEntre } from '../atendimentosRelatorio'

const at = (id, cliente, data, valor, extra = {}) => ({ id, cliente_id: cliente, servico_id: 's1', servico_nome: 'Limpeza de pele', data, duracao_min: 60, valor, custo_material: 20, status: 'realizado', pago: true, ...extra })
const clientes = [{ id: 'c1', nome: 'Ana', ativo: true }, { id: 'c2', nome: 'Bia', ativo: true }]
const pacotes = [{ id: 'p1', cliente_id: 'c2', sessoes_total: 4, valor: 400, data_venda: '2026-09-02', ativo: true }]
const atendimentos = [
  at(1, 'c1', '2026-09-05', 150), at(2, 'c1', '2026-10-05', 150), at(3, 'c2', '2026-09-10', 0, { pacote_id: 'p1' }), at(4, 'c2', '2026-10-12', 0, { pacote_id: 'p1' }),
  at(5, 'c2', '2026-10-15', 200, { servico_id: 's2', servico_nome: 'Peeling', custo_material: 50 }), at(6, 'c1', '2026-10-20', 99, { status: 'cancelado' }),
]
const vendas = [{ produto_id: 'pr1', produto_nome: 'Creme', data: '2026-10-08', quantidade: 2, valor_unit: 60, custo_unit: 25 }]
const base = { atendimentos, pacotes, vendas, clientes, de: '2026-09', ate: '2026-10', hoje: '2026-10-23' }

describe('relatório de atendimentos', () => {
  it('meses do período', () => { expect(mesesEntre('2026-11', '2027-01')).toEqual(['2026-11', '2026-12', '2027-01']) })
  it('totais: sessão de pacote conta pelo valor proporcional e produtos entram na receita', () => {
    const r = relatorioAtendimentos(base)
    expect(r.total.receitaAtend).toBe(150 + 150 + 100 + 100 + 200)
    expect(r.total.receitaProd).toBe(120)
    expect(r.total.receita).toBe(700 + 120)
    expect(r.total.material).toBe(20 * 4 + 50)
    expect(r.total.lucro).toBe(700 - 130 + 70)
    expect(r.total.atendimentos).toBe(5)
    expect(r.total.ticket).toBe(140)
  })
  it('por serviço e por cliente', () => {
    const r = relatorioAtendimentos(base)
    expect(r.porServico.map((g) => [g.nome, g.qtd, g.receita])).toEqual([['Limpeza de pele', 4, 500], ['Peeling', 1, 200]])
    expect(r.porServico[0].porHora).toBe(125)
    expect(r.porCliente.map((g) => [g.nome, g.receita])).toEqual([['Bia', 400], ['Ana', 300]])
    expect(r.porCliente[0].pct + r.porCliente[1].pct).toBeCloseTo(1, 5)
  })
  it('por mês: caixa inclui venda de pacote e produtos; variação e meta', () => {
    const r = relatorioAtendimentos({ ...base, metaMensal: 700 })
    expect(r.meses[0]).toMatchObject({ mes: '2026-09', atendimentos: 2, receita: 250, caixa: 150 + 400 })
    expect(r.meses[1]).toMatchObject({ mes: '2026-10', caixa: 150 + 200 + 120 })
    expect(r.meses[1].variacao).toBeCloseTo((470 - 550) / 550, 5)
    expect(r.meses[0].abaixoDaMeta).toBe(true)
  })
  it('produtos e CSV', () => {
    const r = relatorioAtendimentos(base)
    expect(r.produtos).toEqual([{ chave: 'pr1', nome: 'Creme', qtd: 2, receita: 120, lucro: 70 }])
    expect(csvAtendimentos(r, 'servico').split('\n')[0]).toContain('Serviço;Atendimentos')
    expect(csvAtendimentos(r, 'cliente').split('\n')).toHaveLength(1 + r.porCliente.length)
    expect(csvAtendimentos(r, 'sumidas').split('\n')[0]).toContain('Dias sem vir')
  })
})
