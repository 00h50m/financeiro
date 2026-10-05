import { useState, useEffect, useRef } from 'react'
import { sb } from './supabase.js'
import { hojeSP } from './utils.js'
import { gerarCodigo, hashCodigo } from './pareamento.js'

const POR_PAGINA = 1000 // o Supabase devolve no máximo 1000 linhas por consulta

// Lê a tabela inteira, de 1000 em 1000 (sem isso, passando de 1000 linhas as mais antigas somem sem aviso).
// `ordem` precisa ser estável (inclui id) para as páginas não repetirem nem pularem linhas.
async function lerTudo(tabela, ordenar) {
  const linhas = []
  for (let de = 0; ; de += POR_PAGINA) {
    const r = await ordenar(sb.from(tabela).select('*')).range(de, de + POR_PAGINA - 1)
    if (r.error) return { error: r.error, data: null }
    linhas.push(...r.data)
    if (r.data.length < POR_PAGINA) return { error: null, data: linhas }
  }
}

export function useStore() {
  const [cartoes, setCartoes] = useState([])
  const [compras, setCompras] = useState([])
  const [rendas, setRendas] = useState([])
  const [fixos, setFixos] = useState([])
  const [faturas, setFaturas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [fixosPagamentos, setFixosPagamentos] = useState([])
  const [saldoAjustes, setSaldoAjustes] = useState([])
  const [pessoas, setPessoas] = useState([])
  const [orcamentos, setOrcamentos] = useState([])
  const [config, setConfig] = useState({}) // chave -> valor (tabela config)
  const [eventos, setEventos] = useState([]) // Inbox Financeiro (eventos_financeiros)
  const [regras, setRegras] = useState([]) // regras_categorizacao
  const [aliases, setAliases] = useState([]) // estabelecimento_aliases
  const [integracoesTelegram, setIntegracoesTelegram] = useState([])
  const [inboxOk, setInboxOk] = useState(true) // false = migration do Inbox ainda não rodou
  const [configOk, setConfigOk] = useState(true)
  const [orcamentosOk, setOrcamentosOk] = useState(true) // false = tabela ainda não criada no banco
  const [comprasPagamentos, setComprasPagamentos] = useState([])
  const [comprasPagamentosOk, setComprasPagamentosOk] = useState(false) // false = migration 14 ainda não rodada
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('ok')
  const [error, setError] = useState(null)

  const ultimaCarga = useRef(0)

  // Devolve true se carregou. Recarga silenciosa que falha mantém os dados antigos na tela (não derruba o app).
  async function loadAll({ silent = false } = {}) {
    const minha = ++ultimaCarga.current
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const [c, co, r, fx, fa, cat, fxp, sa, ps, orc, cfg, ev, rg, al, it, cp] = await Promise.all([
        sb.from('cartoes').select('*').order('created_at'),
        lerTudo('compras', (q) => q.order('data_compra', { ascending: false }).order('id')),
        sb.from('rendas').select('*').order('mes', { ascending: false }),
        sb.from('fixos').select('*').order('created_at'),
        lerTudo('faturas', (q) => q.order('mes', { ascending: false }).order('id')),
        sb.from('categorias').select('*').order('nome'),
        lerTudo('fixos_pagamentos', (q) => q.order('id')),
        sb.from('saldo_ajustes').select('*'),
        sb.from('pessoas').select('*').order('created_at'),
        sb.from('orcamentos').select('*'),
        sb.from('config').select('*'),
        lerTudo('eventos_financeiros', (q) => q.order('capturado_em', { ascending: false }).order('id')),
        sb.from('regras_categorizacao').select('*'),
        sb.from('estabelecimento_aliases').select('*'),
        sb.from('integracoes_telegram').select('*').order('conectado_em'),
        lerTudo('compras_pagamentos', (q) => q.order('id')),
      ])
      if (minha !== ultimaCarga.current) { if (!silent) setLoading(false); return true } // chegou uma recarga mais nova: esta resposta é velha
      if (c.error) throw c.error
      if (co.error) throw co.error
      if (r.error) throw r.error
      if (fx.error) throw fx.error
      if (fa.error) throw fa.error
      if (cat.error) throw cat.error
      if (fxp.error) throw fxp.error
      if (sa.error) throw sa.error
      if (ps.error) throw ps.error
      setCartoes(c.data || [])
      setCompras(co.data || [])
      setRendas(r.data || [])
      setFixos(fx.data || [])
      setFaturas(fa.data || [])
      setCategorias(cat.data || [])
      setFixosPagamentos(fxp.data || [])
      setSaldoAjustes(sa.data || [])
      setPessoas(ps.data || [])
      // Pagamento por parcela é opcional: sem a migration 14 o app usa o "pago" antigo da compra.
      setComprasPagamentosOk(!cp.error)
      setComprasPagamentos(cp.error ? [] : cp.data || [])
      // Orçamentos são opcionais: se a tabela ainda não existe, o resto do app continua funcionando.
      setOrcamentosOk(!orc.error)
      setOrcamentos(orc.error ? [] : orc.data || [])
      setConfigOk(!cfg.error)
      setConfig(cfg.error ? {} : Object.fromEntries((cfg.data || []).map((x) => [x.chave, x.valor])))
      // Inbox é opcional: sem a migration (inbox/*.sql) o resto do app continua funcionando.
      const inboxPronto = !ev.error && !rg.error && !al.error
      setInboxOk(inboxPronto)
      setEventos(inboxPronto ? ev.data || [] : [])
      setRegras(inboxPronto ? rg.data || [] : [])
      setAliases(inboxPronto ? al.data || [] : [])
      setIntegracoesTelegram(inboxPronto && !it.error ? it.data || [] : [])
    } catch (e) {
      if (!silent) setError(e.message || 'Erro ao conectar com o banco')
      if (!silent) setLoading(false)
      return false
    }
    if (!silent) setLoading(false)
    return true
  }

  useEffect(() => { loadAll() }, [])

  // Devolve true se gravou; false se deu erro (já avisado na tela). Quem chama só fecha o formulário ou
  // segue para o próximo passo quando for true, para nunca perder o que a pessoa digitou.
  async function op(fn) {
    setSyncState('syncing')
    try {
      await fn()
    } catch (e) {
      setSyncState('error')
      alert('Erro: ' + (e.message || e))
      return false
    }
    setSyncState((await loadAll({ silent: true })) ? 'ok' : 'error')
    return true
  }

  // CARTÕES
  const addCartao = (data) => op(async () => {
    const r = await sb.from('cartoes').insert(data)
    if (r.error) throw r.error
  })
  const updateCartao = (id, data) => op(async () => {
    const r = await sb.from('cartoes').update(data).eq('id', id)
    if (r.error) throw r.error
  })
  const delCartao = (id) => op(async () => {
    const r = await sb.from('cartoes').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // COMPRAS
  const addCompra = (data) => op(async () => {
    const r = await sb.from('compras').insert(data)
    if (r.error) throw r.error
  })
  const updateCompra = (id, data) => op(async () => {
    const r = await sb.from('compras').update(data).eq('id', id)
    if (r.error) throw r.error
  })
  const updateComprasLote = (ids, data) => op(async () => {
    const r = await sb.from('compras').update(data).in('id', ids)
    if (r.error) throw r.error
  })
  const delCompra = (id) => op(async () => {
    const r = await sb.from('compras').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // RENDA
  const upsertRenda = (data) => op(async () => {
    const r = await sb.from('rendas').upsert(data, { onConflict: 'mes' })
    if (r.error) throw r.error
  })

  // FIXOS
  const addFixo = (data) => op(async () => {
    const r = await sb.from('fixos').insert(data)
    if (r.error) throw r.error
  })
  const updateFixo = (id, data) => op(async () => {
    const r = await sb.from('fixos').update(data).eq('id', id)
    if (r.error) throw r.error
  })
  const delFixo = (id) => op(async () => {
    const r = await sb.from('fixos').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // FATURAS
  const upsertFatura = (data) => op(async () => {
    const r = await sb.from('faturas').upsert(data, { onConflict: 'cartao_id,mes' })
    if (r.error?.code === '23502') {
      throw new Error('Falta rodar a atualização 13 do banco (arquivo inbox/13_faturas_valor_real_opcional.sql no Supabase).')
    }
    if (r.error) throw r.error
  })
  const delFatura = (id) => op(async () => {
    const r = await sb.from('faturas').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // PAGAMENTOS DE FIXOS (por mês)
  const marcarFixoPago = (fixo_id, mes, pago) => op(async () => {
    const r = await sb.from('fixos_pagamentos').upsert(
      { fixo_id, mes, pago, data_pagamento: pago ? hojeSP() : null },
      { onConflict: 'fixo_id,mes' }
    )
    if (r.error) throw r.error
  })

  // PAGAMENTO POR PARCELA (compras sem cartão): uma linha por compra e mês
  const marcarParcelaPaga = (compra_id, mes, pago) => op(async () => {
    const r = await sb.from('compras_pagamentos').upsert(
      { compra_id, mes, pago, data_pagamento: pago ? hojeSP() : null },
      { onConflict: 'compra_id,mes' }
    )
    if (r.error) throw r.error
  })

  // SALDO (dinheiro disponível — ajuste manual por mês)
  const definirAjusteSaldo = (mes, ajuste) => op(async () => {
    const r = await sb.from('saldo_ajustes').upsert(
      { mes, ajuste, atualizado_em: new Date().toISOString() },
      { onConflict: 'mes' }
    )
    if (r.error) throw r.error
  })

  // CONFIG (chave/valor genérico)
  const definirConfig = (chave, valor) => op(async () => {
    const r = await sb.from('config').upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' })
    if (r.error) throw r.error
  })

  // ORÇAMENTOS (teto mensal por categoria; valor vazio/0 remove o teto)
  const definirOrcamento = (categoria, valor) => op(async () => {
    const r = valor > 0
      ? await sb.from('orcamentos').upsert({ categoria, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'categoria' })
      : await sb.from('orcamentos').delete().eq('categoria', categoria)
    if (r.error) throw r.error
  })
  const definirOrcamentos = (lista) => op(async () => {
    const agora = new Date().toISOString()
    const r = await sb.from('orcamentos').upsert(
      lista.map(({ categoria, valor }) => ({ categoria, valor, atualizado_em: agora })),
      { onConflict: 'categoria' }
    )
    if (r.error) throw r.error
  })

  // As regras aprendidas e os eventos em aberto do Inbox/Telegram também guardam o nome da categoria.
  // Sem acompanhar a mudança, a sugestão continuaria com o nome velho e o Confirmar falharia ("categoria inválida").
  // Só mexe nelas se a migration do Inbox já rodou (inboxOk).
  const ABERTOS = ['pendente', 'aguardando_dados']
  async function acompanharNoInbox({ categoria, subcategoria, novo, excluirRegras = false }) {
    if (!inboxOk) return
    const filtro = (q) => {
      let r = q.eq('categoria', categoria)
      if (subcategoria !== undefined) r = r.eq('subcategoria', subcategoria)
      return r
    }
    // Ao migrar para uma categoria que já existe, renomear regras bateria na chave única: apaga as velhas (o bot reaprende).
    const rr = excluirRegras
      ? await filtro(sb.from('regras_categorizacao').delete())
      : await filtro(sb.from('regras_categorizacao').update(novo))
    if (rr.error) throw rr.error
    const re = await filtro(sb.from('eventos_financeiros').update(novo)).in('status', ABERTOS)
    if (re.error) throw re.error
  }

  // CATEGORIAS
  const addCategoria = (nome) => op(async () => {
    const r = await sb.from('categorias').insert({ nome, subcategorias: [] })
    if (r.error) throw r.error
  })
  const delCategoria = (id) => op(async () => {
    const nome = categorias.find((c) => c.id === id)?.nome
    const r = await sb.from('categorias').delete().eq('id', id)
    if (r.error) throw r.error
    // O teto de uma categoria removida não faz mais sentido.
    if (nome && orcamentosOk) await sb.from('orcamentos').delete().eq('categoria', nome)
  })
  const renomearCategoria = (id, nomeAntigo, nomeNovo) => op(async () => {
    const r = await sb.from('categorias').update({ nome: nomeNovo }).eq('id', id)
    if (r.error) throw r.error
    const rc = await sb.from('compras').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
    if (rf.error) throw rf.error
    if (orcamentosOk) {
      const ro = await sb.from('orcamentos').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
      if (ro.error) throw ro.error
    }
    await acompanharNoInbox({ categoria: nomeAntigo, novo: { categoria: nomeNovo } })
  })
  const addSubcategoria = (id, subcategorias) => op(async () => {
    const r = await sb.from('categorias').update({ subcategorias }).eq('id', id)
    if (r.error) throw r.error
  })
  const delSubcategoria = (id, subcategorias) => op(async () => {
    const r = await sb.from('categorias').update({ subcategorias }).eq('id', id)
    if (r.error) throw r.error
  })
  const renomearSubcategoria = (id, categoriaNome, subcategorias, subAntiga, subNova) => op(async () => {
    const r = await sb.from('categorias').update({ subcategorias }).eq('id', id)
    if (r.error) throw r.error
    const rc = await sb.from('compras')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rf.error) throw rf.error
    await acompanharNoInbox({ categoria: categoriaNome, subcategoria: subAntiga, novo: { subcategoria: subNova } })
  })
  // Usadas ao excluir uma categoria/subcategoria com movimentações: migra o
  // texto gravado em compras/fixos para o destino escolhido ANTES de remover
  // a opção antiga, para nunca deixar um registro órfão.
  const migrarCategoria = (categoriaAntiga, categoriaNova) => op(async () => {
    const rc = await sb.from('compras').update({ categoria: categoriaNova }).eq('categoria', categoriaAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ categoria: categoriaNova }).eq('categoria', categoriaAntiga)
    if (rf.error) throw rf.error
    await acompanharNoInbox({ categoria: categoriaAntiga, novo: { categoria: categoriaNova }, excluirRegras: true })
  })
  const migrarSubcategoria = (categoriaNome, subAntiga, subNova) => op(async () => {
    const rc = await sb.from('compras')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rf.error) throw rf.error
    await acompanharNoInbox({ categoria: categoriaNome, subcategoria: subAntiga, novo: { subcategoria: subNova }, excluirRegras: true })
  })

  // PESSOAS
  const addPessoa = (nome, cor) => op(async () => {
    const r = await sb.from('pessoas').insert({ nome, cor })
    if (r.error) throw r.error
  })
  const delPessoa = (id) => op(async () => {
    const r = await sb.from('pessoas').delete().eq('id', id)
    if (r.error) throw r.error
  })
  const mudarCorPessoa = (id, cor) => op(async () => {
    const r = await sb.from('pessoas').update({ cor }).eq('id', id)
    if (r.error) throw r.error
  })
  const renomearPessoa = (id, nomeAntigo, nomeNovo) => op(async () => {
    const r = await sb.from('pessoas').update({ nome: nomeNovo }).eq('id', id)
    if (r.error) throw r.error
    const rc = await sb.from('compras').update({ pessoa: nomeNovo }).eq('pessoa', nomeAntigo)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ pessoa: nomeNovo }).eq('pessoa', nomeAntigo)
    if (rf.error) throw rf.error
    const rt = await sb.from('cartoes').update({ titular: nomeNovo }).eq('titular', nomeAntigo)
    if (rt.error) throw rt.error
  })

  // IMPORTAÇÃO DE FATURA (CSV)
  // Não usa `op`: o chamador precisa do erro para dar feedback próprio na tela de importação.
  async function importarTransacoes(rows) {
    setSyncState('syncing')
    try {
      const r = await sb.from('compras').insert(rows)
      if (r.error) throw r.error
    } catch (e) {
      setSyncState('error')
      throw e
    }
    setSyncState((await loadAll({ silent: true })) ? 'ok' : 'error')
  }

  // INBOX FINANCEIRO
  // Não usam `op`: a tela precisa do erro (ex.: "já foi resolvido") para mostrar no próprio cartão.
  async function comRecarga(fn) {
    setSyncState('syncing')
    try {
      await fn()
    } catch (e) {
      setSyncState('error')
      throw e
    }
    setSyncState((await loadAll({ silent: true })) ? 'ok' : 'error')
  }
  async function quemConfirma() {
    const { data } = await sb.auth.getSession()
    return data.session?.user?.email || null
  }
  // A validação e a criação da compra acontecem no banco (função confirmar_evento), de forma atômica.
  const confirmarEvento = (id, campos = {}) => comRecarga(async () => {
    const r = await sb.rpc('confirmar_evento', { p_evento: id, p_campos: campos, p_resolvido_por: await quemConfirma() })
    if (r.error) throw r.error
  })
  const vincularEvento = (id, compraId) => comRecarga(async () => {
    const r = await sb.rpc('vincular_evento', { p_evento: id, p_compra: compraId, p_resolvido_por: await quemConfirma() })
    if (r.error) throw r.error
  })
  const ignorarEvento = (id) => comRecarga(async () => {
    const r = await sb.from('eventos_financeiros')
      .update({ status: 'ignorado', resolvido_em: new Date().toISOString(), resolvido_por: await quemConfirma() })
      .eq('id', id)
      .in('status', ['pendente', 'aguardando_dados'])
    if (r.error) throw r.error
  })
  // Idempotente: (origem, id_externo) já existente é ignorado, não duplica.
  const adicionarEventos = (rows) => comRecarga(async () => {
    const r = await sb.from('eventos_financeiros').upsert(rows, { onConflict: 'origem,id_externo', ignoreDuplicates: true })
    if (r.error) throw r.error
  })
  // Semeia as regras com o histórico de compras, sem sobrescrever contagens que já existam.
  const adicionarRegras = (lista) => comRecarga(async () => {
    const r = await sb.from('regras_categorizacao')
      .upsert(lista, { onConflict: 'estabelecimento_chave,categoria,subcategoria', ignoreDuplicates: true })
    if (r.error) throw r.error
  })

  // AUTOMAÇÕES — TELEGRAM
  // O código nasce aqui; no banco vai só o hash. Vale 10 minutos e uma única vez.
  async function gerarPareamento(tipo, pessoa_id) {
    const codigo = gerarCodigo()
    const r = await sb.from('pareamentos').insert({ tipo, pessoa_id, codigo_hash: await hashCodigo(codigo) })
    if (r.error) throw r.error
    return { codigo, expira_em: Date.now() + 10 * 60 * 1000 }
  }
  const pausarIntegracao = (id, ativo) => op(async () => {
    const r = await sb.from('integracoes_telegram').update({ ativo }).eq('id', id)
    if (r.error) throw r.error
  })
  const desconectarIntegracao = (id) => op(async () => {
    const r = await sb.from('integracoes_telegram').delete().eq('id', id)
    if (r.error) throw r.error
  })

  return {
    integracoesTelegram, gerarPareamento, pausarIntegracao, desconectarIntegracao,
    eventos, regras, aliases, inboxOk,
    confirmarEvento, vincularEvento, ignorarEvento, adicionarEventos, adicionarRegras,
    cartoes, compras, rendas, fixos, faturas, categorias, fixosPagamentos, comprasPagamentos, comprasPagamentosOk, saldoAjustes, pessoas, orcamentos, orcamentosOk, config, configOk,
    loading, syncState, error, loadAll,
    addCartao, updateCartao, delCartao,
    addCompra, updateCompra, updateComprasLote, delCompra,
    upsertRenda,
    addFixo, updateFixo, delFixo,
    upsertFatura, delFatura,
    marcarFixoPago, marcarParcelaPaga,
    definirAjusteSaldo,
    definirOrcamento, definirOrcamentos, definirConfig,
    addCategoria, delCategoria, renomearCategoria,
    addSubcategoria, delSubcategoria, renomearSubcategoria,
    migrarCategoria, migrarSubcategoria,
    addPessoa, delPessoa, mudarCorPessoa, renomearPessoa,
    importarTransacoes,
  }
}
