import { describe, it, expect } from 'vitest'
import { analisarLinhas, prepararRegras, sugerirCategoriaLinha, problemasDaLinha, resumirAnalise, resolverCartaoPorNome, valorTotalLinha, valorParcelaLinha, sugerirNomeLinha } from '../importacao'
import { normalizarData } from '../csvFormato'

const categorias = [
  { nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] },
  { nome: 'Transporte', subcategorias: ['Uber/99/Táxi'] },
  { nome: 'Saúde', subcategorias: ['Farmácia'] },
]
const cartoes = [{ id: 'c1', nome: 'Nubank' }, { id: 'c2', nome: 'Inter' }]
let seq = 0
const compra = (o) => ({ id: 'k' + ++seq, data_compra: '2026-09-12', descricao: 'Farmacia Local', cartao_id: 'c1', valor_total: 40, parcelas: 1, origem: 'csv', ...o })
const linha = (o) => ({ data: '2026-09-12', descricao: 'Farmacia Local', valor: '40', cartao_id: 'c1', parcela_atual: '', parcela_total: '', ...o })
const tipos = (ls, compras, extra = {}) => analisarLinhas(ls, { compras, ...extra }).map((r) => r.correspondencia?.tipo || null)

describe('o mesmo arquivo importado de novo', () => {
  const csv = [
    linha({ data: '2026-09-05', descricao: 'Uber Trip 4821', valor: '25' }),
    linha({ data: '2026-09-12', descricao: 'Farmacia Local' }),
    linha({ data: '2026-09-12', descricao: 'Farmacia Local' }),
    linha({ data: '2026-09-18', descricao: 'Mercado Extra', valor: '150' }),
  ]
  const lancadas = csv.map((l) => compra({ data_compra: l.data, descricao: l.descricao, valor_total: Number(l.valor) }))
  it('todas as linhas aparecem como já lançadas', () => {
    expect(tipos(csv, lancadas)).toEqual(['exata', 'exata', 'exata', 'exata'])
    expect(resumirAnalise(analisarLinhas(csv, { compras: lancadas })).pareceJaImportado).toBe(true)
  })
  it('arquivo novo não é tratado como já importado', () => {
    const r = resumirAnalise(analisarLinhas(csv, { compras: [] }))
    expect(r.novas).toBe(4)
    expect(r.pareceJaImportado).toBe(false)
  })
})

describe('cada compra lançada absorve uma linha só', () => {
  it('duas linhas iguais e uma compra: uma já lançada, a outra é nova', () => {
    const ls = [linha(), linha()]
    expect(tipos(ls, [compra()])).toEqual(['exata', null])
  })
  it('duas linhas iguais e duas compras: as duas já lançadas', () => {
    expect(tipos([linha(), linha()], [compra(), compra()])).toEqual(['exata', 'exata'])
  })
})

describe('compra que veio de outro lugar (Telegram, notificação, manual)', () => {
  it('nome e data um pouco diferentes: "parece já lançada", em vez de duplicar', () => {
    const telegram = compra({ origem: 'telegram', descricao: 'ifood', valor_total: 74.9, data_compra: '2026-10-04' })
    const r = analisarLinhas([linha({ descricao: 'IFOOD *IFOOD', valor: '74.90', data: '2026-10-05' })], { compras: [telegram] })
    expect(r[0].correspondencia.tipo).toBe('exata') // mesmo lugar, 1 dia de diferença
    expect(r[0].correspondencia.compra.id).toBe(telegram.id)
  })
  it('data 3 dias depois e nome parcial: parecida', () => {
    const c = compra({ origem: 'android_notification', descricao: 'uber', valor_total: 32.5, data_compra: '2026-10-01' })
    expect(tipos([linha({ descricao: 'UBER *TRIP 9911', valor: '32.50', data: '2026-10-04' })], [c])).toEqual(['parecida'])
  })
  it('valor, cartão ou lugar diferentes não casam', () => {
    const c = compra({ descricao: 'ifood', valor_total: 74.9, data_compra: '2026-10-04' })
    expect(tipos([linha({ descricao: 'IFOOD', valor: '75.90', data: '2026-10-04' })], [c])).toEqual([null])
    expect(tipos([linha({ descricao: 'IFOOD', valor: '74.90', data: '2026-10-04', cartao_id: 'c2' })], [c])).toEqual([null])
    expect(tipos([linha({ descricao: 'DROGASIL', valor: '74.90', data: '2026-10-04' })], [c])).toEqual([null])
  })
  it('data muito diferente (outro mês) não casa', () => {
    const c = compra({ descricao: 'ifood', valor_total: 74.9, data_compra: '2026-09-04' })
    expect(tipos([linha({ descricao: 'IFOOD', valor: '74.90', data: '2026-10-04' })], [c])).toEqual([null])
  })
})

describe('parcelamentos', () => {
  const notebook = compra({ descricao: 'Notebook Dell', parcelas: 3, valor_total: 300, data_compra: '2026-08-01' })
  it('parcela em andamento reconhece o parcelamento mesmo com a data de início estimada', () => {
    expect(tipos([linha({ descricao: 'Notebook Dell', valor: '100', parcela_atual: '2', parcela_total: '3', data: '2026-09-15' })], [notebook])).toEqual(['parcelamento'])
  })
  it('aceita o nome com variação ("DELL*NOTEBOOK" não, mas o mesmo lugar com sufixo sim)', () => {
    expect(tipos([linha({ descricao: 'Notebook Dell 02/03', valor: '100', parcela_atual: '2', parcela_total: '3' })], [notebook])).toEqual(['parcelamento'])
  })
  it('valor da parcela diferente não casa', () => {
    expect(tipos([linha({ descricao: 'Notebook Dell', valor: '120', parcela_atual: '2', parcela_total: '3' })], [notebook])).toEqual([null])
  })
  it('primeira parcela (1/3) casa pelo total', () => {
    const c = compra({ descricao: 'Notebook Dell', parcelas: 3, valor_total: 300, data_compra: '2026-09-15' })
    expect(tipos([linha({ descricao: 'Notebook Dell', valor: '100', parcela_atual: '1', parcela_total: '3', data: '2026-09-15' })], [c])).toEqual(['exata'])
  })
  it('modo "total": a coluna já traz o valor da compra inteira', () => {
    const l = linha({ valor: '300', parcela_atual: '1', parcela_total: '3' })
    expect(valorTotalLinha(l, 'total')).toBe(300)
    expect(valorParcelaLinha(l, 'total')).toBe(100)
    expect(valorTotalLinha(l, 'parcela')).toBe(900)
  })
})

describe('sugestão de categoria', () => {
  const historico = [
    compra({ descricao: 'Uber Trip 4821', categoria: 'Transporte', subcategoria: 'Uber/99/Táxi' }),
    compra({ descricao: 'UBER *TRIP 111', categoria: 'Transporte', subcategoria: 'Uber/99/Táxi' }),
  ]
  it('usa o histórico pelo lugar, mesmo com número ou asterisco diferente', () => {
    expect(sugerirCategoriaLinha('uber trip', { categorias, preparadas: prepararRegras({ compras: historico }) })).toEqual({ categoria: 'Transporte', subcategoria: 'Uber/99/Táxi', fonte: 'historico' })
  })
  it('sem histórico, usa o nome do lugar quando só uma subcategoria combina', () => {
    expect(sugerirCategoriaLinha('mercado extra', { categorias })).toEqual({ categoria: 'Alimentação', subcategoria: 'Mercado', fonte: 'nome' })
  })
  it('sem pista nenhuma, não chuta', () => {
    expect(sugerirCategoriaLinha('xyz loja', { categorias })).toBeNull()
  })
})

describe('o que falta em cada linha', () => {
  const ok = linha({ categoria: 'Saúde', subcategoria: 'Farmácia', pessoa: 'Gi' })
  it('linha completa não tem problema', () => expect(problemasDaLinha(ok, categorias, '2026-09', { normalizarData })).toEqual([]))
  it('lista cada pendência em português', () => {
    const p = problemasDaLinha({ ...ok, categoria: '', cartao_id: '', pessoa: '' }, categorias, '2026-09', { normalizarData })
    expect(p).toEqual(['falta a categoria', 'falta a pessoa', 'falta o cartão'])
  })
  it('parcela em andamento exige o mês da fatura', () => {
    expect(problemasDaLinha({ ...ok, parcela_atual: '2', parcela_total: '3' }, categorias, '', { normalizarData })).toEqual(['falta o mês da fatura'])
  })
})

describe('cartão pelo nome', () => {
  it('nome exato, parcial e ambíguo', () => {
    expect(resolverCartaoPorNome('nubank', cartoes).id).toBe('c1')
    expect(resolverCartaoPorNome('Nubank Roxinho', cartoes).id).toBe('c1')
    expect(resolverCartaoPorNome('Banco Inter Black', cartoes).id).toBe('c2')
    expect(resolverCartaoPorNome('Itaú', cartoes)).toBeNull()
    expect(resolverCartaoPorNome('', cartoes)).toBeNull()
    expect(resolverCartaoPorNome('nu', [{ id: 'a', nome: 'Nubank' }, { id: 'b', nome: 'Nubank Gi' }])).toBeNull()
  })
})

describe('nome amigável (Identificação)', () => {
  it('marca conhecida', () => {
    expect(sugerirNomeLinha('IFOOD *IFOOD')).toEqual({ nome: 'iFood', fonte: 'marca' })
    expect(sugerirNomeLinha('UBER *TRIP 9911')).toEqual({ nome: 'Uber', fonte: 'marca' })
    expect(sugerirNomeLinha('MERCADOLIVRE*3PRODUTOS')?.nome).toBe('Mercado Livre')
  })
  it('reaproveita o nome que a pessoa já deu', () => {
    const c = [compra({ descricao: 'PAG*PADARIA SAO JOSE', identificacao: 'Padaria da esquina' })]
    expect(sugerirNomeLinha('PAG*PADARIA SAO JOSE', { compras: c })).toEqual({ nome: 'Padaria da esquina', fonte: 'historico' })
  })
  it('nome cadastrado em estabelecimento_aliases', () => {
    const aliases = [{ alias: 'drogasil sp', chave: 'drogasil', nome_exibicao: 'Drogasil (SP)' }]
    expect(sugerirNomeLinha('DROGASIL SP', { aliases })?.nome).toBe('Drogasil (SP)')
  })
  it('texto em maiúsculas com várias palavras vira capitalizado; texto já bom não é mexido', () => {
    expect(sugerirNomeLinha('PADARIA SAO JOSE')).toEqual({ nome: 'Padaria Sao Jose', fonte: 'formato' })
    expect(sugerirNomeLinha('PADARIA SÃO JOSÉ')).toEqual({ nome: 'Padaria São José', fonte: 'formato' })
    expect(sugerirNomeLinha('PAG*PADARIA SÃO JOSÉ')?.nome).toBe('Padaria São José')
    expect(sugerirNomeLinha('Farmacia Local')).toBeNull()
    expect(sugerirNomeLinha('PADARIAJOSE')).toBeNull()
  })
})
