import { describe, it, expect } from 'vitest'
import { avisoTeto } from '../alertaTeto'
import { cartoes } from './fixtures'

const nova = { data_compra: '2026-10-04', valor_total: 150, parcelas: 1, cartao_id: null, categoria: 'Alimentação', descricao: 'mercado' }
const antiga = (valor) => ({ data_compra: '2026-10-01', valor_total: valor, parcelas: 1, cartao_id: null, categoria: 'Alimentação', descricao: 'x' })
const teto = [{ categoria: 'Alimentação', valor: 500 }]
const rodar = (antes, o = {}) => avisoTeto({ compra: nova, compras: [antiga(antes), nova], cartoes, orcamentos: teto, ...o })

describe('aviso de teto', () => {
  it('estourou com esta compra: avisa quanto passou', () => {
    const msg = rodar(400)
    expect(msg).toContain('Alimentação')
    expect(msg).toContain('passou do teto')
    expect(msg).toContain('110%')
  })
  it('chegou perto (80%) com esta compra', () => {
    expect(rodar(260)).toContain('chegou perto')
  })
  it('já estava estourado antes: não repete o aviso', () => {
    expect(rodar(600)).toBeNull()
  })
  it('longe do teto: não avisa', () => {
    expect(rodar(50)).toBeNull()
  })
  it('sem teto para a categoria: não avisa', () => {
    expect(rodar(400, { orcamentos: [{ categoria: 'Saúde', valor: 100 }] })).toBeNull()
    expect(rodar(400, { orcamentos: [] })).toBeNull()
  })
  it('conta fixa da categoria entra na soma', () => {
    const fixos = [{ ativo: true, categoria: 'Alimentação', valor: 300, nome: 'Plano' }]
    expect(rodar(100, { fixos })).toContain('passou do teto')
  })
})
