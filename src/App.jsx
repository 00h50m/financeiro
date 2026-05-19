import { useState } from 'react'
import { useStore } from './lib/useStore'
import Dashboard from './components/Dashboard'
import Compras from './components/Compras'
import Parcelamentos from './components/Parcelamentos'
import Faturas from './components/Faturas'
import Renda from './components/Renda'
import Fixos from './components/Fixos'
import Cartoes from './components/Cartoes'

const ABAS = [
  { id: 'dashboard', label: 'Dashboard', Component: Dashboard },
  { id: 'compras', label: 'Compras', Component: Compras },
  { id: 'parcelamentos', label: 'Parcelamentos', Component: Parcelamentos },
  { id: 'faturas', label: 'Faturas', Component: Faturas },
  { id: 'renda', label: 'Renda', Component: Renda },
  { id: 'fixos', label: 'Fixos', Component: Fixos },
  { id: 'cartoes', label: 'Cartões', Component: Cartoes },
]

export default function App() {
  const [aba, setAba] = useState('dashboard')
  const store = useStore()

  if (store.loading) {
    return (
      <div className="loading">
        <div className="spinner" />
        <span>Conectando ao banco de dados...</span>
      </div>
    )
  }

  if (store.error) {
    return (
      <div style={{ padding: 32, color: 'var(--red)', fontSize: 14 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>Erro de conexão com o Supabase</div>
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>{store.error}</div>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={store.loadAll}>
          Tentar novamente
        </button>
      </div>
    )
  }

  const { Component } = ABAS.find((a) => a.id === aba)

  return (
    <div className="app">
      <nav className="nav">
        <span className="nav-logo">Gi & Sabi</span>
        {ABAS.map((a) => (
          <button
            key={a.id}
            className={`nav-btn ${aba === a.id ? 'active' : ''}`}
            onClick={() => setAba(a.id)}
          >
            {a.label}
          </button>
        ))}
        <div
          className={`sync-dot ${store.syncState === 'syncing' ? 'syncing' : store.syncState === 'error' ? 'error' : ''}`}
          title={store.syncState === 'ok' ? 'Sincronizado' : store.syncState === 'syncing' ? 'Salvando...' : 'Erro de sync'}
        />
      </nav>
      <Component store={store} />
    </div>
  )
}
