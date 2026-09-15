import { useState } from 'react'
import { PESSOAS } from '../lib/utils'

export default function Cartoes({ store }) {
  const { cartoes, addCartao, updateCartao, delCartao } = store
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nome: '', titular: 'Giovanna', fechamento: '', vencimento: '' })
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function abrir(cartao) {
    if (cartao) {
      setForm({ nome: cartao.nome, titular: cartao.titular, fechamento: cartao.fechamento || '', vencimento: cartao.vencimento || '' })
      setEditId(cartao.id)
    } else {
      setForm({ nome: '', titular: 'Giovanna', fechamento: '', vencimento: '' })
      setEditId(null)
    }
    setModal(true)
  }

  async function salvar() {
    if (!form.nome) return
    setSaving(true)
    const dados = { nome: form.nome, titular: form.titular, fechamento: Number(form.fechamento) || 1, vencimento: Number(form.vencimento) || 10 }
    if (editId) await updateCartao(editId, dados)
    else await addCartao({ ...dados, ativo: true })
    setSaving(false)
    setModal(false)
  }

  return (
    <div className="page">
      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setModal(false) }}>
          <div className="modal">
            <div className="modal-title">{editId ? 'Editar cartão' : 'Novo cartão'}</div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Nome do cartão</label>
                <input placeholder="Ex: Nubank Giovanna" value={form.nome} onChange={s('nome')} autoFocus />
              </div>
              <div className="form-group">
                <label>Titular</label>
                <select value={form.titular} onChange={s('titular')}>
                  {PESSOAS.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Dia de fechamento</label>
                <input type="number" min="1" max="31" placeholder="Ex: 3" value={form.fechamento} onChange={s('fechamento')} />
              </div>
              <div className="form-group">
                <label>Dia de vencimento</label>
                <input type="number" min="1" max="31" placeholder="Ex: 10" value={form.vencimento} onChange={s('vencimento')} />
              </div>
            </div>
            {form.fechamento && (
              <div className="alert alert-blue" style={{ marginBottom: 0 }}>
                Compras até dia {form.fechamento} → fatura do mês atual. Após o dia {form.fechamento} → fatura do mês seguinte.
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={!form.nome || saving}>
                {saving ? 'Salvando...' : 'Salvar cartão'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-primary" onClick={() => abrir(null)}>+ Novo cartão</button>
      </div>

      <div className="card">
        {cartoes.length === 0 ? (
          <div className="empty">
            Nenhum cartão cadastrado.{'\n'}Comece adicionando seus cartões — eles são necessários para registrar compras.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>Titular</th>
                <th style={{ textAlign: 'center' }}>Fechamento</th>
                <th style={{ textAlign: 'center' }}>Vencimento</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cartoes.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.nome}</td>
                  <td>
                    <span className={`badge ${c.titular === 'Giovanna' ? 'badge-purple' : c.titular === 'Sabrina' ? 'badge-blue' : 'badge-gray'}`}>
                      {c.titular}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'DM Mono' }}>{c.fechamento ? `dia ${c.fechamento}` : '—'}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'DM Mono' }}>{c.vencimento ? `dia ${c.vencimento}` : '—'}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(c)}>Editar</button>
                    <button
                      className="btn btn-danger"
                      onClick={() => { if (confirm(`Remover "${c.nome}"? As compras vinculadas perdem o cartão.`)) delCartao(c.id) }}
                    >×</button>
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
