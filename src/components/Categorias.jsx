import { useState } from 'react'

export default function Categorias({ store }) {
  const {
    categorias, compras, fixos,
    addCategoria, delCategoria, renomearCategoria,
    addSubcategoria, delSubcategoria, renomearSubcategoria,
    migrarCategoria, migrarSubcategoria,
  } = store
  const [novoNome, setNovoNome] = useState('')
  const [novaSub, setNovaSub] = useState({})
  const [saving, setSaving] = useState(false)
  const [migracao, setMigracao] = useState(null)

  function contarUsoCategoria(nome) {
    return compras.filter((c) => c.categoria === nome).length + fixos.filter((f) => f.categoria === nome).length
  }
  function contarUsoSubcategoria(catNome, subNome) {
    return compras.filter((c) => c.categoria === catNome && c.subcategoria === subNome).length +
      fixos.filter((f) => f.categoria === catNome && f.subcategoria === subNome).length
  }

  async function criarCategoria() {
    const nome = novoNome.trim()
    if (!nome) return
    if (categorias.some((c) => c.nome.toLowerCase() === nome.toLowerCase())) {
      alert('Já existe uma categoria com esse nome.')
      return
    }
    setSaving(true)
    await addCategoria(nome)
    setSaving(false)
    setNovoNome('')
  }

  function renomear(cat) {
    const novo = window.prompt('Novo nome da categoria:', cat.nome)
    if (novo == null) return
    const nome = novo.trim()
    if (!nome || nome === cat.nome) return
    if (categorias.some((c) => c.id !== cat.id && c.nome.toLowerCase() === nome.toLowerCase())) {
      alert('Já existe uma categoria com esse nome.')
      return
    }
    renomearCategoria(cat.id, cat.nome, nome)
  }

  function remover(cat) {
    const n = contarUsoCategoria(cat.nome)
    if (n === 0) {
      if (confirm(`Remover a categoria "${cat.nome}"? Nenhuma compra ou conta fixa usa ela hoje.`)) delCategoria(cat.id)
      return
    }
    const outras = categorias.filter((c) => c.id !== cat.id)
    if (outras.length === 0) {
      alert('Essa é a única categoria cadastrada — crie outra antes de remover esta.')
      return
    }
    setMigracao({ tipo: 'categoria', cat, contagem: n, destino: outras[0].nome })
  }

  function adicionarSub(cat) {
    const sub = (novaSub[cat.id] || '').trim()
    if (!sub) return
    if (cat.subcategorias.some((s) => s.toLowerCase() === sub.toLowerCase())) {
      alert('Essa subcategoria já existe nessa categoria.')
      return
    }
    addSubcategoria(cat.id, [...cat.subcategorias, sub])
    setNovaSub((p) => ({ ...p, [cat.id]: '' }))
  }

  function removerSub(cat, sub) {
    const n = contarUsoSubcategoria(cat.nome, sub)
    const outras = cat.subcategorias.filter((s) => s !== sub)
    if (n === 0) {
      if (confirm(`Remover a subcategoria "${sub}"?`)) delSubcategoria(cat.id, outras)
      return
    }
    if (outras.length === 0) {
      alert(`"${sub}" é a única subcategoria de "${cat.nome}" e há ${n} movimentação(ões) usando ela. Crie outra subcategoria antes de remover esta.`)
      return
    }
    setMigracao({ tipo: 'subcategoria', cat, sub, contagem: n, destino: outras[0] })
  }

  function renomearSub(cat, sub) {
    const novo = window.prompt('Novo nome da subcategoria:', sub)
    if (novo == null) return
    const nome = novo.trim()
    if (!nome || nome === sub) return
    if (cat.subcategorias.some((s) => s !== sub && s.toLowerCase() === nome.toLowerCase())) {
      alert('Essa subcategoria já existe nessa categoria.')
      return
    }
    const subcategorias = cat.subcategorias.map((s) => (s === sub ? nome : s))
    renomearSubcategoria(cat.id, cat.nome, subcategorias, sub, nome)
  }

  async function confirmarMigracao() {
    if (!migracao) return
    if (migracao.tipo === 'categoria') {
      await migrarCategoria(migracao.cat.nome, migracao.destino)
      await delCategoria(migracao.cat.id)
    } else {
      const subcategorias = migracao.cat.subcategorias.filter((s) => s !== migracao.sub)
      await migrarSubcategoria(migracao.cat.nome, migracao.sub, migracao.destino)
      await delSubcategoria(migracao.cat.id, subcategorias)
    }
    setMigracao(null)
  }

  return (
    <div className="page">
      {migracao && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setMigracao(null) }}>
          <div className="modal">
            <div className="modal-title">
              {migracao.tipo === 'categoria' ? `Remover categoria "${migracao.cat.nome}"` : `Remover subcategoria "${migracao.sub}"`}
            </div>
            <div className="alert alert-amber">
              {migracao.contagem} {migracao.contagem === 1 ? 'movimentação usa' : 'movimentações usam'} essa
              {migracao.tipo === 'categoria' ? ' categoria' : ' subcategoria'} hoje. Escolha para onde elas vão —
              nenhuma fica sem classificação.
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Migrar movimentações para</label>
                <select
                  value={migracao.destino}
                  onChange={(e) => setMigracao((m) => ({ ...m, destino: e.target.value }))}
                >
                  {migracao.tipo === 'categoria'
                    ? categorias.filter((c) => c.id !== migracao.cat.id).map((c) => <option key={c.id}>{c.nome}</option>)
                    : migracao.cat.subcategorias.filter((s) => s !== migracao.sub).map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setMigracao(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{ padding: '8px 16px', fontSize: 13 }} onClick={confirmarMigracao}>
                Migrar e remover
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="alert alert-blue">
        Categorias e subcategorias usadas ao lançar compras, fixos e ao importar faturas. Renomear atualiza
        automaticamente os registros já lançados com o nome antigo. Remover uma categoria ou subcategoria que já
        tem movimentações pede para você escolher para onde elas vão antes — nenhum registro fica órfão.
      </div>

      <div className="toolbar">
        <input
          placeholder="Nova categoria..."
          value={novoNome}
          onChange={(e) => setNovoNome(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && criarCategoria()}
          style={{ maxWidth: 260 }}
        />
        <button className="btn btn-primary" onClick={criarCategoria} disabled={!novoNome.trim() || saving}>
          + Nova categoria
        </button>
      </div>

      {categorias.length === 0 ? (
        <div className="empty">
          Nenhuma categoria cadastrada.{'\n'}Crie a primeira categoria acima para poder lançar compras.
        </div>
      ) : (
        categorias.map((cat) => (
          <div key={cat.id} className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 500, fontSize: 14 }}>{cat.nome}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => renomear(cat)}>renomear</button>
              <button className="btn btn-danger" style={{ marginLeft: 'auto' }} onClick={() => remover(cat)}>×</button>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
              {cat.subcategorias.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>Nenhuma subcategoria ainda.</span>
              )}
              {cat.subcategorias.map((sub) => (
                <span key={sub} className="badge badge-gray" style={{ paddingRight: 6 }}>
                  <span style={{ cursor: 'pointer' }} onClick={() => renomearSub(cat, sub)} title="Clique para renomear">
                    {sub}
                  </span>
                  <button
                    onClick={() => removerSub(cat, sub)}
                    title="Remover subcategoria"
                    style={{ background: 'transparent', color: 'var(--text3)', padding: '0 0 0 6px', marginLeft: 2, fontSize: 13, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, maxWidth: 320 }}>
              <input
                placeholder="Nova subcategoria..."
                value={novaSub[cat.id] || ''}
                onChange={(e) => setNovaSub((p) => ({ ...p, [cat.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && adicionarSub(cat)}
              />
              <button className="btn btn-ghost btn-sm" onClick={() => adicionarSub(cat)}>+ Adicionar</button>
            </div>
          </div>
        ))
      )}
    </div>
  )
}
