import { describe, it, expect } from 'vitest'
import { interpretarMensagem, parseValor, parseData } from '../parserTelegram'
import { cartoes, pessoas } from './fixtures'

const gente = [
  { id: 'p-gi', nome: 'Giovanna', apelidos: ['gi'] },
  { id: 'p-sa', nome: 'Sabrina', apelidos: ['sa'] },
  { id: 'p-casa', nome: 'Casa', apelidos: [] },
]
const cards = [
  { id: 'c-nu', nome: 'Nubank', titular: 'Giovanna' },
  { id: 'c-in', nome: 'Inter', titular: 'Sabrina' },
]
const ler = (t, o = {}) => interpretarMensagem(t, { cartoes: cards, pessoas: gente, hoje: '2026-10-04', ...o })

describe('mensagens do enunciado', () => {
  it('gastei 89,90 no Outback no Nubank', () => {
    expect(ler('gastei 89,90 no Outback no Nubank')).toMatchObject({ valor: 89.9, descricao: 'Outback', cartao_id: 'c-nu', pessoa_id: null })
  })
  it('mercado 187,40 inter gi', () => {
    expect(ler('mercado 187,40 inter gi')).toMatchObject({ valor: 187.4, descricao: 'mercado', cartao_id: 'c-in', pessoa_id: 'p-gi' })
  })
  it('49,90 farmácia no inter', () => {
    expect(ler('49,90 farmácia no inter')).toMatchObject({ valor: 49.9, descricao: 'farmácia', cartao_id: 'c-in' })
  })
  it('uber 32,50 (sem cartão informado)', () => {
    expect(ler('uber 32,50')).toMatchObject({ valor: 32.5, descricao: 'uber', cartao_id: null, cartaoAmbiguo: null, forma_pagamento: null })
  })
  it('comprei ração por 189,90 no nubank', () => {
    expect(ler('comprei ração por 189,90 no nubank')).toMatchObject({ valor: 189.9, descricao: 'ração', cartao_id: 'c-nu' })
  })
  it('gastei 120 no mercado -> falta o cartão', () => {
    const r = ler('gastei 120 no mercado')
    expect(r).toMatchObject({ valor: 120, descricao: 'mercado', cartao_id: null })
  })
})

describe('campos', () => {
  it('mantém "de" no meio do nome', () => expect(ler('pão de açúcar 32,10 nubank').descricao).toBe('pão de açúcar'))
  it('valores: R$, milhar, ponto decimal, inteiro', () => {
    expect(ler('r$ 1.234,56 notebook').valor).toBe(1234.56)
    expect(ler('lanche R$15').valor).toBe(15)
    expect(ler('lanche 15.50').valor).toBe(15.5)
    expect(parseValor('R$ 89,90')).toBe(89.9)
    expect(parseValor('abc')).toBeNull()
  })
  it('dois valores diferentes e do mesmo tipo = ambíguo, não escolhe', () => {
    const r = ler('2 pizzas 80')
    expect(r.valor).toBeNull()
    expect(r.valorAmbiguo).toBe(true)
  })
  it('parcelas não viram valor', () => {
    expect(ler('tênis 300,00 em 3x no nubank')).toMatchObject({ valor: 300, parcelas: 3, descricao: 'tênis' })
    expect(ler('geladeira 2000 em 10 vezes').parcelas).toBe(10)
  })
  it('data: ontem, dd/mm e inválida', () => {
    expect(ler('uber 20 ontem').data_evento).toBe('2026-10-03')
    expect(ler('uber 20 em 02/10').data_evento).toBe('2026-10-02')
    expect(ler('uber 20 31/02').dataInvalida).toBe(true)
    expect(ler('uber 20 15/12').data_evento).toBe('2025-12-15') // dezembro ainda não chegou: ano anterior
    expect(parseData('amanhã', '2026-10-04')).toEqual({ invalida: true }) // gasto não pode ser futuro
    expect(ler('mercado 20 amanhã')).toMatchObject({ dataInvalida: true, data_evento: null, descricao: 'mercado' })
    expect(ler('mercado 20 inter 05/10')).toMatchObject({ dataInvalida: true, data_evento: null }) // amanhã, sem ano: não vira ano passado
    expect(ler('mercado 20 inter 04/10').data_evento).toBe('2026-10-04')
  })
  it('forma de pagamento sem cartão', () => {
    expect(ler('padaria 12,50 pix')).toMatchObject({ forma_pagamento: 'pix', descricao: 'padaria', cartao_id: null })
    expect(ler('feira 40 dinheiro').forma_pagamento).toBe('dinheiro')
    expect(ler('mercado 50 sem cartão').forma_pagamento).toBe('outro')
  })
  it('observação', () => {
    const r = ler('presente 80 nubank obs: aniversário da mãe')
    expect(r.obs).toBe('aniversário da mãe')
    expect(r.descricao).toBe('presente')
  })
})

describe('pessoa e cartão ambíguos', () => {
  it('"Casa Bahia" não vira a pessoa Casa; no fim da frase vira', () => {
    expect(ler('casa bahia 300 nubank').pessoa_id).toBeNull()
    expect(ler('mercado 90 nubank casa').pessoa_id).toBe('p-casa')
  })
  it('duas pessoas na frase = ambíguo', () => {
    expect(ler('mercado 90 gi sa').pessoaAmbigua).toEqual(['p-gi', 'p-sa'])
  })
  it('dois cartões "Nubank": desempata pelo titular (quem escreve)', () => {
    const dois = [{ id: 'nu-gi', nome: 'Nubank Gi', titular: 'Giovanna' }, { id: 'nu-sa', nome: 'Nubank Sa', titular: 'Sabrina' }]
    expect(ler('mercado 50 nubank', { cartoes: dois, remetente_pessoa_id: 'p-sa' }).cartao_id).toBe('nu-sa')
    expect(ler('mercado 50 nubank', { cartoes: dois }).cartaoAmbiguo).toEqual(['nu-gi', 'nu-sa'])
    expect(ler('mercado 50 nubank sa', { cartoes: dois }).cartao_id).toBe('nu-sa')
    expect(ler('mercado 50 nubank gi', { cartoes: dois }).cartao_id).toBe('nu-gi')
  })
})
