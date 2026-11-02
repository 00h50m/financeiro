import { describe, it, expect, vi } from 'vitest'
import { chaveDoArquivo, novoIdImportacao, montarCompras, linhasLidas, aplicarImportacao, textoResultado } from '../importacaoLote'
import { valorTotalLinha } from '../importacao'

const linha = (o = {}) => ({ _id: 1, data: '2026-10-03', descricao: 'MERCADO X', descricaoOriginal: 'MERCADO X 03/10', valor: 100.5, parcela_atual: '', parcela_total: '', cartao_id: 'cn', cartaoNome: 'Nubank', identificacao: '', observacao: '', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', ...o })
const cartoes = [{ id: 'cn', nome: 'Nubank', titular: 'Giovanna', fechamento: 5, vencimento: 12 }]

describe('chave do arquivo (proteção contra importar o mesmo arquivo)', () => {
  it('64 caracteres, igual em qualquer ordem das linhas, e muda se algo muda', async () => {
    const a = linha(), b = linha({ data: '2026-10-04', descricao: 'UBER', valor: 20 })
    const k1 = await chaveDoArquivo({ cartaoId: 'cn', mes: '2026-10', linhas: [a, b] })
    expect(k1).toMatch(/^[0-9a-f]{64}$/)
    expect(await chaveDoArquivo({ cartaoId: 'cn', mes: '2026-10', linhas: [b, a] })).toBe(k1)
    expect(await chaveDoArquivo({ cartaoId: 'cn', mes: '2026-10', linhas: [a, { ...b, valor: 20.01 }] })).not.toBe(k1)
    expect(await chaveDoArquivo({ cartaoId: 'cn', mes: '2026-11', linhas: [a, b] })).not.toBe(k1)
    expect(await chaveDoArquivo({ cartaoId: 'outro', mes: '2026-10', linhas: [a, b] })).not.toBe(k1)
  })
  it('descrição com caixa/acento diferente não muda a chave; id do lote é único', async () => {
    const k1 = await chaveDoArquivo({ cartaoId: 'cn', mes: '2026-10', linhas: [linha({ descricao: 'Padaria São João' })] })
    expect(await chaveDoArquivo({ cartaoId: 'cn', mes: '2026-10', linhas: [linha({ descricao: 'PADARIA SAO JOAO' })] })).toBe(k1)
    expect(novoIdImportacao()).not.toBe(novoIdImportacao())
    expect(novoIdImportacao()).toMatch(/^[0-9a-f-]{36}$/)
  })
})

describe('montar as compras do lote', () => {
  const base = { mesFatura: '2026-10', cartoes, faturaMesOk: true, valorTotalLinha, modoValor: 'parcela' }
  it('compra à vista: campos da compra, sem origem (o banco define pela leitura) e sem fatura_mes quando bate', () => {
    const [c] = montarCompras([linha()], base)
    expect(c).toMatchObject({ data_compra: '2026-10-03', descricao: 'MERCADO X', descricao_original: 'MERCADO X 03/10', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: 'cn', valor_total: 100.5, parcelas: 1 })
    expect(c).not.toHaveProperty('origem')
    expect(c).not.toHaveProperty('fatura_mes')
  })
  it('compra depois do fechamento ganha fatura_mes da fatura em tela; identificação e observação entram', () => {
    const [c] = montarCompras([linha({ data: '2026-10-20', identificacao: ' Mercado do mês ', observacao: 'x' })], base)
    expect(c.fatura_mes).toBe('2026-10')
    expect(c.identificacao).toBe('Mercado do mês')
    expect(c.obs).toBe('x')
  })
  it('parcela em andamento (3/10): começa 2 meses antes, valor total = parcela × 10, com nota', () => {
    const [c] = montarCompras([linha({ parcela_atual: '3', parcela_total: '10', valor: 50 })], base)
    expect(c).toMatchObject({ data_compra: '2026-08-01', valor_total: 500, parcelas: 10 })
    expect(c.obs).toContain('Parcela 3/10')
  })
  it('linhas lidas guardam só o que veio do arquivo', () => {
    expect(linhasLidas([linha()])).toEqual([{ data: '2026-10-03', descricao: 'MERCADO X 03/10', valor: 100.5, parcela_atual: '', parcela_total: '', cartao: 'Nubank', observacao: '' }])
  })
})

describe('gravação no banco', () => {
  const dados = { origem_leitura: 'pdf', compras: [{ descricao: 'X', valor_total: 10 }, { descricao: 'Y', valor_total: 20 }] }
  const fake = (rpc, insert = async () => ({ error: null })) => { const chamadas = { rpc: [], insert: [] }; return { chamadas, sb: { rpc: async (n, a) => { chamadas.rpc.push([n, a]); return rpc() }, from: () => ({ insert: async (rows) => { chamadas.insert.push(rows); return insert(rows) } }) } } }
  it('usa a função do banco, com o id do lote, e devolve o resultado', async () => {
    const { sb, chamadas } = fake(async () => ({ data: { status_importacao: 'concluida', status_conciliacao: 'pendente', criadas: 2 }, error: null }))
    const r = await aplicarImportacao(sb, { importacaoId: 'id-1', dados, usuario: 'gi@x' })
    expect(r.criadas).toBe(2)
    expect(chamadas.rpc[0]).toEqual(['aplicar_importacao', { p_importacao: 'id-1', p_dados: dados, p_usuario: 'gi@x' }])
    expect(chamadas.insert).toHaveLength(0)
  })
  it('erro de validação do banco sobe (nada de gravar por fora)', async () => {
    const { sb, chamadas } = fake(async () => ({ data: null, error: { code: 'P0001', message: 'Lançamento 2: valor inválido.' } }))
    await expect(aplicarImportacao(sb, { importacaoId: 'id-1', dados })).rejects.toMatchObject({ message: 'Lançamento 2: valor inválido.' })
    expect(chamadas.insert).toHaveLength(0)
  })
  it('banco sem a atualização 37: grava como antes e avisa que não há proteção', async () => {
    const { sb, chamadas } = fake(async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.aplicar_importacao in the schema cache' } }))
    const r = await aplicarImportacao(sb, { importacaoId: 'id-1', dados })
    expect(r).toMatchObject({ criadas: 2, semProtecao: true, status_conciliacao: 'pendente' })
    expect(chamadas.insert[0].map((c) => c.origem)).toEqual(['pdf', 'pdf'])
  })
  it('falha na gravação antiga também sobe', async () => {
    const { sb } = fake(async () => ({ data: null, error: { code: '42883', message: 'function aplicar_importacao does not exist' } }), async () => ({ error: { message: 'boom' } }))
    await expect(aplicarImportacao(sb, { importacaoId: 'id-1', dados })).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('texto do resultado: importação e conciliação são coisas diferentes', () => {
  it('concluída com conciliação pendente nunca diz "conciliada"', () => {
    const t = textoResultado({ criadas: 13, status_conciliacao: 'pendente' })
    expect(t.titulo).toBe('Importação concluída: 13 lançamentos gravados.')
    expect(t.detalhe).toContain('conciliação com a fatura ainda está pendente')
    expect(t.detalhe).not.toContain('Fatura conciliada')
    expect(textoResultado({ criadas: 2, atualizadas: 1, movidas: 2, status_conciliacao: 'parcial' }).titulo).toBe('Importação concluída: 2 lançamentos gravados, 1 valor atualizado, 2 compras movidas de fatura.')
    expect(textoResultado({ criadas: 2, status_conciliacao: 'parcial' }).detalhe).toContain('Conciliação parcial')
    expect(textoResultado({ criadas: 2, status_conciliacao: 'conciliada' }).detalhe).toContain('Fatura conciliada')
    expect(textoResultado({ criadas: 1, status_conciliacao: 'pendente' }).titulo).toContain('1 lançamento gravado.')
  })
  it('repetida: avisa e diz que nada foi gravado; sem proteção: pede o SQL', () => {
    const t = textoResultado({ repetida: true, concluida_em: '2026-11-02T18:00:00Z', criadas: 13 })
    expect(t.tipo).toBe('aviso')
    expect(t.titulo).toContain('já foi importada em 02/11/2026')
    expect(t.detalhe).toContain('Nada foi gravado de novo')
    expect(textoResultado({ criadas: 2, status_conciliacao: 'pendente', semProtecao: true }).aviso).toContain('inbox/37_importacao_nucleo.sql')
  })
})

describe('conciliação posterior', () => {
  const lote = { linhas: [{ data: '2026-10-03', descricao: 'MERCADO', valor: 50, parcela_atual: null, parcela_total: null, cartao: 'Nubank', observacao: null }, { data: '2026-10-05', descricao: 'TV 2/10', valor: 100, parcela_atual: 2, parcela_total: 10 }] }
  it('reconstrói registros no formato do CSV a partir das linhas do lote', async () => {
    const { registrosDoLote } = await import('../importacaoLote')
    const r = registrosDoLote(lote)
    expect(r).toHaveLength(2)
    expect(r[0]).toMatchObject({ data: '2026-10-03', descricao: 'MERCADO', valor: 50, cartao: 'Nubank', parcela_atual: '' })
    expect(r[1]).toMatchObject({ parcela_atual: 2, parcela_total: 10 })
    expect(registrosDoLote({})).toEqual([])
  })
  it('aplicarConciliacao chama a função com a rodada e explica quando o SQL 39 falta', async () => {
    const { aplicarConciliacao } = await import('../importacaoLote')
    const rpc = vi.fn().mockResolvedValue({ data: { criadas: 1 }, error: null })
    expect(await aplicarConciliacao({ rpc }, { importacaoId: 'a', operacaoId: 'b', dados: { x: 1 }, usuario: 'u' })).toEqual({ criadas: 1 })
    expect(rpc).toHaveBeenCalledWith('aplicar_conciliacao', { p_importacao: 'a', p_operacao: 'b', p_dados: { x: 1 }, p_usuario: 'u' })
    const falta = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }) }
    await expect(aplicarConciliacao(falta, { importacaoId: 'a', operacaoId: 'b', dados: {} })).rejects.toThrow(/39_importacao_conciliacao/)
    const outro = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Importação não encontrada.' } }) }
    await expect(aplicarConciliacao(outro, { importacaoId: 'a', operacaoId: 'b', dados: {} })).rejects.toMatchObject({ message: 'Importação não encontrada.' })
  })
  it('texto do resultado diferencia conferência de importação e rodada repetida', async () => {
    const { textoResultado } = await import('../importacaoLote')
    expect(textoResultado({ criadas: 0, atualizadas: 1, movidas: 0, status_conciliacao: 'conciliada', operacao: 'x' }).titulo).toMatch(/^Conferência aplicada/)
    expect(textoResultado({ criadas: 2, status_conciliacao: 'parcial' }).titulo).toMatch(/^Importação concluída/)
    expect(textoResultado({ repetida: true, operacao: 'x' }).titulo).toMatch(/conferência já tinha sido aplicada/)
  })
})
