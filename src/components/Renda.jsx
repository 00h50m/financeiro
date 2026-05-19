import { useState } from 'react'
import { fmt, mesLabel, nowYM, addMonths, RENDA_CAMPOS, totalRenda } from '../lib/utils'

export default function Renda({ store }) {
  const { rendas, upsertRenda } = store
  const mes = nowYM()
  const [editMes, setEditMes] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function abrir(m) {
    const r = rendas.find((x) => x.mes === m) || {}
    setForm({
      mes: m,
      giovanna: r.giovanna || '',
      sabrina: r.sabrina || '',
      extra_sabrina: r.extra_sabrina || '',
      mesada: r.mesada || '',
      outros: r.outros || '',
    })
    setEditMes(m)
  }

  async function salvar() {
    setSaving(true)
    await upsertRenda({
      ...form,
      giovanna: Number(form.giovanna || 0),
      sabrina: Number(form.sabrina || 0),
      extra_sabrina: Number(form.extra_sabrina || 0),
      mesada: Number(form.mesada || 0),
      outros: Number(form.outros || 0),
    })
    setSaving(false)
    setEditMes(null)
  }

  const meses = Array.from({ length: 8 }, (_, i) => addMonths(mes, -3 + i))

  return (
    <div className="page">
      {editMes && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setEditMes(null) }}>
          <div className="modal">
            <div className="modal-title">Renda de {mesLabel(editMes)}</div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Salário Giovanna</label>
                <input type="number" step="0.01" value={form.giovanna} onChange={s('giovanna')} placeholder="0,00" autoFocus />
              </div>
              <div className="form-group">
                <label>Salário Sabrina</label>
                <input type="number" step="0.01" value={form.sabrina} onChange={s('sabrina')} placeholder="0,00" />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Extra Sabrina</label>
                <input type="number" step="0.01" value={form.extra_sabrina} onChange={s('extra_sabrina')} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Mesada</label>
                <input type="number" step="0.01" value={form.mesada} onChange={s('mesada')} placeholder="0,00" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Outros (extras, reembolsos, presentes...)</label>
                <input type="number" step="0.01" value={form.outros} onChange={s('outros')} placeholder="0,00" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditMes(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              {RENDA_CAMPOS.map(([k, l]) => (
                <th key={k} style={{ textAlign: 'right' }}>{l.split(' ')[0]}</th>
              ))}
              <th style={{ textAlign: 'right' }}>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {meses.map((m) => {
              const r = rendas.find((x) => x.mes === m) || null
              const tot = totalRenda(r)
              return (
                <tr key={m} style={m === mes ? { background: 'rgba(34,197,94,0.04)' } : {}}>
                  <td>
                    {mesLabel(m)}
                    {m === mes && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>atual</span>}
                  </td>
                  {RENDA_CAMPOS.map(([k]) => (
                    <td key={k} style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: r?.[k] && Number(r[k]) > 0 ? 'var(--text)' : 'var(--text3)' }}>
                      {r?.[k] && Number(r[k]) > 0 ? fmt(r[k]) : '—'}
                    </td>
                  ))}
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, fontWeight: 500, color: tot > 0 ? 'var(--green)' : 'var(--text3)' }}>
                    {tot > 0 ? fmt(tot) : '—'}
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(m)}>Editar</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
