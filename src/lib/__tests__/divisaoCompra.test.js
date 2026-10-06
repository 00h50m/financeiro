import { describe, it, expect } from 'vitest'
import { validarDivisao, restante, somaPartes, planoDeDivisao, planoDeUniao, comprasComGruposSomados, partesDoGrupo } from '../divisaoCompra'

const categorias = [
  { nome: 'Casa', subcategorias: ['Decoração', 'Limpeza'] },
  { nome: 'Animais', subcategorias: ['Ração'] },
]
const parte = (valor, categoria = 'Casa', subcategoria = 'Decoração', extra = {}) => ({ valor, categoria, subcategoria, ...extra })

describe('divisão de compra em categorias', () => {
  it('soma e restante em centavos (sem erro de ponto flutuante)', () => {
    expect(somaPartes([{ valor: '0.1' }, { valor: '0.2' }])).toBe(0.3)
    expect(restante(100, [{ valor: '33.33' }, { valor: '33.33' }])).toBe(33.34)
    expect(restante('100', [{ valor: 60 }, { valor: 50 }])).toBe(-10)
  })
  it('só valida quando as partes fecham exatamente o total', () => {
    expect(validarDivisao(300, [parte(100), parte(150, 'Animais', 'Ração'), parte(50, 'Casa', 'Limpeza')], categorias)).toEqual([])
    expect(validarDivisao(300, [parte(100), parte(150)], categorias).join(' ')).toContain('Faltam R$ 50,00')
    expect(validarDivisao(300, [parte(200), parte(150)], categorias).join(' ')).toContain('passam do total em R$ 50,00')
  })
  it('exige duas partes, valores e categoria/subcategoria válidas', () => {
    expect(validarDivisao(100, [parte(100)], categorias).join(' ')).toContain('pelo menos duas')
    expect(validarDivisao(100, [parte(100), parte('')], categorias).join(' ')).toContain('Parte 2: informe o valor')
    expect(validarDivisao(100, [parte(50), parte(50, 'Animais', 'Decoração')], categorias).join(' ')).toContain('Parte 2: escolha')
    expect(validarDivisao(0, [parte(0), parte(0)], categorias).join(' ')).toContain('valor total')
  })
  it('plano novo: uma linha por parte, mesma base e mesmo grupo', () => {
    const base = { data_compra: '2026-10-05', descricao: 'MERCADO LIVRE', pessoa: 'Giovanna', cartao_id: 'c1', parcelas: 3 }
    const p = planoDeDivisao({ base, itens: [parte('100'), parte('200', 'Animais', 'Ração', { identificacao: ' Ração ' })], grupoId: 'g1' })
    expect(p.atualizar).toEqual([])
    expect(p.remover).toEqual([])
    expect(p.inserir).toHaveLength(2)
    expect(p.inserir.map((r) => r.valor_total)).toEqual([100, 200])
    expect(p.inserir.every((r) => r.grupo_id === 'g1' && r.parcelas === 3 && r.descricao === 'MERCADO LIVRE' && r.cartao_id === 'c1')).toBe(true)
    expect(p.inserir[1].identificacao).toBe('Ração')
    expect(p.inserir[0].identificacao).toBeNull()
  })
  it('sem a coluna grupo_id no banco: as partes saem sem o campo', () => {
    const p = planoDeDivisao({ base: {}, itens: [parte(1), parte(2)], grupoId: null })
    expect('grupo_id' in p.inserir[0]).toBe(false)
  })
  it('edição: atualiza as que existem, insere as novas e remove as que sumiram', () => {
    const existentes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const p = planoDeDivisao({ base: { descricao: 'X' }, itens: [parte(10, 'Casa', 'Decoração', { id: 'a' }), parte(20, 'Casa', 'Limpeza', { id: 'c' }), parte(5)], existentes, grupoId: 'g' })
    expect(p.atualizar.map((u) => u.id)).toEqual(['a', 'c'])
    expect(p.inserir).toHaveLength(1)
    expect(p.remover).toEqual(['b'])
  })
  it('desfazer a divisão: a primeira parte vira a compra inteira e as outras saem', () => {
    const p = planoDeUniao({ base: { descricao: 'X' }, total: 300, categoria: 'Casa', subcategoria: 'Decoração', existentes: [{ id: 'a' }, { id: 'b' }] })
    expect(p.atualizar[0]).toMatchObject({ id: 'a', dados: { valor_total: 300, grupo_id: null, categoria: 'Casa' } })
    expect(p.remover).toEqual(['b'])
  })
  it('para casar com fatura/notificação o grupo vale uma compra só (soma das partes)', () => {
    const compras = [
      { id: 'a', grupo_id: 'g', valor_total: 100.1, descricao: 'ML' },
      { id: 'x', grupo_id: null, valor_total: 20 },
      { id: 'b', grupo_id: 'g', valor_total: 199.9, descricao: 'ML' },
    ]
    const somadas = comprasComGruposSomados(compras)
    expect(somadas).toHaveLength(2)
    expect(somadas[0]).toMatchObject({ id: 'a', valor_total: 300, partes: 2 })
    expect(compras[0].valor_total).toBe(100.1) // não altera o original
    expect(partesDoGrupo(compras, 'g').map((c) => c.id)).toEqual(['a', 'b'])
    expect(partesDoGrupo(compras, null)).toEqual([])
  })
})
