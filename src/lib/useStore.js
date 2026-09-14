import { useState, useEffect } from 'react'
import { sb } from './supabase'

export function useStore() {
  const [cartoes, setCartoes] = useState([])
  const [compras, setCompras] = useState([])
  const [rendas, setRendas] = useState([])
  const [fixos, setFixos] = useState([])
  const [faturas, setFaturas] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('ok')
  const [error, setError] = useState(null)

  async function loadAll() {
    setLoading(true)
    setError(null)
    try {
      const [c, co, r, fx, fa] = await Promise.all([
        sb.from('cartoes').select('*').order('created_at'),
        sb.from('compras').select('*').order('data_compra', { ascending: false }),
        sb.from('rendas').select('*').order('mes', { ascending: false }),
        sb.from('fixos').select('*').order('created_at'),
        sb.from('faturas').select('*').order('mes', { ascending: false }),
      ])
      if (c.error) throw c.error
      if (co.error) throw co.error
      if (r.error) throw r.error
      if (fx.error) throw fx.error
      if (fa.error) throw fa.error
      setCartoes(c.data || [])
      setCompras(co.data || [])
      setRendas(r.data || [])
      setFixos(fx.data || [])
      setFaturas(fa.data || [])
    } catch (e) {
      setError(e.message || 'Erro ao conectar com o banco')
    }
    setLoading(false)
  }

  useEffect(() => { loadAll() }, [])

  async function op(fn) {
    setSyncState('syncing')
    try {
      await fn()
      await loadAll()
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
  const delCartao = (id) => op(async () => {
    const r = await sb.from('cartoes').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // COMPRAS
  const addCompra = (data) => op(async () => {
    const r = await sb.from('compras').insert(data)
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

  // IMPORTAÇÃO DE FATURA (CSV)
  // Não usa `op`: o chamador precisa do erro para dar feedback próprio na tela de importação.
  async function importarTransacoes(rows) {
    setSyncState('syncing')
    try {
      const r = await sb.from('compras').insert(rows)
      if (r.error) throw r.error
      await loadAll()
      setSyncState('ok')
    } catch (e) {
      setSyncState('error')
      throw e
    }
  }

  return {
    cartoes, compras, rendas, fixos, faturas,
    loading, syncState, error, loadAll,
    addCartao, delCartao,
    addCompra, delCompra,
    upsertRenda,
    addFixo, updateFixo, delFixo,
    upsertFatura, delFatura,
    importarTransacoes,
  }
}
