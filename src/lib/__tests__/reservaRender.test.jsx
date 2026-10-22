import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('../useStore', () => ({}))
import Reserva from '../../components/Reserva'

const base = { fixos: [], fixosPagamentos: [], cartoes: [], compras: [], faturas: [], rendas: [], comprasPagamentos: [], comprasPagamentosOk: true, rendaSazonal: [], config: {}, configOk: true, definirConfig: () => {}, metas: [], metasMovimentos: [], metasOk: false, updateMeta: () => {}, registrarMovimentoMeta: () => {} }
describe('Reserva (render)', () => {
  it('com lugares cadastrados mostra total, na hora e o plano desligado', () => {
    const html = renderToString(<Reserva store={{ ...base, reservaFontesOk: true, reservaFontes: [{ id: 'a', nome: 'Poupança Caixa', valor: 2540, liquidez: 'na_hora' }, { id: 'b', nome: 'FGTS', valor: 3000, liquidez: 'travado' }], salvarFonteReserva: () => {}, removerFonteReserva: () => {} }} />)
    expect(html).toContain('Para emergência')
    expect(html).toContain('Poupança Caixa')
    expect(html).toContain('Disponível na hora')
    expect(html).toContain('Criar plano de cobertura')
  })
  it('sem a tabela avisa do SQL e mantém o campo de valor único', () => {
    const html = renderToString(<Reserva store={{ ...base, reservaFontesOk: false, reservaFontes: [] }} />)
    expect(html).toContain('inbox/31_reserva_fontes.sql')
    expect(html).toContain('2.540')
  })
  it('com o plano ligado mostra meta e ajuste', () => {
    const html = renderToString(<Reserva store={{ ...base, config: { reserva_plano_ativo: true }, reservaFontesOk: true, reservaFontes: [] }} />)
    expect(html).toContain('Ajustar o plano')
  })
})
