import { useState } from 'react'
import { corPessoa, fmt, fmtK, limiteUsado, nowYM } from '../lib/utils'

export default function Cartoes({ store }) {
  const { cartoes, pessoas, compras, faturas, addCartao, updateCartao, delCartao } = store
  const mes = nowYM()
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ nome: '', titular: pessoas[0]?.nome || '', fechamento: '', vencimento: '', limite: '' })
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  function abrir(cartao) {
    if (cartao) {
      setForm({ nome: cartao.nome, titular: cartao.titular, fechamento: cartao.fechamento || '', vencimento: cartao.vencimento || '', limite: cartao.limite ?? '' })
      setEditId(cartao.id)
    } else {
      setForm({ nome: '', titular: pessoas[0]?.nome || '', fechamento: '', vencimento: '', limite: '' })
      setEditId(null)
    }
    setModal(true)
  }

  async function salvar() {
    if (!form.nome) return
    setSaving(true)
    const dados = { nome: form.nome, titular: form.titular, fechamento: Number(form.fechamento) || 1, vencimento: Number(form.vencimento) || 10 }
    // `limite` só entra no payload quando preenchido (ou para limpar um limite que já existia).
    const anterior = cartoes.find((c) => c.id === editId)
    if (form.limite !== '' && Number(form.limite) >= 0) dados.limite = Number(form.limite)
    else if (anterior?.limite != null) dados.limite = null
    const ok = editId ? await updateCartao(editId, dados) : await addCartao({ ...dados, ativo: true })
    setSaving(false)
    if (ok) setModal(false) // se deu erro, o formulário continua preenchido
  }

  // O banco apaga as faturas do cartão junto com ele e deixa as compras sem cartão: avisa os números reais.
  function remover(c) {
    const nCompras = compras.filter((x) => x.cartao_id === c.id).length
    const nFaturas = faturas.filter((x) => x.cartao_id === c.id).length
    const aviso = nCompras || nFaturas
      ? `\n\n${nCompras} compra${nCompras === 1 ? '' : 's'} ficará${nCompras === 1 ? '' : 'ão'} sem cartão (e passam a contar como "a pagar" uma a uma) e ${nFaturas} fatura${nFaturas === 1 ? '' : 's'} lançada${nFaturas === 1 ? '' : 's'} (valor real e se estava paga) ${nFaturas === 1 ? 'será apagada' : 'serão apagadas'}. Isso não dá para desfazer.`
      : ''
    if (confirm(`Remover "${c.nome}"?${aviso}`)) delCartao(c.id)
  }

  function renderLimite(c) {
    const limite = Number(c.limite) || 0
    if (!limite) return <span style={{ fontSize: 12, color: 'var(--text3)' }}>não informado</span>
    const { atual, futuro, usado } = limiteUsado(c.id, compras, cartoes, faturas, mes)
    const pct = Math.round((usado / limite) * 100)
    const cor = pct > 90 ? 'var(--red)' : pct > 70 ? 'var(--amber)' : 'var(--green)'
    return (
      <div title={`Fatura atual e pendentes: ${fmt(atual)} · Parcelas futuras: ${fmt(futuro)}`}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12 }}>
          <span style={{ fontFamily: 'DM Mono' }}>{fmtK(usado)} <span style={{ color: 'var(--text3)' }}>de {fmtK(limite)}</span></span>
          <span style={{ color: cor }}>{pct}%</span>
        </div>
        <div className="prog-bar"><div className="prog-fill" style={{ width: Math.min(100, pct) + '%', background: cor }} /></div>
        <div style={{ fontSize: 11, color: usado > limite ? 'var(--red)' : 'var(--text3)', marginTop: 3 }}>
          {usado > limite ? `acima do limite em ${fmtK(usado - limite)}` : `${fmtK(limite - usado)} disponível`}
        </div>
      </div>
    )
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
                  {pessoas.map((p) => <option key={p.id}>{p.nome}</option>)}
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
            <div className="form-row" style={{ marginTop: 0 }}>
              <div className="form-group">
                <label>Limite do cartão (R$) — opcional</label>
                <input type="number" min="0" step="100" placeholder="Ex: 5000" value={form.limite} onChange={s('limite')} />
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
                <th style={{ minWidth: 220 }}>Limite</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {cartoes.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.nome}</td>
                  <td>
                    <span className={`badge badge-${corPessoa(pessoas, c.titular)}`}>
                      {c.titular}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center', fontFamily: 'DM Mono' }}>{c.fechamento ? `dia ${c.fechamento}` : '—'}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'DM Mono' }}>{c.vencimento ? `dia ${c.vencimento}` : '—'}</td>
                  <td>{renderLimite(c)}</td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrir(c)}>Editar</button>
                    <button
                      className="btn btn-danger"
                      onClick={() => remover(c)}
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
