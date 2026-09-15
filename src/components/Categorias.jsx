import { useState } from 'react'

export default function Categorias({ store }) {
  const { categorias, addCategoria, delCategoria, renomearCategoria, addSubcategoria, delSubcategoria, renomearSubcategoria } = store
  const [novoNome, setNovoNome] = useState('')
  const [novaSub, setNovaSub] = useState({})
  const [saving, setSaving] = useState(false)

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
    if (confirm(`Remover a categoria "${cat.nome}"?\n\nCompras já lançadas com essa categoria não são alteradas — ela só deixa de aparecer como opção ao lançar novas compras.`)) {
      delCategoria(cat.id)
    }
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
    if (confirm(`Remover a subcategoria "${sub}"?`)) {
      delSubcategoria(cat.id, cat.subcategorias.filter((s) => s !== sub))
    }
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

  return (
    <div className="page">
      <div className="alert alert-blue">
        Categorias e subcategorias usadas ao lançar compras e ao importar faturas. Renomear atualiza
        automaticamente as compras já lançadas com o nome antigo; remover uma categoria ou subcategoria só
        tira ela das opções — compras antigas mantêm o texto que já tinham.
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
