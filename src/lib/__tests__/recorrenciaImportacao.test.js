import { describe, it, expect } from 'vitest'
import { recorrenciasAntesDaFatura, recorrenciaDaLinha, contaFixaDaLinha } from '../recorrenciaImportacao'

const compra = (mes, descricao, valor, extra = {}) => ({ id: `${descricao}${mes}`, data_compra: `${mes}-05`, descricao, categoria: 'Assinaturas', subcategoria: 'Outros', pessoa: 'Gi', cartao_id: 'c1', valor_total: valor, parcelas: 1, ...extra })
const hist = [compra('2026-08', 'NETFLIX', 55.9), compra('2026-09', 'NETFLIX', 55.9), compra('2026-08', 'OPENAI CHATGPT', 100), compra('2026-09', 'OPENAI CHATGPT', 112)]
const linha = (o) => ({ descricao: 'NETFLIX', descricaoOriginal: 'NETFLIX', valor: 55.9, cartao_id: 'c1', natureza: 'compra', pessoa: 'Gi', categoria: 'Assinaturas', subcategoria: 'Outros', ...o })

describe('recorrência na importação da fatura', () => {
  const recs = recorrenciasAntesDaFatura({ compras: hist, fixos: [], mesFatura: '2026-10' })
  it('com 2 meses de histórico antes da fatura já reconhece a assinatura (a linha é a 3ª)', () => {
    expect(recs.map((r) => r.nome).sort()).toEqual(['NETFLIX', 'OPENAI CHATGPT'])
  })
  it('não sugere o que já é conta fixa', () => {
    expect(recorrenciasAntesDaFatura({ compras: hist, fixos: [{ nome: 'Netflix' }], mesFatura: '2026-10' }).map((r) => r.nome)).toEqual(['OPENAI CHATGPT'])
  })
  it('liga a linha da fatura à recorrência (mesmo lugar, cartão e valor compatível)', () => {
    const r = recorrenciaDaLinha(linha(), recs)
    expect(r).toMatchObject({ nome: 'NETFLIX', ocorrencias: 2, variavel: false })
    const v = recorrenciaDaLinha(linha({ descricao: 'OPENAI CHATGPT', descricaoOriginal: 'OPENAI CHATGPT', valor: 118 }), recs)
    expect(v).toMatchObject({ variavel: true })
  })
  it('não liga: outro cartão, valor muito diferente, parcelada, crédito, encargo ou sem histórico', () => {
    expect(recorrenciaDaLinha(linha({ cartao_id: 'c2' }), recs)).toBeNull()
    expect(recorrenciaDaLinha(linha({ valor: 400 }), recs)).toBeNull()
    expect(recorrenciaDaLinha(linha({ parcela_total: 3 }), recs)).toBeNull()
    expect(recorrenciaDaLinha(linha({ natureza: 'credito', valor: 55.9 }), recs)).toBeNull()
    expect(recorrenciaDaLinha(linha({ natureza: 'encargo' }), recs)).toBeNull()
    expect(recorrenciaDaLinha(linha({ descricao: 'PADARIA', descricaoOriginal: 'PADARIA' }), recs)).toBeNull()
    expect(recorrenciaDaLinha(linha(), [])).toBeNull()
  })
  it('conta fixa começa no mês seguinte à fatura e é variável quando o preço muda', () => {
    const rv = recorrenciaDaLinha(linha({ descricao: 'OPENAI CHATGPT', descricaoOriginal: 'OPENAI CHATGPT', valor: 118 }), recs)
    const f = contaFixaDaLinha(linha({ valor: 118 }), rv, '2026-10', { colunaCartaoOk: true, colunaVariavelOk: true })
    expect(f).toMatchObject({ valor: 118, mes_inicio: '2026-11', cartao_id: 'c1', variavel: true, ativo: true })
    const rf = recorrenciaDaLinha(linha(), recs)
    expect(contaFixaDaLinha(linha(), rf, '2026-10', { colunaCartaoOk: true, colunaVariavelOk: true }).variavel).toBeUndefined()
    expect(contaFixaDaLinha(linha(), rf, '2026-12').mes_inicio).toBe('2027-01') // vira o ano
    expect(contaFixaDaLinha(linha(), rf, '2026-10').cartao_id).toBeUndefined() // sem a coluna no banco, não envia o campo
  })
})
