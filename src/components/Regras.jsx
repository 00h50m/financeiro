import { useState } from 'react'

const pct = (v) => Math.round((Number(v) || 0) * 100) + '%'

function Linha({ regra, store, apelido }) {
  const { categorias, atualizarRegra, esquecerRegra } = store
  const [editando, setEditando] = useState(false)
  const [cat, setCat] = useState(regra.categoria)
  const [sub, setSub] = useState(regra.subcategoria)
  const subs = categorias.find((c) => c.nome === cat)?.subcategorias || []

  async function salvar() {
    if (!cat || !sub) return
    if (await atualizarRegra(regra, { categoria: cat, subcategoria: sub })) setEditando(false)
  }

  return (
    <article className="regra-card">
      <div className="regra-topo">
        <div style={{ minWidth: 0 }}>
          <div className="regra-nome">{regra.estabelecimento_chave}</div>
          {apelido && <div className="cad-sub">apelido: {apelido}</div>}
        </div>
        <span className="regra-conf" title={`${regra.confirmacoes} certo · ${regra.rejeicoes} errado`}>{pct(regra.confianca)}</span>
      </div>
      {editando ? (
        <div className="regra-edit">
          <select value={cat} onChange={(e) => { setCat(e.target.value); setSub(categorias.find((c) => c.nome === e.target.value)?.subcategorias?.[0] || '') }}>
            {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          <select value={sub} onChange={(e) => setSub(e.target.value)}>
            {subs.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ) : (
        <div className="regra-cat">{regra.categoria} <span style={{ color: 'var(--text3)' }}>›</span> {regra.subcategoria}</div>
      )}
      <div className="regra-rodape">
        <span className="cad-sub">{regra.confirmacoes} certo · {regra.rejeicoes} errado</span>
        <span className="regra-acoes">
          {editando ? (
            <>
              <button className="btn btn-primary btn-sm" onClick={salvar}>Salvar</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditando(false)}>Cancelar</button>
            </>
          ) : (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditando(true)}>Corrigir</button>
              <button className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Esquecer o que o app aprendeu sobre "${regra.estabelecimento_chave}"? Compras antigas não mudam.`)) esquecerRegra(regra) }}>Esquecer</button>
            </>
          )}
        </span>
      </div>
    </article>
  )
}

export default function Regras({ store }) {
  const { regras, aliases, inboxOk } = store
  const [filtro, setFiltro] = useState('')

  if (!inboxOk) {
    return (
      <div className="page">
        <div className="alert alert-amber"><strong>O Inbox ainda não está ativo no banco.</strong> Rode os arquivos <code>inbox/01</code> a <code>inbox/12</code> no Supabase para as regras aprendidas existirem.</div>
      </div>
    )
  }

  const apelidoDe = (chave) => aliases.find((a) => a.chave === chave)?.alias
  const f = filtro.trim().toLowerCase()
  const lista = [...regras]
    .filter((r) => !f || `${r.estabelecimento_chave} ${r.categoria} ${r.subcategoria}`.toLowerCase().includes(f))
    .sort((a, b) => b.confirmacoes - a.confirmacoes || a.estabelecimento_chave.localeCompare(b.estabelecimento_chave))

  return (
    <div className="page">
      <details className="ajuda-rec">
        <summary>Como funciona</summary>
        <p>O app aprende a categoria de cada estabelecimento quando você confirma lançamentos. Aqui você corrige ou esquece o que foi aprendido. Mudanças valem <strong>daqui para frente</strong>: compras e lançamentos antigos não são alterados.</p>
      </details>
      <div className="cad-barra">
        <input type="search" placeholder="Buscar estabelecimento ou categoria" value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Buscar regra" />
        <span className="cad-sub">{lista.length} {lista.length === 1 ? 'regra' : 'regras'}</span>
      </div>
      {lista.length === 0 ? (
        <div className="card"><div className="empty">{filtro.trim() ? 'Nenhuma regra com esse termo.' : 'Nenhuma regra aprendida ainda.\nElas aparecem conforme você confirma lançamentos no Inbox.'}</div></div>
      ) : (
        <div className="regras-grade">{lista.map((r) => <Linha key={r.id} regra={r} store={store} apelido={apelidoDe(r.estabelecimento_chave)} />)}</div>
      )}
    </div>
  )
}
