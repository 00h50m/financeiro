import { describe, it, expect } from 'vitest'
import { encontrarCorrespondencia } from '../reconciliacao'
import { compra } from './fixtures'

const ev = (o) => ({ origem: 'csv', valor: 74.9, data_evento: '2026-10-04', cartao_id: 'c-nu', parcelas: 1, estabelecimento_chave: 'ifood', ...o })

describe('reconciliação', () => {
  it('CSV "IFOOD *IFOOD" casa exatamente com a compra vinda da notificação', () => {
    const c = compra({ id: 'n', descricao: 'IFOOD', origem: 'android_notification' })
    const r = encontrarCorrespondencia(ev(), [c])
    expect(r.nivel).toBe('exato')
    expect(r.compra.id).toBe('n')
  })
  it('CSV casa com compra lançada pelo Telegram, mesmo com um dia de diferença na data', () => {
    const c = compra({ origem: 'telegram', descricao: 'ifood' })
    const r = encontrarCorrespondencia(ev({ data_evento: '2026-10-05' }), [c])
    expect(r.nivel).toBe('exato')
  })
  it('data a 3 dias vira "provável"; a mais de 3 dias, nenhum', () => {
    const c = compra({ origem: 'telegram' })
    expect(encontrarCorrespondencia(ev({ data_evento: '2026-10-07' }), [c]).nivel).toBe('provavel')
    expect(encontrarCorrespondencia(ev({ data_evento: '2026-10-09' }), [c]).nivel).toBe('nenhum')
  })
  it('valor, cartão ou estabelecimento diferentes não casam', () => {
    const c = compra({ origem: 'telegram' })
    expect(encontrarCorrespondencia(ev({ valor: 75.9 }), [c]).nivel).toBe('nenhum')
    expect(encontrarCorrespondencia(ev({ cartao_id: 'c-in' }), [c]).nivel).toBe('nenhum')
    expect(encontrarCorrespondencia(ev({ estabelecimento_chave: 'drogasil' }), [c]).nivel).toBe('nenhum')
  })
  it('cartão do evento desconhecido: no máximo "provável"', () => {
    const c = compra({ origem: 'telegram' })
    expect(encontrarCorrespondencia(ev({ cartao_id: null }), [c]).nivel).toBe('provavel')
  })
  it('a mesma origem repetida é outro gasto, não duplicata', () => {
    const c = compra({ origem: 'telegram' })
    expect(encontrarCorrespondencia(ev({ origem: 'telegram' }), [c]).nivel).toBe('nenhum')
  })
  it('compra já ligada a um evento da mesma origem também é ignorada', () => {
    const c = compra({ origem: 'manual' })
    const eventos = [{ compra_id: 'x1', origem: 'csv', status: 'vinculado' }]
    expect(encontrarCorrespondencia(ev(), [c], { eventos }).nivel).toBe('nenhum')
  })
  it('duas compras idênticas no dia: não escolhe sozinho', () => {
    const r = encontrarCorrespondencia(ev(), [compra({ id: 'a' }), compra({ id: 'b' })])
    expect(r.nivel).toBe('provavel')
    expect(r.ambiguo).toBe(true)
  })
  it('parcela de compra parcelada casa pelo valor da parcela, sem exigir a data', () => {
    const c = compra({ valor_total: 300, parcelas: 3, descricao: 'MAGALU', data_compra: '2026-08-10' })
    const r = encontrarCorrespondencia(ev({ valor: 100, data_evento: '2026-10-10', estabelecimento_chave: 'magalu' }), [c])
    expect(r.nivel).toBe('provavel')
  })
})

describe('parcelamento nos dois lados', () => {
  it('mesmo total, mesmas parcelas, mesmo cartão, lugar e dia: exato', () => {
    const c = compra({ descricao: 'MAGALU', valor_total: 300, parcelas: 3, data_compra: '2026-10-04', origem: 'telegram' })
    const r = encontrarCorrespondencia(ev({ valor: 300, parcelas: 3, estabelecimento_chave: 'magalu' }), [c])
    expect(r.nivel).toBe('exato')
  })
  it('número de parcelas diferente continua só "provável"', () => {
    const c = compra({ descricao: 'MAGALU', valor_total: 300, parcelas: 3, data_compra: '2026-10-04', origem: 'telegram' })
    const r = encontrarCorrespondencia(ev({ valor: 300, parcelas: 6, estabelecimento_chave: 'magalu' }), [c])
    expect(r.nivel).not.toBe('exato')
  })
})

