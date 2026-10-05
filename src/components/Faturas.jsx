import { useState } from 'react'
import { fmt, mesLabel, nowYM } from '../lib/utils'
import { lancadoDoCartao } from '../lib/financeiro'

const CHAVE_REVISADAS = 'faturas_revisadas'
const lerRevisadas = () => {
  try { return JSON.parse(localStorage.getItem(CHAVE_REVISADAS) || '[]') } catch { return [] }
}

export default function Faturas({ store }) {
  const { faturas, cartoes, compras, upsertFatura, delFatura } = store
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState({ cartao_id: '', mes: nowYM(), valor_real: '' })
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const [revisadas, setRevisadas] = useState(lerRevisadas)
  const getLancado = (cartao_id, mes) => lancadoDoCartao(compras, cartoes, cartao_id, mes)
  const temReal = (f) => f.valor_real != null && f.valor_real !== ''

  // Faturas pagas cujo valor real é igual ao lançado: podem ter sido a estimativa gravada pelo app ao marcar
  // como paga (comportamento antigo). Só você sabe; nada é alterado sozinho.
  const suspeitas = faturas.filter((f) => f.pago && temReal(f) && !revisadas.includes(f.id)
    && Math.abs(Number(f.valor_real) - getLancado(f.cartao_id, f.mes)) < 0.01)

  function confirmarReal(id) {
    const novas = [...revisadas, id]
    setRevisadas(novas)
    try { localStorage.setItem(CHAVE_REVISADAS, JSON.stringify(novas)) } catch { /* segue sem lembrar */ }
  }
  async function eraEstimativa(f) {
    await upsertFatura({ cartao_id: f.cartao_id, mes: f.mes, valor_real: null })
  }

  async function salvar() {
    if (!form.cartao_id || !form.mes || !form.valor_real) return
    setSaving(true)
    const ok = await upsertFatura({ cartao_id: form.cartao_id, mes: form.mes, valor_real: Number(form.valor_real) })
    setSaving(false)
    if (ok) setModal(false) // se deu erro, mantém o formulário
  }

  const mesList = [...new Set(faturas.map((f) => f.mes))].sort().reverse()

  return (
    <div className="page">
      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setModal(false) }}>
          <div className="modal">
            <div className="modal-title">Lançar fatura</div>
            <div className="alert alert-blue" style={{ marginBottom: 16 }}>
              Informe o valor total que aparece no app do banco. O sistema compara com seus lançamentos e mostra a diferença.
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Cartão</label>
                <select value={form.cartao_id} onChange={s('cartao_id')}>
                  <option value="">Selecione...</option>
                  {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Mês de referência</label>
                <input type="month" value={form.mes} onChange={s('mes')} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Valor real da fatura (R$)</label>
                <input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor_real} onChange={s('valor_real')} autoFocus />
              </div>
            </div>
            {form.cartao_id && form.mes && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -8, marginBottom: 8 }}>
                Lançado neste mês: {fmt(getLancado(form.cartao_id, form.mes))}
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={!form.cartao_id || !form.valor_real || saving}>
                {saving ? 'Salvando...' : 'Salvar fatura'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => { setForm({ cartao_id: '', mes: nowYM(), valor_real: '' }); setModal(true) }}>
          + Lançar fatura
        </button>
      </div>

      {suspeitas.length > 0 && (
        <div className="alert alert-amber" style={{ marginBottom: 16 }}>
          <strong>{suspeitas.length === 1 ? '1 fatura paga para você conferir' : `${suspeitas.length} faturas pagas para você conferir`}.</strong>{' '}
          O valor real delas é exatamente igual ao lançado. Se você digitou o valor do banco, toque em "Está certo". Se foi o app que
          gravou a estimativa ao marcar como paga, toque em "Era estimativa": o valor real é apagado e a fatura continua paga.
          {suspeitas.map((f) => (
            <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
              <span style={{ flex: '1 1 160px' }}>{cartoes.find((c) => c.id === f.cartao_id)?.nome || '—'} · {mesLabel(f.mes)} · {fmt(f.valor_real)}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => confirmarReal(f.id)}>Está certo</button>
              <button className="btn btn-ghost btn-sm" onClick={() => eraEstimativa(f)}>Era estimativa</button>
            </div>
          ))}
        </div>
      )}

      {mesList.length === 0 && (
        <div className="empty">
          Nenhuma fatura lançada ainda.{'\n'}Lance o valor real do banco e o sistema mostra o que está faltando categorizar.
        </div>
      )}

      {mesList.map((mes) => {
        const fatsDoMes = faturas.filter((f) => f.mes === mes)
        const comReal = fatsDoMes.filter(temReal)
        const totalReal = comReal.reduce((s, f) => s + Number(f.valor_real), 0)
        const totalLanc = comReal.reduce((s, f) => s + getLancado(f.cartao_id, mes), 0)
        const totalDiff = totalReal - totalLanc

        return (
          <div key={mes}>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{mesLabel(mes)}</span>
              <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: Math.abs(totalDiff) < 1 ? 'var(--green)' : totalDiff > 0 ? 'var(--red)' : 'var(--amber)' }}>
                {Math.abs(totalDiff) < 1 ? '✓ tudo identificado' : totalDiff > 0 ? `⚠ ${fmt(totalDiff)} não identificado` : `excede ${fmt(Math.abs(totalDiff))}`}
              </span>
            </div>
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Cartão</th>
                    <th style={{ textAlign: 'right' }}>Fatura real</th>
                    <th style={{ textAlign: 'right' }}>Lançado</th>
                    <th style={{ textAlign: 'right' }}>Diferença</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {fatsDoMes.map((fat) => {
                    const cartao = cartoes.find((c) => c.id === fat.cartao_id)
                    const lanc = getLancado(fat.cartao_id, mes)
                    if (!temReal(fat)) {
                      // Linha criada só para marcar como paga: ainda não há valor do banco para comparar.
                      return (
                        <tr key={fat.id}>
                          <td style={{ fontWeight: 500 }}>{cartao?.nome || '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text3)' }}>—</td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lanc)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text3)' }}>—</td>
                          <td>
                            <span className="badge badge-gray">sem valor do banco</span>{' '}
                            <button className="btn btn-ghost btn-sm" onClick={() => { setForm({ cartao_id: fat.cartao_id, mes, valor_real: '' }); setModal(true) }}>Informar valor</button>
                          </td>
                          <td />
                        </tr>
                      )
                    }
                    const diff = fat.valor_real - lanc
                    const pct = fat.valor_real > 0 ? Math.round((lanc / fat.valor_real) * 100) : 0
                    return (
                      <tr key={fat.id}>
                        <td style={{ fontWeight: 500 }}>{cartao?.nome || '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(fat.valor_real)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lanc)}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: Math.abs(diff) < 0.02 ? 'var(--text3)' : diff > 0 ? 'var(--red)' : 'var(--green)' }}>
                          {Math.abs(diff) < 0.02 ? '—' : (diff > 0 ? '+' : '') + fmt(diff)}
                        </td>
                        <td>
                          {Math.abs(diff) < 1
                            ? <span className="badge badge-green">✓ OK</span>
                            : diff > 0
                              ? <span className="badge badge-red">{pct}% lançado</span>
                              : <span className="badge badge-amber">excede</span>}
                        </td>
                        <td>
                          <button className="btn btn-danger" onClick={() => { if (confirm('Remover o valor real desta fatura? Se ela estava marcada como paga, isso também some.')) delFatura(fat.id) }}>×</button>
                        </td>
                      </tr>
                    )
                  })}
                  {fatsDoMes.length > 1 && (
                    <tr style={{ borderTop: '2px solid var(--border2)' }}>
                      <td style={{ fontWeight: 500, color: 'var(--text2)' }}>Total</td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontWeight: 500 }}>{fmt(totalReal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontWeight: 500 }}>{fmt(totalLanc)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: Math.abs(totalDiff) < 0.02 ? 'var(--text3)' : totalDiff > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {Math.abs(totalDiff) < 0.02 ? '—' : (totalDiff > 0 ? '+' : '') + fmt(totalDiff)}
                      </td>
                      <td /><td />
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}
