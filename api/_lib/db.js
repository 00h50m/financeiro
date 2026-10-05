// Acesso ao Supabase com a service role (só roda no servidor). Todas as escritas das integrações
// passam por aqui; o navegador nunca recebe essa chave.
import { createClient } from '@supabase/supabase-js'

const ABERTOS = ['pendente', 'aguardando_dados']
const POR_PAGINA = 1000 // limite de linhas por requisição do Supabase

export function criarDb({ url, serviceKey }) {
  const sb = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const dados = (r) => { if (r.error) throw new Error(r.error.message); return r.data }

  async function todas(tabela, colunas, filtrar = (q) => q) {
    const linhas = []
    for (let de = 0; ; de += POR_PAGINA) {
      const pagina = dados(await filtrar(sb.from(tabela).select(colunas)).range(de, de + POR_PAGINA - 1))
      linhas.push(...pagina)
      if (pagina.length < POR_PAGINA) return linhas
    }
  }
  const emAndamento = (uid) => sb.from('eventos_financeiros').select('*')
    .eq('origem', 'telegram').in('status', ABERTOS).eq('contexto->>telegram_user_id', String(uid))
    .order('capturado_em', { ascending: false }).limit(1)

  return {
    sb,
    // ---- anti-replay e limite de uso ----
    async registrarUpdate(update_id, telegram_user_id) {
      const r = await sb.from('webhook_updates').insert({ update_id, telegram_user_id })
      if (r.error) { if (r.error.code === '23505') return false; throw new Error(r.error.message) }
      if (Math.random() < 0.02) { // limpeza ocasional de registros antigos
        await sb.from('webhook_updates').delete().lt('recebido_em', new Date(Date.now() - 7 * 864e5).toISOString())
      }
      return true
    },
    async esquecerUpdate(update_id) { await sb.from('webhook_updates').delete().eq('update_id', update_id) },
    async contarUpdates(uid, desdeISO) {
      const r = await sb.from('webhook_updates').select('update_id', { count: 'exact', head: true }).eq('telegram_user_id', uid).gte('recebido_em', desdeISO)
      if (r.error) throw new Error(r.error.message)
      return r.count || 0
    },
    // ---- quem pode usar o bot ----
    async buscarIntegracao(uid) { return dados(await sb.from('integracoes_telegram').select('*').eq('telegram_user_id', uid).maybeSingle()) },
    // Atômico: o código só vale uma vez e só até expirar.
    async consumirPareamento(codigo_hash, tipo) {
      const agora = new Date().toISOString()
      const r = dados(await sb.from('pareamentos').update({ usado_em: agora })
        .eq('codigo_hash', codigo_hash).eq('tipo', tipo).is('usado_em', null).gt('expira_em', agora).select('pessoa_id'))
      return r[0] || null
    },
    async salvarIntegracao(row) {
      dados(await sb.from('integracoes_telegram').upsert({ ...row, ativo: true, conectado_em: new Date().toISOString() }, { onConflict: 'telegram_user_id' }))
    },
    async tocarIntegracao(uid) { await sb.from('integracoes_telegram').update({ ultimo_uso: new Date().toISOString() }).eq('telegram_user_id', uid) },
    // ---- dados de apoio ----
    async carregarContexto() {
      const [categorias, cartoes, pessoas, regras, aliases, compras, eventos] = await Promise.all([
        todas('categorias', '*'),
        todas('cartoes', '*', (q) => q.eq('ativo', true).order('created_at')),
        todas('pessoas', '*', (q) => q.order('created_at')),
        todas('regras_categorizacao', '*'),
        todas('estabelecimento_aliases', '*'),
        todas('compras', 'id,data_compra,descricao,identificacao,cartao_id,valor_total,parcelas,origem', (q) => q.order('id')),
        todas('eventos_financeiros', 'id,compra_id,origem,status', (q) => q.not('compra_id', 'is', null).order('id')),
      ])
      return { categorias, cartoes, pessoas, regras, aliases, compras, eventos }
    },
    async buscarCompra(id) { return dados(await sb.from('compras').select('id,descricao,identificacao,valor_total,data_compra').eq('id', id).maybeSingle()) },
    async contarPendentes() {
      const r = await sb.from('eventos_financeiros').select('id', { count: 'exact', head: true }).in('status', ABERTOS)
      if (r.error) throw new Error(r.error.message)
      return r.count || 0
    },
    // ---- eventos ----
    async inserirEvento(row) {
      const r = await sb.from('eventos_financeiros').insert(row).select().single()
      if (!r.error) return r.data
      if (r.error.code !== '23505') throw new Error(r.error.message)
      return dados(await sb.from('eventos_financeiros').select('*').eq('origem', row.origem).eq('id_externo', row.id_externo).single())
    },
    async buscarEvento(id) { return dados(await sb.from('eventos_financeiros').select('*').eq('id', id).maybeSingle()) },
    async atualizarEvento(id, patch) { return dados(await sb.from('eventos_financeiros').update(patch).eq('id', id).select().single()) },
    async buscarEsperandoTexto(uid) {
      const r = dados(await emAndamento(uid).not('contexto->>esperando', 'is', null))
      return r[0] || null
    },
    async buscarEmAndamento(uid) { return dados(await emAndamento(uid))[0] || null },
    async confirmarEvento(id, campos, por) {
      return dados(await sb.rpc('confirmar_evento', { p_evento: id, p_campos: campos, p_resolvido_por: por }))
    },
    async vincularEvento(id, compraId, por) {
      dados(await sb.rpc('vincular_evento', { p_evento: id, p_compra: compraId, p_resolvido_por: por }))
    },
    async comprasPeriodo(de, ate) {
      return todas('compras', 'data_compra,valor_total,categoria,subcategoria,descricao,identificacao,pessoa',
        (q) => q.gte('data_compra', de).lte('data_compra', ate).order('id'))
    },
    // ---- desfazer ----
    async ultimaConfirmada(uid) {
      const r = dados(await sb.from('eventos_financeiros').select('*').eq('origem', 'telegram').eq('status', 'confirmado')
        .eq('contexto->>telegram_user_id', String(uid)).not('compra_id', 'is', null)
        .order('resolvido_em', { ascending: false }).limit(1))
      return r[0] || null
    },
    async buscarEditandoUltima(uid) {
      const r = dados(await sb.from('eventos_financeiros').select('*').eq('origem', 'telegram').eq('status', 'confirmado')
        .eq('contexto->>telegram_user_id', String(uid)).not('contexto->>esperando_ultima', 'is', null)
        .order('resolvido_em', { ascending: false }).limit(1))
      return r[0] || null
    },
    // Só corrige compra que o próprio bot criou (origem telegram); devolve se alterou.
    async atualizarCompraDoBot(id, patch) {
      return dados(await sb.from('compras').update(patch).eq('id', id).eq('origem', 'telegram').select('id')).length > 0
    },
    // Só apaga compra que o próprio bot criou (origem telegram); devolve se apagou.
    async apagarCompraDoBot(id) {
      return dados(await sb.from('compras').delete().eq('id', id).eq('origem', 'telegram').select('id')).length > 0
    },
    async ignorarEvento(id, por) {
      dados(await sb.from('eventos_financeiros').update({ status: 'ignorado', resolvido_em: new Date().toISOString(), resolvido_por: por }).eq('id', id).in('status', ABERTOS))
    },
  }
}
