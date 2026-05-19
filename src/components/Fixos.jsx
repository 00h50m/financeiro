import { useState } from 'react'
import { fmt, PESSOAS } from '../lib/utils'

export default function Fixos({ store }) {
  const { fixos, addFixo, updateFixo, delFixo } = store
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nome: '', valor: '', pessoa: 'Casa' })
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function abrir(fx) {
    if (fx) { setForm({ nome: fx.nome, valor: fx.valor, pessoa: fx.pessoa }); setEditId(fx.id) }
    else { setForm({ nome: '', valor: '', pessoa: 'Casa' }); setEditId(null) }
    setModal(true)
  }

  async function salvar() {
    if (!form.nome || !form.valor) return
    setSaving(true)
    if (editId) await updateFixo(editId, { nome: form.nome, valor: Number(form.valor), pessoa: form.pessoa })
    else await addFixo({ nome: form.nome, valor: Number(form.valor), pessoa: form.pessoa, ativo: true })
    setSaving(false)
    setModal(false)
  }

  const total = fixos.filter((f) => f.ativo).reduce((s, f) => s + Number(f.valor), 0)

  return (
    <div className="page">
      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setModal(false) }}>
          <div className="modal">
            <div className="modal-title">{editId ? 'Editar fixo' : 'Novo gasto fixo'}</div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Nome</label>
                <input placeholder="Ex: Condomínio" value={form.nome} onChange={s('nome')} autoFocus />
              </div>
              <div className="form-group">
                <label>Pessoa</label>
                <select value={form.pessoa} onChange={s('pessoa')}>
                  {PESSOAS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Valor padrão mensal (R$)</label>
                <input type="number" step="0.01" value={form.valor} onChange={s('valor')} placeholder="0,00" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => abrir(null)}>+ Novo fixo</button>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text2)' }}>
          Total: <span style={{ fontFamily: 'DM Mono', color: 'var(--amber)' }}>{fmt(total)}/mês</span>
        </span>
      </div>

      <div className="card">
        {fixos.length === 0 ? (
          <div className="empty">Nenhum gasto fixo cadastrado.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Pessoa</th>
                <th style={{ textAlign: 'right' }}>Valor/mês</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fixos.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontWeight: 500 }}>{f.nome}</td>
                  <td>
                    <span className={`badge ${f.pessoa === 'Giovanna' ? 'badge-purple' : f.pessoa === 'Sabrina' ? 'badge-blue' : 'badge-gray'}`}>
                      {f.pessoa}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(f.valor)}</td>
                  <td style={{ textAlign: 'center' }}>
                    <button
                      className={`badge ${f.ativo ? 'badge-green' : 'badge-gray'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => updateFixo(f.id, { ativo: !f.ativo })}
                    >
                      {f.ativo ? 'Ativo' : 'Pausado'}
                    </button>
                  </td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(f)}>Editar</button>
                    <button className="btn btn-danger" onClick={() => { if (confirm(`Remover "${f.nome}"?`)) delFixo(f.id) }}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
