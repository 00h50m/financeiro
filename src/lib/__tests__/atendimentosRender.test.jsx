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
