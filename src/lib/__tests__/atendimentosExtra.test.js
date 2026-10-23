import { describe, it, expect } from 'vitest'
import { saldoPacote, situacaoPacote, pacotesUsaveis, valorVenda, lucroVenda, novoEstoque, retornosPendentes, clientesSumidas, aniversariantes, mensagemRetorno, mensagemAniversario } from '../atendimentosExtra'
import { atendimentosPorMes } from '../atendimentos'

const at = (id, cliente, data, status, extra = {}) => ({ id, cliente_id: cliente, servico_id: 's1', servico_nome: 'Limpeza de pele', data, duracao_min: 60, valor: 150, custo_material: 0, status, pago: true, ...extra })
const hoje = '2026-10-23'

describe('pacotes', () => {
  const pacote = { id: 'p1', cliente_id: 'c1', nome: '5 limpezas', sessoes_total: 5, valor: 500, validade: '2027-01-01', ativo: true }
  const lista = [at(1, 'c1', '2026-09-01', 'realizado', { pacote_id: 'p1', valor: 0 }), at(2, 'c1', '2026-10-01', 'realizado', { pacote_id: 'p1', valor: 0 }), at(3, 'c1', '2026-11-01', 'agendado', { pacote_id: 'p1', valor: 0 }), at(4, 'c1', '2026-10-05', 'cancelado', { pacote_id: 'p1', valor: 0 })]
  it('saldo: feitas, reservadas e quantas restam marcar', () => {
    expect(saldoPacote(pacote, lista)).toEqual({ total: 5, feitas: 2, reservadas: 1, restam: 2, faltaFazer: 3, valorSessao: 100 })
  })
  it('situação e pacotes usáveis', () => {
    expect(situacaoPacote(pacote, lista, hoje)).toBe('ativo')
    expect(situacaoPacote({ ...pacote, validade: '2026-10-01' }, lista, hoje)).toBe('vencido')
    expect(situacaoPacote({ ...pacote, sessoes_total: 2 }, lista, hoje)).toBe('esgotado')
    expect(situacaoPacote({ ...pacote, ativo: false }, lista, hoje)).toBe('inativo')
    expect(pacotesUsaveis([pacote], lista, 'c1', hoje)).toHaveLength(1)
    expect(pacotesUsaveis([pacote], lista, 'c2', hoje)).toHaveLength(0)
    expect(pacotesUsaveis([{ ...pacote, sessoes_total: 3 }], lista, 'c1', hoje)).toHaveLength(0) // 2 feitas + 1 reservada = 3: nada a marcar
  })
  it('a receita do mês vem da venda do pacote e das vendas de produto, não das sessões', () => {
    const vendas = [{ data: '2026-10-10', quantidade: 2, valor_unit: 40, custo_unit: 15, pago: false }]
    const m = atendimentosPorMes([...lista, at(9, 'c2', '2026-10-12', 'realizado', { valor: 200 })], { pacotes: [{ ...pacote, data_venda: '2026-09-01', pago: true }, { ...pacote, id: 'p2', data_venda: '2026-10-02', pago: false }], vendas })
    expect(m['2026-09']).toMatchObject({ valor: 500, recebido: 500, aReceber: 0 })
    expect(m['2026-10']).toMatchObject({ valor: 500 + 200 + 80, recebido: 200, aReceber: 500 + 80 })
  })
})

describe('produtos', () => {
  it('valor, lucro e estoque', () => {
    const v = { quantidade: 3, valor_unit: 50, custo_unit: 20 }
    expect(valorVenda(v)).toBe(150)
    expect(lucroVenda(v)).toBe(90)
    expect(novoEstoque({ estoque: 10 }, 3)).toBe(7)
    expect(novoEstoque({ estoque: 7 }, -3)).toBe(10)
  })
})

describe('retornos e aniversários', () => {
  const clientes = [{ id: 'c1', nome: 'Maria Souza', ativo: true, nascimento: '1990-10-30' }, { id: 'c2', nome: 'Bia', ativo: true }, { id: 'c3', nome: 'Carla', ativo: false }]
  const servicos = [{ id: 's1', nome: 'Limpeza de pele', retorno_dias: 30 }, { id: 's2', nome: 'Massagem' }]
  it('retorno: vence em breve, atrasado, já agendado, adiado e serviço sem retorno', () => {
    const atend = [at(1, 'c1', '2026-09-25', 'realizado'), at(2, 'c2', '2026-08-01', 'realizado'), at(3, 'c3', '2026-09-01', 'realizado')]
    const r = retornosPendentes({ clientes, atendimentos: atend, servicos, hoje })
    expect(r.map((x) => [x.cliente.id, x.dias])).toEqual([['c2', -53], ['c1', 2]])
    expect(retornosPendentes({ clientes, atendimentos: [...atend, at(4, 'c2', '2026-11-05', 'agendado')], servicos, hoje }).map((x) => x.cliente.id)).toEqual(['c1'])
    expect(retornosPendentes({ clientes: [{ ...clientes[0], retorno_adiado_ate: '2026-10-30' }], atendimentos: atend, servicos, hoje })).toEqual([])
    expect(retornosPendentes({ clientes, atendimentos: [at(5, 'c1', '2026-09-25', 'realizado', { servico_id: 's2' })], servicos, hoje })).toEqual([])
    expect(retornosPendentes({ clientes, atendimentos: [at(6, 'c1', '2026-01-01', 'realizado')], servicos, hoje })).toEqual([]) // muito antigo (> 180 dias)
  })
  it('clientes sumidas com média mensal', () => {
    const atend = [at(1, 'c1', '2026-05-01', 'realizado', { valor: 100 }), at(2, 'c1', '2026-06-01', 'realizado', { valor: 100 }), at(3, 'c2', '2026-10-10', 'realizado')]
    const s = clientesSumidas({ clientes, atendimentos: atend, hoje })
    expect(s).toHaveLength(1)
    expect(s[0]).toMatchObject({ ultimo: '2026-06-01', total: 2 })
    expect(s[0].porMes).toBeGreaterThan(0)
  })
  it('aniversariantes dos próximos dias, com a idade que faz', () => {
    expect(aniversariantes(clientes, hoje, 14)).toEqual([{ cliente: clientes[0], data: '2026-10-30', dias: 7, idade: 36 }])
    expect(aniversariantes(clientes, '2026-12-28', 14)).toEqual([])
    expect(aniversariantes([{ id: 'x', nome: 'Z', nascimento: '1980-01-02' }], '2026-12-28', 14)[0]).toMatchObject({ data: '2027-01-02', dias: 5, idade: 47 })
  })
  it('mensagens usam o primeiro nome', () => {
    expect(mensagemRetorno({ cliente: clientes[0], servico_nome: 'Limpeza de pele' })).toContain('Oi, Maria!')
    expect(mensagemRetorno({ cliente: clientes[0], servico_nome: 'Limpeza de pele' })).toContain('limpeza de pele')
    expect(mensagemAniversario({ cliente: clientes[0] })).toContain('Maria')
  })
})
