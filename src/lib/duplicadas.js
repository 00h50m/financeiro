// Aviso de compra duplicada ao lançar: mesmo cartão, mesmo valor, parcelas iguais, até 3 dias de diferença e nome parecido.
import { chaveEstabelecimento, similaridadeEstabelecimento } from './estabelecimento.js'

const dias = (a, b) => Math.abs(Date.parse(String(a).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(b).slice(0, 10) + 'T12:00:00Z')) / 86400000

export function acharSemelhantes(nova, compras, aliases = new Map()) {
  const chaveNova = chaveEstabelecimento(nova.descricao || '', aliases).chave
  return compras.filter((c) => {
    if (nova.id && c.id === nova.id) return false
    if ((c.cartao_id || null) !== (nova.cartao_id || null)) return false
    if (Math.abs(Number(c.valor_total) - Number(nova.valor_total)) >= 0.01) return false
    if ((Number(c.parcelas) || 1) !== (Number(nova.parcelas) || 1)) return false
    const d = dias(c.data_compra, nova.data_compra)
    if (d > 3) return false
    const sim = similaridadeEstabelecimento(chaveNova, chaveEstabelecimento(c.descricao || c.identificacao || '', aliases).chave)
    return d === 0 ? sim >= 0.3 || chaveNova === '' : sim >= 0.6
  }).sort((a, b) => dias(a.data_compra, nova.data_compra) - dias(b.data_compra, nova.data_compra))
}
