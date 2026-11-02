import { describe, it, expect, vi } from 'vitest'
import { renderToString } from 'react-dom/server'

vi.mock('../supabase', () => ({ sb: { rpc: async () => ({ data: {}, error: null }), from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) } }))
vi.mock('../automacoes', () => ({ lerFaturaPdf: async () => ({ ok: false, erro: 'x' }) }))
import Assistente from '../../components/importacao/Assistente'

const mes = new Date().toISOString().slice(0, 7)
const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`
const compra = (o) => ({ data_compra: dia(10), descricao: 'X', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 10, parcelas: 1, origem: 'manual', ...o })
const store = {
  cartoes: [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', vencimento: 10, ativo: true }],
  categorias: [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }, { id: 'k2', nome: 'Transporte', subcategorias: ['Combustível'] }],
  pessoas: [{ id: 'p1', nome: 'Giovanna' }], fixos: [], regras: [], aliases: [], importarFatura: async () => ({}),
  compras: [compra({ id: 'e1', data_compra: dia(3), descricao: 'MERCADO EXTRA', valor_total: 100 }), compra({ id: 'p1', data_compra: dia(12), descricao: 'Padaria Sao Joao Ltda', valor_total: 40 }), compra({ id: 'v1', data_compra: dia(5), descricao: 'POSTO SHELL', categoria: 'Transporte', subcategoria: 'Combustível', valor_total: 200 }), compra({ id: 's1', data_compra: dia(8), descricao: 'LOJA SO NO APP', valor_total: 77 })],
}
const r = (data, descricao, valor, extra = {}) => ({ data: dia(data), descricao, valor: String(valor), categoria: 'Alimentação', parcela_atual: '', parcela_total: '', cartao: 'Nubank', observacao: '', ...extra })
const registros = [r(3, 'MERCADO EXTRA', 100), r(14, 'Padaria Sao Joao', 40), r(5, 'POSTO SHELL', 205, { categoria: 'Transporte' }), r(15, 'DELIVERY NOVO', 60), r(16, 'Geladeira Brastemp', 250, { categoria: '', parcela_atual: '3', parcela_total: '10' }), r(17, 'Pagamento recebido', -2000, { categoria: '' }), r(18, 'Estorno Loja Y', -30)]
const html = (inicial) => renderToString(<Assistente store={store} irPara={() => {}} inicial={inicial} />).replace(/<!-- -->/g, '')

describe('assistente de importação (render)', () => {
  it('etapa 1 sem arquivo: escolher PDF ou CSV, indicador com 4 etapas e aviso de que nada é gravado', () => {
    const h = html(null)
    expect(h).toContain('Qual fatura você quer conferir?')
    expect(h).toContain('PDF da fatura')
    expect(h).toContain('CSV padronizado')
    expect(h).toContain('nada é gravado até você confirmar')
    for (const e of ['Selecionar', 'Analisar', 'Revisar', 'Confirmar']) expect(h).toContain(e)
  })
  it('etapa 1 com arquivo: resumo da leitura, cartão identificado e mês', () => {
    const h = html({ registros, nome: 'fatura.csv', etapa: 1 })
    expect(h).toContain('fatura.csv')
    expect(h).toContain('Total extraído')
    expect(h).toContain('Analisar lançamentos')
    expect(h).toMatch(/<option value="c1" selected="">Nubank/)
  })
  it('PDF com total do banco diferente da soma lida: pede para conferir a leitura', () => {
    const h = html({ registros, nome: 'fatura.pdf', origem: 'pdf', totalBanco: 700, descartadas: 2, etapa: 1 })
    expect(h).toContain('PDF lido por IA')
    expect(h).toContain('Confira esta leitura')
    expect(h).toContain('2 linhas sem data ou valor válido')
  })
  it('etapa 2: grupos calculados na hora e painel de conciliação', () => {
    const h = html({ registros, etapa: 2 })
    expect(h).toContain('7 lançamentos identificados')
    expect(h).toContain('Já registradas')
    expect(h).toContain('Precisam de revisão')
    expect(h).toContain('Só no aplicativo')
    expect(h).toContain('Conciliação parcial')
    expect(h).toContain('pagamento da fatura anterior')
    expect(h).toContain('Revisar pendências')
    expect(h).not.toContain('Confirmar importação')
  })
  it('etapa 3: pendências com comparação e as ações de cada tipo', () => {
    const h = html({ registros, etapa: 3 })
    expect(h).toContain('Parece já lançada')
    expect(h).toContain('Na fatura')
    expect(h).toContain('No aplicativo')
    expect(h).toContain('É a mesma compra')
    expect(h).toContain('É outra compra')
    expect(h).toContain('Revisar depois')
    expect(h).toContain('Manter o valor lançado')
    expect(h).toContain('Atualizar para')
    expect(h).toContain('Esta é a parcela 3 de 10')
    expect(h).toContain('Criar parcelamento completo')
    expect(h).toContain('Registrar só esta parcela')
    expect(h).toContain('data estimada')
    expect(h).toContain('No cartão: Padaria Sao Joao') // descrição original preservada
  })
  it('etapa 4: separa o que será gravado do que continua em aberto e os dois estados', () => {
    const h = html({ registros, etapa: 4 })
    expect(h).toContain('Será gravado')
    expect(h).toContain('Continua em aberto')
    expect(h).toContain('não serão corrigidas automaticamente')
    expect(h).toContain('Importação:')
    expect(h).toContain('Conciliação depois de gravar:')
    expect(h).toContain('Confirmar importação')
  })
})
