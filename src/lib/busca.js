// BUSCA GLOBAL: procura em compras, contas fixas, cartões, metas e Inbox, sem diferenciar acento ou maiúscula.
import { normBasico } from './normalizacao'

const contem = (texto, termo) => normBasico(texto).includes(termo)

// Aceita também valor ("89,90" ou "89.90") para achar uma compra pelo preço.
const valorDoTermo = (t) => {
  const n = Number(String(t).replace(/\./g, (m, i, s) => (s.includes(',') ? '' : m)).replace(',', '.'))
  return Number.isFinite(n) && /\d/.test(t) ? n : null
}

export function buscar(d, termoBruto, { limite = 15 } = {}) {
  const termo = normBasico(termoBruto)
  if (termo.length < 2) return { termo, grupos: [], total: 0 }
  const valor = valorDoTermo(termoBruto.trim())
  const grupos = []
  const add = (id, titulo, aba, itens) => { if (itens.length) grupos.push({ id, titulo, aba, total: itens.length, itens: itens.slice(0, limite) }) }

  add('compras', 'Compras', 'compras', d.compras
    .filter((c) => [c.descricao, c.identificacao, c.categoria, c.subcategoria, c.obs, c.pessoa].some((x) => contem(x, termo))
      || (valor != null && (Number(c.valor_total) === valor)))
    .sort((a, b) => String(b.data_compra).localeCompare(String(a.data_compra)))
    .map((c) => ({ chave: c.id, titulo: c.identificacao || c.descricao, sub: `${String(c.data_compra).slice(0, 10).split('-').reverse().join('/')} · ${c.categoria || 'Sem categoria'}`, valor: Number(c.valor_total) })))

  add('fixos', 'Contas fixas', 'fixos', d.fixos
    .filter((f) => [f.nome, f.categoria, f.subcategoria].some((x) => contem(x, termo)) || (valor != null && Number(f.valor) === valor))
    .map((f) => ({ chave: f.id, titulo: f.nome, sub: f.ativo ? 'ativa' : 'pausada', valor: Number(f.valor) })))

  add('cartoes', 'Cartões', 'cartoes', d.cartoes.filter((c) => contem(c.nome, termo)).map((c) => ({ chave: c.id, titulo: c.nome, sub: `fecha dia ${c.fechamento}, vence dia ${c.vencimento}` })))

  add('metas', 'Metas', 'metas', (d.metas || []).filter((m) => contem(m.nome, termo)).map((m) => ({ chave: m.id, titulo: m.nome, sub: m.tipo === 'reserva' ? 'reserva' : 'objetivo' })))

  add('inbox', 'Inbox', 'inbox', (d.eventos || [])
    .filter((e) => [e.descricao_original, e.categoria, e.obs].some((x) => contem(x, termo)))
    .map((e) => ({ chave: e.id, titulo: e.descricao_original, sub: `${String(e.data_evento).slice(0, 10).split('-').reverse().join('/')} · ${e.status}`, valor: Math.abs(Number(e.valor)) })))

  return { termo, grupos, total: grupos.reduce((s, g) => s + g.total, 0) }
}
