// BUSCA GLOBAL: procura em compras, contas fixas, faturas, cartões, metas e Inbox.
// Mesma linguagem das listas (lib/filtro.js): nome sem acento, valor (89,90), faixa (100..200, >50) e data (05/09).
import { compilar } from './filtro.js'
import { normBasico } from './normalizacao.js'

const fmtData = (d) => String(d).slice(0, 10).split('-').reverse().join('/')

export function buscar(d, termoBruto, { limite = 15 } = {}) {
  const termo = normBasico(termoBruto)
  if (termo.length < 2) return { termo, grupos: [], total: 0 }
  const { combina } = compilar(termoBruto)
  const grupos = []
  const add = (id, titulo, aba, itens) => { if (itens.length) grupos.push({ id, titulo, aba, total: itens.length, itens: itens.slice(0, limite) }) }
  const cartaoNome = (id) => (d.cartoes || []).find((c) => c.id === id)?.nome

  add('compras', 'Compras', 'compras', d.compras
    .filter((c) => combina({
      texto: [c.descricao, c.identificacao, c.categoria, c.subcategoria, c.obs, c.pessoa, cartaoNome(c.cartao_id)].filter(Boolean).join(' '),
      valor: [Number(c.valor_total), Number(c.parcelas) > 1 ? Number(c.valor_total) / Number(c.parcelas) : null],
      data: c.data_compra,
    }))
    .sort((a, b) => String(b.data_compra).localeCompare(String(a.data_compra)))
    .map((c) => ({ chave: c.id, titulo: c.identificacao || c.descricao, sub: `${fmtData(c.data_compra)} · ${c.categoria || 'Sem categoria'}${cartaoNome(c.cartao_id) ? ' · ' + cartaoNome(c.cartao_id) : ''}`, valor: Number(c.valor_total) })))

  add('fixos', 'Contas fixas', 'fixos', d.fixos
    .filter((f) => combina({ texto: [f.nome, f.categoria, f.subcategoria, f.pessoa].filter(Boolean).join(' '), valor: Number(f.valor) }))
    .map((f) => ({ chave: f.id, titulo: f.nome, sub: f.ativo ? 'ativa' : 'pausada', valor: Number(f.valor) })))

  add('faturas', 'Faturas', 'faturas', (d.faturas || [])
    .filter((f) => combina({ texto: `${cartaoNome(f.cartao_id) || ''} fatura ${f.mes}`, valor: f.valor_real != null && f.valor_real !== '' ? Number(f.valor_real) : null, data: f.mes }))
    .sort((a, b) => String(b.mes).localeCompare(String(a.mes)))
    .map((f) => ({ chave: f.id, titulo: `${cartaoNome(f.cartao_id) || 'Cartão'} · ${f.mes.split('-').reverse().join('/')}`, sub: f.pago ? 'paga' : 'não paga', valor: f.valor_real != null && f.valor_real !== '' ? Number(f.valor_real) : undefined })))

  add('cartoes', 'Cartões', 'cartoes', d.cartoes.filter((c) => combina({ texto: c.nome })).map((c) => ({ chave: c.id, titulo: c.nome, sub: `fecha dia ${c.fechamento}, vence dia ${c.vencimento}` })))

  add('metas', 'Metas', 'metas', (d.metas || []).filter((m) => combina({ texto: m.nome })).map((m) => ({ chave: m.id, titulo: m.nome, sub: m.tipo === 'reserva' ? 'reserva' : 'objetivo' })))

  add('inbox', 'Inbox', 'inbox', (d.eventos || [])
    .filter((e) => combina({ texto: [e.descricao_original, e.categoria, e.obs, e.status].filter(Boolean).join(' '), valor: Math.abs(Number(e.valor)), data: e.data_evento }))
    .map((e) => ({ chave: e.id, titulo: e.descricao_original, sub: `${fmtData(e.data_evento)} · ${e.status}`, valor: Math.abs(Number(e.valor)) })))

  return { termo, grupos, total: grupos.reduce((s, g) => s + g.total, 0) }
}
