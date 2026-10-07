import { describe, it, expect } from 'vitest'
import { analisarLinhas, conferirFatura, prepararRegras, sugerirCategoriaLinha, problemasDaLinha, resumirAnalise, resolverCartaoPorNome, valorTotalLinha, valorParcelaLinha, sugerirNomeLinha, linhaConciliada } from '../importacao'
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
  it('valor diferente vira "valor diferente do lançado"; cartão ou lugar diferentes não casam', () => {
    const c = compra({ descricao: 'ifood', valor_total: 74.9, data_compra: '2026-10-04' })
    expect(tipos([linha({ descricao: 'IFOOD', valor: '75.90', data: '2026-10-04' })], [c])).toEqual(['valor_diferente'])
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
  it('valor da parcela diferente: é o mesmo parcelamento com valor diferente', () => {
    expect(tipos([linha({ descricao: 'Notebook Dell', valor: '120', parcela_atual: '2', parcela_total: '3' })], [notebook])).toEqual(['valor_diferente'])
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

describe('compra dividida em categorias', () => {
  it('a linha da fatura com a cobrança inteira casa com as partes somadas', () => {
    const partes = [
      compra({ grupo_id: 'g', descricao: 'MERCADO LIVRE', valor_total: 100, data_compra: '2026-10-05', categoria: 'Alimentação' }),
      compra({ grupo_id: 'g', descricao: 'MERCADO LIVRE', valor_total: 200, data_compra: '2026-10-05', categoria: 'Saúde' }),
    ]
    expect(tipos([linha({ descricao: 'MERCADO LIVRE', valor: '300', data: '2026-10-05' })], partes)).toEqual(['exata'])
    // nome da fatura com as palavras coladas e sufixo: reconhece, mas só como "parece já lançada"
    expect(tipos([linha({ descricao: 'MERCADOLIVRE*3PRODUTOS', valor: '300', data: '2026-10-05' })], partes)).toEqual(['parecida'])
  })
})


describe('conferência da fatura: o que falta lançar', () => {
  const nu = [{ id: 'c1', nome: 'Nubank', fechamento: 31 }]
  const mes = '2026-09'
  const lancada = (o) => compra({ cartao_id: 'c1', data_compra: '2026-09-10', origem: 'csv', ...o })
  const conferir = (ls, compras, extra = {}) => {
    const linhas = ls.map((l, i) => ({ _id: i, ...l }))
    const achados = analisarLinhas(linhas, { compras })
    return conferirFatura({ linhas: linhas.map((l, i) => ({ ...l, correspondencia: achados[i].correspondencia })), compras, cartoes: nu, cartaoId: 'c1', mes, ...extra })
  }

  it('tudo lançado: bate', () => {
    const r = conferir([linha({ descricao: 'Mercado Extra', valor: '150', data: '2026-09-18' })], [lancada({ descricao: 'Mercado Extra', valor_total: 150, data_compra: '2026-09-18' })])
    expect(r.bate).toBe(true)
    expect(r.totalCsv).toBe(150)
    expect(r.totalFinapp).toBe(150)
  })
  it('já lançada, mas em outra fatura: não diz "tudo lançado" e aponta o mês da compra', () => {
    const fech1 = [{ id: 'c1', nome: 'Nubank', fechamento: 1 }]
    // 01/09 com fechamento dia 1 cai na fatura de setembro; o CSV de outubro traz a linha
    const shell = lancada({ descricao: 'Ec *Shellbox', valor_total: 136.3, data_compra: '2026-09-01' })
    const r = conferir([linha({ descricao: 'Ec *Shellbox', valor: '136.30', data: '2026-09-01' })], [shell], { cartoes: fech1, mes: '2026-10' })
    expect(r.bate).toBe(false)
    expect(r.faltaLancar).toEqual([])
    expect(r.foraDoMes).toHaveLength(1)
    expect(r.foraDoMes[0]).toMatchObject({ valor: 136.3, mesDaCompra: '2026-09', outroCartao: false })
    expect(r.totais.fora).toBe(136.3)
  })
  it('falta lançar: linha do CSV sem compra', () => {
    const r = conferir([linha({ descricao: 'Drogasil', valor: '80.34', data: '2026-09-01' }), linha({ descricao: 'Mercado Extra', valor: '150', data: '2026-09-18' })], [lancada({ descricao: 'Mercado Extra', valor_total: 150, data_compra: '2026-09-18' })])
    expect(r.faltaLancar.map((f) => [f.linha.descricao, f.valor])).toEqual([['Drogasil', 80.34]])
    expect(r.totais.falta).toBe(80.34)
    expect(r.bate).toBe(false)
  })
  it('sobrando no Finapp: lançado e fora do CSV', () => {
    const r = conferir([linha({ descricao: 'Mercado Extra', valor: '150', data: '2026-09-18' })], [lancada({ descricao: 'Mercado Extra', valor_total: 150, data_compra: '2026-09-18' }), lancada({ descricao: 'Compra a mais', valor_total: 45, data_compra: '2026-09-20' })])
    expect(r.sobrandoNoFinapp.map((s) => [s.compra.descricao, s.valor])).toEqual([['Compra a mais', 45]])
    expect(r.totais.sobra).toBe(45)
  })
  it('mesma compra com valor diferente é um par, não "falta" e "sobra" separados', () => {
    const r = conferir([linha({ descricao: 'Petz Jundiai', valor: '250.40', data: '2026-09-26' })], [lancada({ descricao: 'Petz Jundiai', valor_total: 230, data_compra: '2026-09-26' })])
    expect(r.faltaLancar).toEqual([])
    expect(r.sobrandoNoFinapp).toEqual([])
    expect(r.valorDiferente).toHaveLength(1)
    expect(r.valorDiferente[0]).toMatchObject({ csv: 250.4, app: 230, diferenca: 20.4 })
    expect(r.totais.valores).toBe(20.4)
  })
  it('parcela em andamento casada pelo parcelamento não aparece como sobra nem falta', () => {
    const notebook = lancada({ descricao: 'Notebook Dell', parcelas: 3, valor_total: 300, data_compra: '2026-08-01' })
    const r = conferir([linha({ descricao: 'Notebook Dell', valor: '100', parcela_atual: '2', parcela_total: '3', data: '2026-09-15' })], [notebook])
    expect(r.bate).toBe(true)
    expect(r.totalFinapp).toBe(100)
  })
  it('linha do CSV que já é conta fixa no cartão não falta; fixo fora do CSV sobra', () => {
    const fixos = [{ id: 'nf', nome: 'Netflix', valor: 55, ativo: true, cartao_id: 'c1', mes_inicio: '2026-01' }, { id: 'sp', nome: 'Spotify', valor: 22, ativo: true, cartao_id: 'c1', mes_inicio: '2026-01' }]
    const r = conferir([linha({ descricao: 'NETFLIX.COM', valor: '55', data: '2026-09-05' })], [], { fixos })
    expect(r.contaFixa.map((c) => c.fixo.nome)).toEqual(['Netflix'])
    expect(r.faltaLancar).toEqual([])
    expect(r.sobrandoNoFinapp.map((s) => s.fixo?.nome)).toEqual(['Spotify'])
  })
  it('a conta fecha: CSV − Finapp = falta + valores diferentes − sobra', () => {
    const compras = [lancada({ descricao: 'Petz Jundiai', valor_total: 230, data_compra: '2026-09-26' }), lancada({ descricao: 'Compra a mais', valor_total: 45, data_compra: '2026-09-20' }), lancada({ descricao: 'Mercado Extra', valor_total: 150, data_compra: '2026-09-18' })]
    const r = conferir([linha({ descricao: 'Petz Jundiai', valor: '250.40', data: '2026-09-26' }), linha({ descricao: 'Mercado Extra', valor: '150', data: '2026-09-18' }), linha({ descricao: 'Drogasil', valor: '80.34', data: '2026-09-01' })], compras)
    const esperado = Math.round((r.totais.falta + r.totais.valores - r.totais.sobra) * 100) / 100
    expect(Math.round((r.totalCsv - r.totalFinapp) * 100) / 100).toBe(esperado)
  })
})

describe('mesma compra com valor diferente (2ª passada)', () => {
  const c1 = (o) => compra({ cartao_id: 'c1', data_compra: '2026-09-10', origem: 'csv', ...o })
  it('é reconhecida como já lançada (desmarcada), não como nova', () => {
    const r = analisarLinhas([linha({ descricao: 'Brs*Sheincom', valor: '14.42', data: '2026-09-10' })], { compras: [c1({ descricao: 'Brs*Sheincom', valor_total: 12 })] })
    expect(r[0].correspondencia.tipo).toBe('valor_diferente')
  })
  it('uma linha de valor igual tem prioridade: a nova não "rouba" a compra da outra', () => {
    // app só tem o iFood de 32; CSV tem 74,90 (novo) e 32 (já lançado)
    const c = c1({ descricao: 'ifood', valor_total: 32, data_compra: '2026-09-10' })
    const r = analisarLinhas([linha({ descricao: 'IFOOD *IFOOD', valor: '74.90', data: '2026-09-10' }), linha({ descricao: 'IFOOD *IFOOD', valor: '32', data: '2026-09-10' })], { compras: [c] })
    expect(r.map((x) => x.correspondencia?.tipo || null)).toEqual([null, 'exata'])
  })
  it('lugar parecido mas datas longe (outro dia) não pareia', () => {
    const r = analisarLinhas([linha({ descricao: 'Petz', valor: '90', data: '2026-09-20' })], { compras: [c1({ descricao: 'Petz', valor_total: 50, data_compra: '2026-09-02' })] })
    expect(r[0].correspondencia).toBeNull()
  })
  it('parcelamento com valor da parcela diferente (juros/IOF) é "valor diferente"', () => {
    const notebook = c1({ descricao: 'Notebook Dell', parcelas: 3, valor_total: 300, data_compra: '2026-08-01' })
    const r = analisarLinhas([linha({ descricao: 'Notebook Dell', valor: '110', parcela_atual: '2', parcela_total: '3', data: '2026-09-15' })], { compras: [notebook] })
    expect(r[0].correspondencia.tipo).toBe('valor_diferente')
  })
  it('cartão diferente não pareia', () => {
    const r = analisarLinhas([linha({ descricao: 'Petz', valor: '90', data: '2026-09-02', cartao_id: 'c2' })], { compras: [c1({ descricao: 'Petz', valor_total: 50, data_compra: '2026-09-02' })] })
    expect(r[0].correspondencia).toBeNull()
  })
})


describe('linhaConciliada', () => {
  it('só conta como conciliada o que já existe em Compras', () => {
    expect(linhaConciliada({ correspondencia: { tipo: 'exata' } })).toBe(true)
    expect(linhaConciliada({ correspondencia: { tipo: 'parcelamento' } })).toBe(true)
    expect(linhaConciliada({ correspondencia: { tipo: 'valor_diferente' } })).toBe(false)
    expect(linhaConciliada({ correspondencia: null })).toBe(false)
    expect(linhaConciliada({})).toBe(false)
  })
})
