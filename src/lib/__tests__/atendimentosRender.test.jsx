import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import Atendimentos from '../../components/Atendimentos'

const base = { clientes: [], servicos: [], atendimentos: [], atendimentosOk: true, salvarCliente: () => {}, salvarServico: () => {}, salvarAtendimento: () => {}, removerCliente: () => {}, removerServico: () => {}, removerAtendimento: () => {} }
const hoje = new Date().toISOString().slice(0, 10)
describe('Atendimentos (render)', () => {
  it('sem a tabela avisa do SQL', () => {
    expect(renderToString(<Atendimentos store={{ ...base, atendimentosOk: false }} />)).toContain('inbox/34_atendimentos.sql')
  })
  it('vazio convida a cadastrar a primeira cliente', () => {
    const html = renderToString(<Atendimentos store={base} />)
    expect(html).toContain('Comece cadastrando a primeira cliente')
    expect(html).toContain('Faturado')
  })
  it('com dados mostra a agenda do mês com o valor e a cliente', () => {
    const store = { ...base, clientes: [{ id: 'c1', nome: 'Maria Souza', telefone: '11912345678' }], servicos: [{ id: 's1', nome: 'Limpeza de pele', preco: 180, duracao_min: 60, custo_material: 25 }],
      atendimentos: [{ id: 'a1', cliente_id: 'c1', servico_id: 's1', servico_nome: 'Limpeza de pele', data: hoje, horario: '14:00', duracao_min: 60, valor: 180, custo_material: 25, status: 'agendado', pago: false }] }
    const html = renderToString(<Atendimentos store={store} />)
    expect(html).toContain('Maria Souza')
    expect(html).toContain('Limpeza de pele')
    expect(html).toContain('✓ Realizado')
    expect(html).toContain('WhatsApp')
  })
})

describe('Atendimentos parte 2 (render)', () => {
  const extra = {
    ...base, pacotesOk: true, clientes: [{ id: 'c1', nome: 'Maria Souza', telefone: '11912345678', ativo: true, nascimento: `1990-${hoje.slice(5, 7)}-${hoje.slice(8, 10)}` }],
    servicos: [{ id: 's1', nome: 'Limpeza de pele', preco: 180, duracao_min: 60, custo_material: 25, retorno_dias: 30, ativo: true }],
    atendimentos: [{ id: 'a1', cliente_id: 'c1', servico_id: 's1', servico_nome: 'Limpeza de pele', data: '2020-01-10', duracao_min: 60, valor: 0, custo_material: 25, status: 'realizado', pacote_id: 'p1', pago: true }],
    pacotes: [{ id: 'p1', cliente_id: 'c1', nome: '5 limpezas', sessoes_total: 5, valor: 600, data_venda: '2020-01-02', pago: false, ativo: true }],
    produtos: [{ id: 'pr1', nome: 'Creme', preco: 89, custo: 40, estoque: 1, ativo: true }],
    vendasProdutos: [{ id: 'v1', produto_id: 'pr1', produto_nome: 'Creme', data: hoje, quantidade: 1, valor_unit: 89, custo_unit: 40, pago: true }],
    salvarPacote: () => {}, removerPacote: () => {}, salvarProduto: () => {}, removerProduto: () => {}, registrarVendaProduto: () => {}, removerVendaProduto: () => {}, salvarVendaProduto: () => {},
  }
  it('com a parte 2 mostra as abas novas', () => {
    const html = renderToString(<Atendimentos store={extra} />)
    for (const t of ['Retornos', 'Pacotes', 'Produtos', 'Relatório']) expect(html).toContain(t)
  })
  it('sem a parte 2 (SQL 35 não rodado) a agenda continua funcionando, sem as abas novas', () => {
    const html = renderToString(<Atendimentos store={{ ...extra, pacotesOk: false }} />)
    expect(html).toContain('Agenda')
    expect(html).not.toContain('>Pacotes<')
  })
})

describe('Atendimentos: cada visão renderiza', () => {
  const dataIso = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)
  const st = {
    ...base, pacotesOk: true,
    clientes: [{ id: 'c1', nome: 'Maria Souza', telefone: '11912345678', ativo: true, nascimento: `1990-${dataIso(3).slice(5)}` }, { id: 'c2', nome: 'Bia', ativo: true }],
    servicos: [{ id: 's1', nome: 'Limpeza de pele', preco: 180, duracao_min: 60, custo_material: 25, retorno_dias: 30, ativo: true }],
    atendimentos: [
      { id: 'a1', cliente_id: 'c1', servico_id: 's1', servico_nome: 'Limpeza de pele', data: dataIso(-45), duracao_min: 60, valor: 180, custo_material: 25, status: 'realizado', pago: true },
      { id: 'a2', cliente_id: 'c2', servico_id: 's1', servico_nome: 'Limpeza de pele', data: dataIso(-100), duracao_min: 60, valor: 0, custo_material: 25, status: 'realizado', pacote_id: 'p1', pago: true },
    ],
    pacotes: [{ id: 'p1', cliente_id: 'c2', nome: '5 limpezas', sessoes_total: 5, valor: 600, data_venda: dataIso(-100), pago: false, ativo: true }],
    produtos: [{ id: 'pr1', nome: 'Creme', preco: 89, custo: 40, estoque: 1, ativo: true }],
    vendasProdutos: [{ id: 'v1', produto_id: 'pr1', produto_nome: 'Creme', data: dataIso(-1), quantidade: 1, valor_unit: 89, custo_unit: 40, pago: false }],
  }
  it('retornos: para chamar e aniversário', () => {
    const html = renderToString(<Atendimentos store={st} visaoInicial="retornos" />)
    expect(html).toContain('Chamar no WhatsApp')
    expect(html).toContain('Dar parabéns')
    expect(html).toContain('wa.me/5511912345678?text=')
  })
  it('pacotes: sessões feitas, valor por sessão e a receber', () => {
    const html = renderToString(<Atendimentos store={st} visaoInicial="pacotes" />).replace(/<!-- -->/g, '')
    expect(html).toContain('5 limpezas')
    expect(html).toContain('1 de 5 sessões feitas')
    expect(html).toContain('a receber')
    expect(html).toContain('Marcar sessão')
  })
  it('produtos: estoque e últimas vendas', () => {
    const html = renderToString(<Atendimentos store={st} visaoInicial="produtos" />)
    expect(html).toContain('Creme')
    expect(html).toContain('últimas vendas')
    expect(html).toContain('recebi')
  })
  it('relatório: serviço, caixa e sumidas', () => {
    const html = renderToString(<Atendimentos store={st} visaoInicial="relatorio" />)
    expect(html).toContain('Ticket médio')
    expect(html).toContain('Limpeza de pele')
  })
})
