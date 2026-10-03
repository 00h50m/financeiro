import { useState, useEffect } from 'react'
import { sb } from './supabase'

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
  const [configOk, setConfigOk] = useState(true)
  const [orcamentosOk, setOrcamentosOk] = useState(true) // false = tabela ainda não criada no banco
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('ok')
  const [error, setError] = useState(null)

  async function loadAll({ silent = false } = {}) {
    if (!silent) setLoading(true)
    setError(null)
    try {
      const [c, co, r, fx, fa, cat, fxp, sa, ps, orc, cfg] = await Promise.all([
        sb.from('cartoes').select('*').order('created_at'),
        sb.from('compras').select('*').order('data_compra', { ascending: false }),
        sb.from('rendas').select('*').order('mes', { ascending: false }),
        sb.from('fixos').select('*').order('created_at'),
        sb.from('faturas').select('*').order('mes', { ascending: false }),
        sb.from('categorias').select('*').order('nome'),
        sb.from('fixos_pagamentos').select('*'),
        sb.from('saldo_ajustes').select('*'),
        sb.from('pessoas').select('*').order('created_at'),
        sb.from('orcamentos').select('*'),
        sb.from('config').select('*'),
      ])
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
      // Orçamentos são opcionais: se a tabela ainda não existe, o resto do app continua funcionando.
      setOrcamentosOk(!orc.error)
      setOrcamentos(orc.error ? [] : orc.data || [])
      setConfigOk(!cfg.error)
      setConfig(cfg.error ? {} : Object.fromEntries((cfg.data || []).map((x) => [x.chave, x.valor])))
    } catch (e) {
      setError(e.message || 'Erro ao conectar com o banco')
    }
    if (!silent) setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function op(fn) {
    setSyncState('syncing')
    try {
      await fn()
      await loadAll({ silent: true })
      setSyncState('ok')
    } catch (e) {
      setSyncState('error')
      alert('Erro: ' + e.message)
    }
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
    if (r.error) throw r.error
  })
  const delFatura = (id) => op(async () => {
    const r = await sb.from('faturas').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // PAGAMENTOS DE FIXOS (por mês)
  const marcarFixoPago = (fixo_id, mes, pago) => op(async () => {
    const r = await sb.from('fixos_pagamentos').upsert(
      { fixo_id, mes, pago, data_pagamento: pago ? new Date().toISOString().slice(0, 10) : null },
      { onConflict: 'fixo_id,mes' }
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
  })
  // Usadas ao excluir uma categoria/subcategoria com movimentações: migra o
  // texto gravado em compras/fixos para o destino escolhido ANTES de remover
  // a opção antiga, para nunca deixar um registro órfão.
  const migrarCategoria = (categoriaAntiga, categoriaNova) => op(async () => {
    const rc = await sb.from('compras').update({ categoria: categoriaNova }).eq('categoria', categoriaAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ categoria: categoriaNova }).eq('categoria', categoriaAntiga)
    if (rf.error) throw rf.error
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
      await loadAll({ silent: true })
      setSyncState('ok')
    } catch (e) {
      setSyncState('error')
      throw e
    }
  }

  return {
    cartoes, compras, rendas, fixos, faturas, categorias, fixosPagamentos, saldoAjustes, pessoas, orcamentos, orcamentosOk, config, configOk,
    loading, syncState, error, loadAll,
    addCartao, updateCartao, delCartao,
    addCompra, updateCompra, delCompra,
    upsertRenda,
    addFixo, updateFixo, delFixo,
    upsertFatura, delFatura,
    marcarFixoPago,
    definirAjusteSaldo,
    definirOrcamento, definirOrcamentos, definirConfig,
    addCategoria, delCategoria, renomearCategoria,
    addSubcategoria, delSubcategoria, renomearSubcategoria,
    migrarCategoria, migrarSubcategoria,
    addPessoa, delPessoa, mudarCorPessoa, renomearPessoa,
    importarTransacoes,
  }
}
