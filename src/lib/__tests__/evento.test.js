import { describe, it, expect } from 'vitest'
import { prepararEvento } from '../evento'
import { construirRegrasDoHistorico, sugerirCategoria, podeAutoConfirmar } from '../categorizacao'
import { categorias, cartoes, pessoas, compra, entrada } from './fixtures'

const ctx = (o = {}) => ({ categorias, cartoes, pessoas, regras: [], aliases: [], compras: [], eventos: [], ...o })
const hist = [
  compra({ id: 'h1', descricao: 'DROGASIL 123', categoria: 'Saúde', subcategoria: 'Farmácia', data_compra: '2026-08-01' }),
  compra({ id: 'h2', descricao: 'DROGASIL *SP', categoria: 'Saúde', subcategoria: 'Farmácia', data_compra: '2026-08-15' }),
  compra({ id: 'h3', descricao: 'DROGASIL', categoria: 'Saúde', subcategoria: 'Farmácia', data_compra: '2026-09-01' }),
]

describe('entrada comum de eventos', () => {
  it('estabelecimento conhecido: sugere categoria pelo histórico e fica pronto para confirmar', () => {
    const { evento } = prepararEvento(entrada({ id_externo: 'a', descricao_original: 'DROGASIL', valor: 53.9 }), ctx({ compras: hist }))
    expect(evento).toMatchObject({ categoria: 'Saúde', subcategoria: 'Farmácia', status: 'pendente', faltando: [], origem: 'android_notification' })
    expect(evento.confianca_categoria).toBeGreaterThan(0.5)
    expect(evento.descricao_original).toBe('DROGASIL')
  })
  it('estabelecimento desconhecido: pede a categoria, não inventa', () => {
    const { evento } = prepararEvento(entrada({ descricao_original: 'Loja Nova' }), ctx({ compras: hist }))
    expect(evento).toMatchObject({ categoria: null, status: 'aguardando_dados', faltando: ['categoria'] })
  })
  it('cartão não identificado (e sem histórico no mesmo cartão): pede o cartão', () => {
    const { evento } = prepararEvento(entrada({ cartao_id: undefined, descricao_original: 'DROGASIL' }), ctx({ compras: hist.map((h) => ({ ...h, cartao_id: null })) }))
    expect(evento.faltando).toContain('cartao')
    expect(evento.status).toBe('aguardando_dados')
  })
  it('cartão inexistente no cadastro é descartado, não aceito', () => {
    const { evento } = prepararEvento(entrada({ cartao_id: 'fantasma' }), ctx())
    expect(evento.cartao_id).toBeNull()
    expect(evento.faltando).toContain('cartao')
  })
  it('pessoa não identificada: pede a pessoa', () => {
    const { evento } = prepararEvento(entrada({ pessoa_id: undefined }), ctx({ compras: hist }))
    expect(evento.faltando).toContain('pessoa')
  })
  it('sem cartão: exige forma de pagamento e saber se já foi pago', () => {
    const base = entrada({ cartao_id: undefined, descricao_original: 'DROGASIL' })
    expect(prepararEvento({ ...base, forma_pagamento: 'pix' }, ctx({ compras: hist })).evento.faltando).toEqual(['pago'])
    const ok = prepararEvento({ ...base, forma_pagamento: 'pix', pago: true }, ctx({ compras: hist })).evento
    expect(ok).toMatchObject({ status: 'pendente', forma_pagamento: 'pix', pago: true })
  })
  it('cartão padrão da regra não sobrescreve "sem cartão" dito pela pessoa', () => {
    const regras = [{ id: 'r', estabelecimento_chave: 'drogasil', categoria: 'Saúde', subcategoria: 'Farmácia', confianca: 0.9, confirmacoes: 9, cartao_id: 'c-nu' }]
    const base = entrada({ cartao_id: undefined, descricao_original: 'DROGASIL' })
    expect(prepararEvento(base, ctx({ regras })).evento.cartao_id).toBe('c-nu')
    expect(prepararEvento({ ...base, forma_pagamento: 'pix' }, ctx({ regras })).evento.cartao_id).toBeNull()
  })
  it('categoria informada que não existe é ignorada', () => {
    const { evento } = prepararEvento(entrada({ categoria: 'Inventada', subcategoria: 'X', descricao_original: 'Loja Nova' }), ctx())
    expect(evento.categoria).toBeNull()
  })
  it.each([
    [{ valor: 0 }, 'valor'], [{ valor: 'abc' }, 'valor'], [{ data_evento: '04/10/2026' }, 'data'],
    [{ descricao_original: '  ' }, 'descrição'], [{ id_externo: '' }, 'id_externo'], [{ origem: 'Telegram!' }, 'origem'],
  ])('rejeita entrada inválida %j', (o, parte) => {
    const r = prepararEvento(entrada(o), ctx())
    expect(r.evento).toBeNull()
    expect(r.erros.join(' ')).toContain(parte)
  })
  it('compra duplicada: aponta a compra existente como correspondência exata', () => {
    const existente = compra({ id: 'tg', origem: 'telegram', descricao: 'ifood' })
    const { evento } = prepararEvento(entrada({ origem: 'csv', descricao_original: 'IFOOD *IFOOD' }), ctx({ compras: [existente] }))
    expect(evento).toMatchObject({ match_nivel: 'exato', match_compra_id: 'tg' })
  })
  it('notificação do Android casa com compra do Telegram', () => {
    const existente = compra({ id: 'tg', origem: 'telegram', descricao: 'ifood', data_compra: '2026-10-04' })
    const { evento } = prepararEvento(entrada({ descricao_original: 'IFOOD' }), ctx({ compras: [existente] }))
    expect(evento.match_nivel).toBe('exato')
  })
  it('sem compra parecida: lançamento novo', () => {
    expect(prepararEvento(entrada(), ctx({ compras: hist })).evento.match_nivel).toBe('nenhum')
  })
})

describe('regras de categorização', () => {
  it('aprende do histórico e dá menos confiança à categoria minoritária', () => {
    const regras = construirRegrasDoHistorico([...hist, compra({ descricao: 'DROGASIL', categoria: 'Diversos', subcategoria: 'Outros' })])
    const principal = regras.find((r) => r.categoria === 'Saúde')
    const minoritaria = regras.find((r) => r.categoria === 'Diversos')
    expect(principal.confianca).toBeGreaterThan(minoritaria.confianca)
  })
  it('regra do banco vence o histórico e ignora categoria que não existe mais', () => {
    const regras = [
      { id: 'r1', estabelecimento_chave: 'ifood', categoria: 'Removida', subcategoria: 'X', confianca: 0.9, confirmacoes: 9 },
      { id: 'r2', estabelecimento_chave: 'ifood', categoria: 'Alimentação', subcategoria: 'Delivery', confianca: 0.5, confirmacoes: 1 },
    ]
    expect(sugerirCategoria({ chave: 'ifood', regras, categorias })).toMatchObject({ regra_id: 'r2', subcategoria: 'Delivery' })
  })
  it('confirmação automática só se a regra pedir e a confiança for alta (gancho futuro)', () => {
    expect(podeAutoConfirmar({ auto_confirmar: false, confianca: 0.99 })).toBe(false)
    expect(podeAutoConfirmar({ auto_confirmar: true, confianca: 0.8 })).toBe(false)
    expect(podeAutoConfirmar({ auto_confirmar: true, confianca: 0.95 })).toBe(true)
  })
})

describe('categoria pelo nome falado (sem histórico)', () => {
  const base = { origem: 'telegram', id_externo: 'x:1', valor: 20, data_evento: '2026-10-04', cartao_id: 'c-nu', pessoa_id: 'p-gi' }
  const ctx = { categorias, cartoes, pessoas }
  it('"mercado" vira Alimentação > Mercado', () => {
    const { evento } = prepararEvento({ ...base, descricao_original: 'mercado' }, ctx)
    expect(evento).toMatchObject({ categoria: 'Alimentação', subcategoria: 'Mercado', status: 'pendente', confianca_categoria: null })
  })
  it('"uber" vira Transporte > Uber/99/Táxi', () => {
    expect(prepararEvento({ ...base, descricao_original: 'uber' }, ctx).evento.subcategoria).toBe('Uber/99/Táxi')
  })
  it('nome sem relação continua perguntando a categoria', () => {
    expect(prepararEvento({ ...base, descricao_original: 'presente' }, ctx).evento.faltando).toContain('categoria')
  })
})

describe('cartão sugerido pelo histórico', () => {
  const compraCom = (id, cartao_id, descricao = 'UBER *TRIP') => compra({ id, cartao_id, descricao })
  const base = { origem: 'telegram', id_externo: 'x:9', valor: 20, data_evento: '2026-10-04', descricao_original: 'uber', pessoa_id: 'p-gi' }
  const c2 = (compras) => ctx({ compras })
  it('2+ compras no mesmo cartão: sugere e marca como sugerido', () => {
    const r = prepararEvento(base, c2([compraCom('a', 'c-nu'), compraCom('b', 'c-nu'), compraCom('c', 'c-nu')]))
    expect(r.evento.cartao_id).toBe('c-nu')
    expect(r.sugeridos.cartao).toBe(true)
    expect(r.evento.faltando).not.toContain('cartao')
  })
  it('histórico dividido ou curto não sugere (continua perguntando)', () => {
    expect(prepararEvento(base, c2([compraCom('a', 'c-nu'), compraCom('b', 'c-in')])).evento.faltando).toContain('cartao')
    expect(prepararEvento(base, c2([compraCom('a', 'c-nu')])).evento.faltando).toContain('cartao')
  })
  it('cartão dito ou pix na mensagem vence a sugestão', () => {
    const hist = [compraCom('a', 'c-nu'), compraCom('b', 'c-nu')]
    expect(prepararEvento({ ...base, cartao_id: 'c-in' }, c2(hist)).evento.cartao_id).toBe('c-in')
    const pix = prepararEvento({ ...base, forma_pagamento: 'pix' }, c2(hist))
    expect(pix.evento.cartao_id).toBeNull()
    expect(pix.sugeridos.cartao).toBe(false)
  })
  it('outro estabelecimento não herda o cartão', () => {
    expect(prepararEvento({ ...base, descricao_original: 'padaria' }, c2([compraCom('a', 'c-nu'), compraCom('b', 'c-nu')])).evento.faltando).toContain('cartao')
  })
})
