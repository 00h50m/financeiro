import { useState } from 'react'
import RendaSazonal from './RendaSazonal'
import { fmt, fmtK, mesLabel, nowYM, addMonths, RENDA_CAMPOS, totalRenda } from '../lib/utils'

// Rótulo curto de cada fonte de renda: 'Salário Giovanna' → 'Giovanna' (antes os dois salários viravam 'Salário' repetido).
const curto = (l) => l.replace(/^Salário /, '')

export default function Renda({ store, irPara }) {
  const { rendas, upsertRenda } = store
  const mes = nowYM()
  const [editMes, setEditMes] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [inicio, setInicio] = useState(-3) // primeiro mês da lista, em meses a partir de hoje
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
    const ok = await upsertRenda({
      ...form,
      giovanna: Number(form.giovanna || 0),
      sabrina: Number(form.sabrina || 0),
      extra_sabrina: Number(form.extra_sabrina || 0),
      mesada: Number(form.mesada || 0),
      outros: Number(form.outros || 0),
    })
    setSaving(false)
    if (ok) setEditMes(null) // se deu erro, mantém o formulário
  }

  const meses = Array.from({ length: 8 }, (_, i) => addMonths(mes, inicio + i))
  const rendaAtual = rendas.find((r) => r.mes === mes) || null
  const totalAtual = totalRenda(rendaAtual)
  const ultimos3 = [-1, -2, -3].map((i) => totalRenda(rendas.find((r) => r.mes === addMonths(mes, i)))).filter((v) => v > 0)
  const media3 = ultimos3.length ? ultimos3.reduce((a, b) => a + b, 0) / ultimos3.length : 0
  const semRenda = Array.from({ length: 6 }, (_, i) => addMonths(mes, i + 1)).filter((m) => !(totalRenda(rendas.find((r) => r.mes === m)) > 0))

  // Repete a renda do mês atual nos próximos meses que ainda estão sem renda (só preenche o que está vazio).
  async function repetir() {
    if (!rendaAtual || !semRenda.length) return
    if (!confirm(`Copiar a renda de ${mesLabel(mes)} (${fmt(totalAtual)}) para ${semRenda.length === 1 ? 'o mês' : `os ${semRenda.length} meses`} sem renda: ${semRenda.map(mesLabel).join(', ')}?\n\nMeses que já têm renda não são alterados.`)) return
    for (const m of semRenda) {
      const ok = await upsertRenda({ mes: m, giovanna: Number(rendaAtual.giovanna || 0), sabrina: Number(rendaAtual.sabrina || 0), extra_sabrina: Number(rendaAtual.extra_sabrina || 0), mesada: Number(rendaAtual.mesada || 0), outros: Number(rendaAtual.outros || 0) })
      if (!ok) break
    }
  }

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

      <section className={`ini-hero renda-hero ${totalAtual > 0 ? '' : 'neg'}`} aria-label="Renda do mês">
        <div className="ini-hero-rotulo">Renda de {mesLabel(mes)}</div>
        <div className="ini-hero-valor mono">{totalAtual > 0 ? fmt(totalAtual) : 'Não cadastrada'}</div>
        <div className="ini-hero-sub">
          {totalAtual > 0
            ? (RENDA_CAMPOS.filter(([k]) => rendaAtual?.[k] && Number(rendaAtual[k]) > 0).map(([k, l]) => `${curto(l)} ${fmtK(rendaAtual[k])}`).join(' · '))
            : 'Sem renda cadastrada, o app não consegue calcular quanto você pode gastar.'}
        </div>
        <div className="renda-acoes">
          <button className="btn btn-primary" onClick={() => abrir(mes)}>{totalAtual > 0 ? 'Editar renda do mês' : 'Cadastrar renda do mês'}</button>
          {totalAtual > 0 && semRenda.length > 0 && <button className="btn btn-ghost" onClick={repetir} title="Copia esta renda para os próximos meses que estão sem renda">Repetir nos próximos {semRenda.length} {semRenda.length === 1 ? 'mês' : 'meses'}</button>}
        </div>
        {media3 > 0 && <div className="ini-hero-sub" style={{ marginTop: 10 }}>Média dos últimos meses cadastrados: <b>{fmtK(media3)}</b></div>}
      </section>

      <div className="grupos-barra">
        <button className="link-btn" onClick={() => setInicio((i) => i - 6)}>← meses anteriores</button>
        {inicio !== -3 && <button className="link-btn" onClick={() => setInicio(-3)}>voltar para hoje</button>}
        <button className="link-btn" onClick={() => setInicio((i) => i + 6)}>próximos meses →</button>
      </div>
      <div className="card">
        <table className="tabela-compacta">
          <thead>
            <tr>
              <th>Mês</th>
              {RENDA_CAMPOS.map(([k, l]) => (
                <th key={k} className="col-opc" style={{ textAlign: 'right' }}>{curto(l)}</th>
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
                    <div className="so-mobile">{RENDA_CAMPOS.filter(([k]) => r?.[k] && Number(r[k]) > 0).map(([k, l]) => `${curto(l)} ${fmt(r[k])}`).join(' · ') || 'sem renda cadastrada'}</div>
                  </td>
                  {RENDA_CAMPOS.map(([k]) => (
                    <td key={k} className="col-opc" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: r?.[k] && Number(r[k]) > 0 ? 'var(--text)' : 'var(--text3)' }}>
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

      <RendaSazonal store={{ ...store, irPara }} />
    </div>
  )
}
