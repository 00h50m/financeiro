import { describe, it, expect } from 'vitest'
import { analisarLinhas, valorTotalLinha } from '../importacao'
import { analisarFatura, decisaoPatch } from '../conciliacaoFatura'
import { montarPlano, previaParcelamento, ehCompraDividida } from '../planoImportacao'

const categorias = [{ nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }]
const cartoes = [{ id: 'c1', nome: 'Nubank' }]
const MES = '2026-09'
let seq = 0, idl = 0
const compra = (o) => ({ id: 'k' + ++seq, data_compra: '2026-09-12', descricao: 'Mercado Extra', cartao_id: 'c1', valor_total: 100, parcelas: 1, origem: 'manual', ...o })
const linha = (o) => ({ _id: ++idl, data: '2026-09-12', descricao: 'Mercado Extra', descricaoOriginal: 'MERCADO EXTRA', valor: 100, cartao_id: 'c1', parcela_atual: '', parcela_total: '', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', identificacao: '', incluir: true, ...o })
function preparar(ls, compras) {
  const dec = ls.map((_, i) => i).filter((i) => ls[i].decisao !== 'outra')
  const parc = analisarLinhas(dec.map((i) => ls[i]), { compras, cartoes, mesFatura: MES })
  const ach = ls.map(() => ({ correspondencia: null })); dec.forEach((i, j) => { ach[i] = parc[j] })
  return ls.map((l, i) => { const t = ach[i].correspondencia?.tipo; return { ...l, correspondencia: ach[i].correspondencia, incluir: l.incluirManual ? l.incluir : l.decisao === 'outra' || !['exata', 'parecida', 'valor_diferente', 'parcelamento'].includes(t) } })
}
const plano = (ls, compras, extra = {}) => {
  const linhas = preparar(ls, compras)
  const analise = analisarFatura({ linhas, compras, cartoes, cartaoId: 'c1', mes: MES, categorias, totalBanco: extra.totalBanco ?? null })
  return montarPlano({ analise, mesFatura: MES, cartoes, faturaMesOk: true, modoValor: 'parcela', cartaoId: 'c1', arquivo: { nome: 'f.pdf', origem: 'pdf' }, linhasDoArquivo: linhas })
}

describe('plano da importação', () => {
  it('novas selecionadas viram compras; o que está em aberto não é gravado e fica nas decisões', () => {
    const lancadas = [compra({ descricao: 'Mercado Extra Ltda', data_compra: '2026-09-14', valor_total: 100 })]
    const { dados, previa } = plano([linha({ descricao: 'Padaria', valor: 18, data: '2026-09-13' }), linha({ descricao: 'Mercado Extra', valor: 100 }), linha({ descricao: 'Sem cat', valor: 5, categoria: '', subcategoria: '' })], lancadas, { totalBanco: 123 })
    expect(dados.compras.map((c) => c.descricao)).toEqual(['Padaria'])
    expect(dados.atualizar).toEqual([])
    expect(dados.mover).toEqual([])
    expect(dados.status_conciliacao).toBe('parcial')
    expect(dados.total_banco).toBe(123)
    expect(dados.origem_leitura).toBe('pdf')
    expect(dados.decisoes.pendencias.map((p) => p.motivos[0]).sort()).toEqual(['correspondencia_provavel', 'dados_incompletos'])
    expect(previa.gravar.criar).toMatchObject({ qtd: 1, valor: 18 })
    expect(previa.emAberto).toMatchObject({ revisao: 2, divergenciasApp: 0 }) // a compra provável já está pareada com a linha em revisão
    expect(previa.temAlgoParaGravar).toBe(true)
  })
  it('atualizar valor: guarda o valor anterior (controle de concorrência) e o novo; compra dividida não entra', () => {
    const c = compra({ valor_total: 100 })
    const { dados, previa } = plano([{ ...linha({ valor: 103 }), ...decisaoPatch('atualizar') }], [c])
    expect(dados.atualizar).toEqual([{ compra_id: c.id, valor_anterior: 100, valor_total: 103 }])
    expect(dados.compras).toEqual([])
    expect(previa.gravar.atualizar[0]).toMatchObject({ descricao: 'Mercado Extra', valor_anterior: 100, valor_total: 103 })
    const dividida = compra({ valor_total: 100, grupo_id: 'g1' })
    expect(ehCompraDividida(dividida)).toBe(true)
    const p2 = plano([{ ...linha({ valor: 103 }), ...decisaoPatch('atualizar') }], [dividida])
    expect(p2.dados.atualizar).toEqual([])
    expect(p2.previa.atualizacoesBloqueadas).toHaveLength(1)
  })
  it('mover compra para esta fatura', () => {
    const c = compra({ fatura_mes: '2026-10' })
    const { dados, previa } = plano([{ ...linha(), ...decisaoPatch('mover') }], [c])
    expect(dados.mover).toEqual([{ compra_id: c.id, fatura_mes_anterior: '2026-10', fatura_mes: MES }])
    expect(previa.gravar.mover[0].valor).toBe(100)
  })
  it('só pendências (nada a gravar): a prévia avisa', () => {
    const lancadas = [compra({ descricao: 'Mercado Extra Ltda', data_compra: '2026-09-14' })]
    const { previa, dados } = plano([linha()], lancadas)
    expect(previa.temAlgoParaGravar).toBe(false)
    expect(dados.compras).toEqual([])
  })
  it('mesma compra confirmada entra em "vinculadas" sem gravar nada', () => {
    const lancadas = [compra({ descricao: 'Mercado Extra Ltda', data_compra: '2026-09-14' })]
    const { previa, dados } = plano([{ ...linha(), ...decisaoPatch('mesma') }, linha({ descricao: 'Padaria', valor: 18 })], lancadas)
    expect(previa.gravar.vinculadas).toBe(1)
    expect(dados.decisoes.vinculadas[0]).toMatchObject({ decisao: 'mesma' })
    expect(dados.compras).toHaveLength(1)
  })
  it('parcela intermediária confirmada: prévia diz o que será criado e que a data é estimada', () => {
    const l = { ...linha({ descricao: 'Geladeira', valor: 250, parcela_atual: '3', parcela_total: '10' }), parcelamentoConfirmado: true }
    const { dados, previa } = plano([l], [])
    expect(dados.compras[0]).toMatchObject({ data_compra: '2026-07-01', valor_total: 2500, parcelas: 10 })
    expect(previa.gravar.parcelamentos[0]).toMatchObject({ parcelaAtual: 3, total: 10, valorParcela: 250, valorTotal: 2500, primeiraParcela: '2026-07', ultimaParcela: '2027-04', anteriores: 2, restantes: 8, dataEstimada: true })
    expect(previaParcelamento(l, MES, 'total').valorParcela).toBe(25)
  })
  it('sem confirmação, a parcela intermediária não vai para o banco', () => {
    const { dados, previa } = plano([linha({ descricao: 'Geladeira', valor: 250, parcela_atual: '3', parcela_total: '10' })], [])
    expect(dados.compras).toEqual([])
    expect(previa.emAberto.revisao).toBe(1)
  })
})

import { cronogramaParcelamento, parcelasAvulsasParecidas, compraDoParcelamento, opcaoDaLinha } from '../parcelamentoImportacao'
import { montarCompras } from '../importacaoLote'
import { classificarLinha } from '../conciliacaoFatura'

describe('parcelamentos na importação (C4)', () => {
  const l = (o = {}) => linha({ descricao: 'Geladeira', valor: 250, parcela_atual: '3', parcela_total: '10', ...o })
  it('cronograma do parcelamento completo: anteriores, esta fatura e futuras, com a parcela k exatamente neste mês', () => {
    const c = cronogramaParcelamento(l(), { mesFatura: MES, modoValor: 'parcela', cartoes })
    expect(c.parcelas).toHaveLength(10)
    expect(c.parcelas.map((p) => p.situacao).filter((s) => s === 'passada')).toHaveLength(2)
    expect(c.parcelas.find((p) => p.situacao === 'esta')).toMatchObject({ mes: MES, num: 3, valor: 250 })
    expect(c).toMatchObject({ bate: true, anteriores: 2, futuras: 7, totalAjustado: 2500 })
    expect(c.parcelas[0].mes).toBe('2026-07')
    expect(c.parcelas[9].mes).toBe('2027-04')
  })
  it('o dia de fechamento do cartão não desloca as parcelas (a 1ª é ancorada por fatura_mes)', () => {
    const c = cronogramaParcelamento(l(), { mesFatura: MES, modoValor: 'parcela', cartoes: [{ id: 'c1', nome: 'Nubank', fechamento: 1 }] })
    expect(c.bate).toBe(true)
    expect(compraDoParcelamento(l(), { mesFatura: MES, modoValor: 'parcela' })).toMatchObject({ fatura_mes: '2026-07', data_compra: '2026-07-01', valor_total: 2500, parcelas: 10 })
  })
  it('arredondamento: no modo "total" as parcelas somam o total exato (a última fecha a conta)', () => {
    const c = cronogramaParcelamento(l({ valor: 100, parcela_atual: '1', parcela_total: '3' }), { mesFatura: MES, modoValor: 'total', cartoes })
    expect(c.parcelas.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34])
    expect(c.parcelas.reduce((t, p) => t + p.valor, 0)).toBeCloseTo(100, 2)
    expect(c.bate).toBe(true)
  })
  it('meses passados fechados são apontados', () => {
    const c = cronogramaParcelamento(l(), { mesFatura: MES, modoValor: 'parcela', cartoes, fechamentos: [{ mes: '2026-07', status: 'fechado' }, { mes: '2026-08', status: 'aberto' }] })
    expect(c.fechados).toEqual(['2026-07'])
    const { previa } = plano([{ ...l(), parcelamentoOpcao: 'completo' }], [])
    expect(previa.gravar.parcelamentos[0].alteraMesesPassados).toBe(true)
  })
  it('parcela fora do possível (k > n): não bate', () => {
    expect(cronogramaParcelamento(l({ parcela_atual: '12', parcela_total: '10' }), { mesFatura: MES, modoValor: 'parcela', cartoes }).bate).toBe(false)
  })
  it('evidência: lançamentos parecidos de meses anteriores podem ser as parcelas já lançadas à parte', () => {
    const lancadas = [compra({ descricao: 'GELADEIRA BRASTEMP', data_compra: '2026-07-16', valor_total: 250 }), compra({ descricao: 'Geladeira Brastemp', data_compra: '2026-08-16', valor_total: 250 }), compra({ descricao: 'Mercado', data_compra: '2026-08-16', valor_total: 250 }), compra({ descricao: 'Geladeira', data_compra: '2026-08-16', valor_total: 999 })]
    const ev = parcelasAvulsasParecidas(l(), { compras: lancadas, cartaoId: 'c1', mesFatura: MES, modoValor: 'parcela' })
    expect(ev.map((e) => e.data)).toEqual(['2026-07-16', '2026-08-16'])
  })
  it('classificação: sem escolha fica em revisão; completo e só esta viram nova; compatível com o "confirmado" antigo', () => {
    const base = { categorias, mesFatura: MES, parcelamentoOk: () => true }
    expect(classificarLinha(l(), base).grupo).toBe('revisao')
    expect(classificarLinha({ ...l(), parcelamentoOpcao: 'completo' }, base)).toMatchObject({ grupo: 'nova', selecionada: true })
    expect(classificarLinha({ ...l(), parcelamentoOpcao: 'so_esta' }, base)).toMatchObject({ grupo: 'nova', selecionada: true })
    expect(classificarLinha({ ...l(), parcelamentoConfirmado: true }, base).grupo).toBe('nova')
    expect(opcaoDaLinha({ parcelamentoConfirmado: true })).toBe('completo')
    // calendário não bate: o completo volta para revisão; "só esta" não depende dele
    expect(classificarLinha({ ...l(), parcelamentoOpcao: 'completo' }, { ...base, parcelamentoOk: () => false })).toMatchObject({ grupo: 'revisao', motivos: ['parcelamento_inconsistente'] })
    expect(classificarLinha({ ...l(), parcelamentoOpcao: 'so_esta' }, { ...base, parcelamentoOk: () => false }).grupo).toBe('nova')
  })
  it('só esta parcela: UMA compra à vista com o valor da parcela, na fatura em tela, sem mexer no passado', () => {
    const [c] = montarCompras([{ ...l(), parcelamentoOpcao: 'so_esta' }], { mesFatura: MES, cartoes, faturaMesOk: true, valorTotalLinha, modoValor: 'parcela' })
    expect(c).toMatchObject({ parcelas: 1, valor_total: 250, data_compra: '2026-09-12', fatura_mes: MES })
    expect(c.obs).toContain('Parcela 3/10: registrada só esta parcela')
    const [t] = montarCompras([{ ...l({ valor: 2500 }), parcelamentoOpcao: 'so_esta' }], { mesFatura: MES, cartoes, faturaMesOk: true, valorTotalLinha, modoValor: 'total' })
    expect(t.valor_total).toBe(250) // no modo "total" a coluna traz a compra inteira: a parcela é o total ÷ n
  })
  it('parcelamento completo: ancorado por fatura_mes (1ª parcela), com data estimada e nota', () => {
    const [c] = montarCompras([{ ...l(), parcelamentoOpcao: 'completo' }], { mesFatura: MES, cartoes, faturaMesOk: true, valorTotalLinha, modoValor: 'parcela' })
    expect(c).toMatchObject({ parcelas: 10, valor_total: 2500, data_compra: '2026-07-01', fatura_mes: '2026-07' })
    expect(c.obs).toContain('início estimado')
  })
  it('prévia: só esta parcela não altera meses passados', () => {
    const { previa, dados } = plano([{ ...l(), parcelamentoOpcao: 'so_esta' }], [])
    expect(previa.gravar.parcelamentos[0]).toMatchObject({ opcao: 'so_esta', alteraMesesPassados: false, dataEstimada: false, mesesFechados: [] })
    expect(dados.compras[0].parcelas).toBe(1)
  })
})
