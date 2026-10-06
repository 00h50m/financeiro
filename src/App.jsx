import { useState, useEffect } from 'react'
import { useStore } from './lib/useStore'
import { ativarAcessibilidadeModais } from './lib/acessibilidadeModais'
import Dashboard from './components/Dashboard'
import Inbox from './components/Inbox'
import Compras from './components/Compras'
import Parcelamentos from './components/Parcelamentos'
import Faturas from './components/Faturas'
import Pagamentos from './components/Pagamentos'
import ImportarFatura from './components/ImportarFatura'
import Renda from './components/Renda'
import Fixos from './components/Fixos'
import Simulador from './components/Simulador'
import Emprestimos from './components/Emprestimos'
import Cartoes from './components/Cartoes'
import Categorias from './components/Categorias'
import Pessoas from './components/Pessoas'
import Automacoes from './components/Automacoes'
import Backup from './components/Backup'
import Orcamento from './components/Orcamento'
import Divididos from './components/Divididos'
import Reserva from './components/Reserva'
import Regras from './components/Regras'
import Calendario from './components/Calendario'
import Busca from './components/Busca'
import Evolucao from './components/Evolucao'
import Metas from './components/Metas'
import Fechamento from './components/Fechamento'
import Login from './components/Login'
import { Marca, Nome } from './components/Marca'
import { sb } from './lib/supabase'

const ICONES = {
  dashboard: 'M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2 M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z',
  compras: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  parcelamentos: 'M12 2l10 5-10 5-10-5z M2 17l10 5 10-5 M2 12l10 5 10-5',
  faturas: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8',
  pagamentos: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4L12 14.01l-3-3',
  importar: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  renda: 'M23 6l-9.5 9.5-5-5L1 18 M17 6h6v6',
  fixos: 'M17 1l4 4-4 4 M3 11V9a4 4 0 0 1 4-4h14 M7 23l-4-4 4-4 M21 13v2a4 4 0 0 1-4 4H3',
  emprestimos: 'M3 10l9-6 9 6 M5 10v8 M9 10v8 M15 10v8 M19 10v8 M3 21h18 M12 14h.01',
  simulador: 'M4 2h16v20H4z M8 6h8 M8 10h.01 M12 10h.01 M16 10h.01 M8 14h.01 M12 14h.01 M16 14h.01 M8 18h8',
  cartoes: 'M1 4h22v16H1z M1 10h22',
  categorias: 'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z M7 7h.01',
  automacoes: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  pessoas: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  menu: 'M3 12h18 M3 6h18 M3 18h18',
  fechar: 'M18 6L6 18 M6 6l12 12',
  recolher: 'M15 18l-6-6 6-6',
  reserva: 'M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z M9 12l2 2 4-4',
  orcamento: 'M12 2a10 10 0 1 0 10 10H12z M14 2.5V10h7.5A10 10 0 0 0 14 2.5z',
  busca: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  calendario: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18 M8 14h.01 M12 14h.01 M16 14h.01 M8 18h.01 M12 18h.01',
  regras: 'M12 20h9 M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  evolucao: 'M3 3v18h18 M7 14l4-4 4 4 5-6',
  metas: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  fechamento: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18 M9 16l2 2 4-4',
  divididos: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M20 8v6 M23 11h-6',
  backup: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  sair: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
}

function Icone({ nome, size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONES[nome]} />
    </svg>
  )
}

const GRUPOS = [
  {
    titulo: 'Visão geral',
    abas: [
      { id: 'dashboard', label: 'Dashboard', Component: Dashboard },
      { id: 'busca', label: 'Buscar', Component: Busca },
      { id: 'calendario', label: 'Calendário', Component: Calendario },
    ],
  },
  {
    titulo: 'Dia a dia',
    abas: [
      { id: 'inbox', label: 'Inbox', Component: Inbox },
      { id: 'compras', label: 'Compras', Component: Compras },
      { id: 'parcelamentos', label: 'Parcelamentos', Component: Parcelamentos },
      { id: 'faturas', label: 'Faturas', Component: Faturas },
      { id: 'pagamentos', label: 'Pagamentos', Component: Pagamentos },
      { id: 'divididos', label: 'Divididos', Component: Divididos },
      { id: 'importar', label: 'Importar fatura', Component: ImportarFatura },
    ],
  },
  {
    titulo: 'Planejamento',
    abas: [
      { id: 'renda', label: 'Renda', Component: Renda },
      { id: 'fixos', label: 'Contas fixas', Component: Fixos },
      { id: 'orcamento', label: 'Orçamento', Component: Orcamento },
      { id: 'fechamento', label: 'Fechamento', Component: Fechamento },
      { id: 'evolucao', label: 'Evolução', Component: Evolucao },
      { id: 'metas', label: 'Metas', Component: Metas },
      { id: 'reserva', label: 'Reserva', Component: Reserva },
      { id: 'simulador', label: 'Simulador', Component: Simulador },
      { id: 'emprestimos', label: 'Empréstimos', Component: Emprestimos },
    ],
  },
  {
    titulo: 'Cadastros',
    abas: [
      { id: 'cartoes', label: 'Cartões', Component: Cartoes },
      { id: 'categorias', label: 'Categorias', Component: Categorias },
      { id: 'pessoas', label: 'Pessoas', Component: Pessoas },
      { id: 'regras', label: 'Regras aprendidas', Component: Regras },
      { id: 'automacoes', label: 'Automações', Component: Automacoes },
      { id: 'backup', label: 'Backup', Component: Backup },
    ],
  },
]

const ABAS = GRUPOS.flatMap((g) => g.abas)

function lerLocal(chave, padrao) {
  try { return localStorage.getItem(chave) ?? padrao } catch { return padrao }
}
function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, valor) } catch { /* sem armazenamento: segue sem lembrar */ }
}

// Controla a sessão: o useStore (e portanto qualquer leitura no banco) só roda depois do login.
export default function App() {
  const [sessao, setSessao] = useState(undefined) // undefined = verificando

  useEffect(() => ativarAcessibilidadeModais(), [])

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSessao(data.session)).catch(() => setSessao(null)) // erro ao ler a sessão: cai no login em vez de girar para sempre
    const { data } = sb.auth.onAuthStateChange((_evento, s) => setSessao(s))
    return () => data.subscription.unsubscribe()
  }, [])

  if (sessao === undefined) {
    return (
      <div className="loading">
        <div className="spinner" />
      </div>
    )
  }
  if (!sessao) return <Login />
  return <AppLogado email={sessao.user.email} />
}

function AppLogado({ email }) {
  const [aba, setAba] = useState(() => {
    const salva = lerLocal('aba', 'dashboard')
    return ABAS.some((a) => a.id === salva) ? salva : 'dashboard'
  })
  const [recolhida, setRecolhida] = useState(() => lerLocal('sidebar_recolhida', '0') === '1')
  const [menuAberto, setMenuAberto] = useState(false)
  const store = useStore(email)

  useEffect(() => { gravarLocal('aba', aba) }, [aba])
  useEffect(() => { gravarLocal('sidebar_recolhida', recolhida ? '1' : '0') }, [recolhida])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setMenuAberto(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function irPara(id) {
    setAba(id)
    setMenuAberto(false)
    window.scrollTo({ top: 0 })
  }

  if (store.loading) {
    return (
      <div className="loading" role="status" aria-live="polite">
        <div className="skeleton-tela">
          <div className="skeleton" style={{ height: 22, width: '40%' }} />
          <div className="skeleton-grade">
            <div className="skeleton" style={{ height: 70 }} /><div className="skeleton" style={{ height: 70 }} />
            <div className="skeleton" style={{ height: 70 }} /><div className="skeleton" style={{ height: 70 }} />
          </div>
          <div className="skeleton" style={{ height: 160 }} />
          <span style={{ fontSize: 12 }}>Conectando ao banco de dados...</span>
        </div>
      </div>
    )
  }

  if (store.error) {
    return (
      <div style={{ padding: 32, color: 'var(--red)', fontSize: 14 }}>
        <div style={{ fontWeight: 500, marginBottom: 8 }}>Não consegui carregar seus dados</div>
        <div style={{ color: 'var(--text2)', fontSize: 13, whiteSpace: 'pre-line' }}>{store.error}</div>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => store.loadAll()}>
          Tentar novamente
        </button>
        {/* Sessão expirada ou usuário removido: sem isto só dava para repetir o mesmo erro. */}
        <button className="btn btn-ghost" style={{ marginTop: 16, marginLeft: 8 }} onClick={() => sb.auth.signOut()}>
          Sair
        </button>
      </div>
    )
  }

  const pendentesInbox = store.eventos.filter((e) => e.status === 'pendente' || e.status === 'aguardando_dados').length
  const atual = ABAS.find((a) => a.id === aba)
  const { Component } = atual
  const sync = store.syncState === 'syncing' ? 'syncing' : store.syncState === 'error' ? 'error' : ''
  const syncTexto = store.syncState === 'ok' ? 'Sincronizado' : store.syncState === 'syncing' ? 'Salvando...' : 'Erro ao sincronizar'

  return (
    <div className={`app ${recolhida ? 'sidebar-recolhida' : ''}`}>
      {menuAberto && <div className="sidebar-backdrop" onClick={() => setMenuAberto(false)} />}

      <aside className={`sidebar ${menuAberto ? 'aberta' : ''}`} aria-label="Navegação principal">
        <div className="sidebar-topo">
          <span className="sidebar-logo"><Marca size={28} /><Nome /></span>
          <button className="icon-btn sidebar-fechar" onClick={() => setMenuAberto(false)} aria-label="Fechar menu">
            <Icone nome="fechar" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="sidebar-grupo">
              <div className="sidebar-grupo-titulo">{g.titulo}</div>
              {g.abas.map((a) => (
                <button
                  key={a.id}
                  className={`sidebar-item ${aba === a.id ? 'ativo' : ''}`}
                  onClick={() => irPara(a.id)}
                  title={a.label}
                  aria-current={aba === a.id ? 'page' : undefined}
                >
                  <Icone nome={a.id} />
                  <span className="sidebar-item-label">{a.label}</span>
                  {a.id === 'inbox' && pendentesInbox > 0 && (
                    <span className="sidebar-badge" aria-label={`${pendentesInbox} pendentes`}>{pendentesInbox}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-rodape">
        <button className="sidebar-recolher sidebar-sair" onClick={() => sb.auth.signOut()} title={`Sair (${email})`}>
          <Icone nome="sair" />
          <span className="sidebar-item-label">Sair <span className="sidebar-email">{email}</span></span>
        </button>
        <button
          className="sidebar-recolher"
          onClick={() => setRecolhida((r) => !r)}
          title={recolhida ? 'Expandir menu' : 'Recolher menu'}
        >
          <span style={{ display: 'inline-flex', transform: recolhida ? 'rotate(180deg)' : 'none' }}>
            <Icone nome="recolher" />
          </span>
          <span className="sidebar-item-label">Recolher menu</span>
        </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn topbar-menu" onClick={() => setMenuAberto(true)} aria-label="Abrir menu">
            <Icone nome="menu" size={20} />
          </button>
          <h1 className="topbar-titulo">{atual.label}</h1>
          <div className="topbar-sync" title={syncTexto}>
            <span className="topbar-sync-texto">{syncTexto}</span>
            <div className={`sync-dot ${sync}`} />
          </div>
        </header>
        <Component store={store} irPara={irPara} />
      </div>

      <nav className="bottom-nav" aria-label="Atalhos">
        {[['dashboard', 'Início'], ['inbox', 'Inbox'], ['compras', 'Compras'], ['pagamentos', 'Pagar']].map(([id, rotulo]) => (
          <button key={id} className={aba === id ? 'ativo' : ''} onClick={() => irPara(id)} aria-current={aba === id ? 'page' : undefined}>
            <Icone nome={id} size={20} />
            <span>{rotulo}</span>
            {id === 'inbox' && pendentesInbox > 0 && <span className="bottom-nav-badge" aria-label={`${pendentesInbox} pendentes`}>{pendentesInbox}</span>}
          </button>
        ))}
        <button onClick={() => setMenuAberto(true)} aria-label="Abrir menu completo">
          <Icone nome="menu" size={20} />
          <span>Menu</span>
        </button>
      </nav>
    </div>
  )
}
