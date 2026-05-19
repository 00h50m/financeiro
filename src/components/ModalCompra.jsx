import { useState } from 'react'
import { CATEGORIAS, PESSOAS, fmt, calcMesInicio, mesLabel } from '../lib/utils'

export default function ModalCompra({ cartoes, onSave, onClose }) {
  const [f, setF] = useState({
    data_compra: new Date().toISOString().slice(0, 10),
    descricao: '',
    categoria: 'Alimentação',
    subcategoria: 'Mercado',
    pessoa: 'Giovanna',
    cartao_id: cartoes[0]?.id || '',
    valor_total: '',
    parcelas: '1',
    obs: '',
  })
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const subcats = CATEGORIAS[f.categoria] || ['Outros']
  const cartao = cartoes.find((c) => c.id === f.cartao_id)
  const mesInicio = f.data_compra && cartao ? calcMesInicio(f.data_compra, cartao) : ''
  const valorParc = f.valor_total && f.parcelas ? Number(f.valor_total) / Number(f.parcelas) : 0
  const ok = f.descricao && f.valor_total && f.cartao_id && !saving

  async function save() {
    if (!ok) return
    setSaving(true)
    await onSave({ ...f, valor_total: Number(f.valor_total), parcelas: Number(f.parcelas) })
    setSaving(false)
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal">
        <div className="modal-title">Nova compra</div>

        <div className="form-row cols2">
          <div className="form-group">
            <label>Data</label>
            <input type="date" value={f.data_compra} onChange={s('data_compra')} />
          </div>
          <div className="form-group">
            <label>Quem</label>
            <select value={f.pessoa} onChange={s('pessoa')}>
              {PESSOAS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label>Descrição</label>
            <input
              placeholder="Ex: Nike Air Max, iFood, Mercado..."
              value={f.descricao}
              onChange={s('descricao')}
              autoFocus
            />
          </div>
        </div>

        <div className="form-row cols2">
          <div className="form-group">
            <label>Categoria</label>
            <select
              value={f.categoria}
              onChange={(e) => {
                const cat = e.target.value
                setF((p) => ({ ...p, categoria: cat, subcategoria: CATEGORIAS[cat]?.[0] || 'Outros' }))
              }}
            >
              {Object.keys(CATEGORIAS).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Subcategoria</label>
            <select value={f.subcategoria} onChange={s('subcategoria')}>
              {subcats.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>

        <div className="form-row cols3">
          <div className="form-group">
            <label>Cartão</label>
            <select value={f.cartao_id} onChange={s('cartao_id')}>
              {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Valor total (R$)</label>
            <input type="number" step="0.01" min="0" placeholder="0,00" value={f.valor_total} onChange={s('valor_total')} />
          </div>
          <div className="form-group">
            <label>Parcelas</label>
            <input type="number" min="1" max="60" value={f.parcelas} onChange={s('parcelas')} />
          </div>
        </div>

        {mesInicio && valorParc > 0 && (
          <div className="alert alert-blue">
            {Number(f.parcelas) === 1
              ? `Lançado em ${mesLabel(mesInicio)} · à vista · ${fmt(valorParc)}`
              : `1ª parcela em ${mesLabel(mesInicio)} · ${fmt(valorParc)}/mês × ${f.parcelas}x = ${fmt(Number(f.valor_total))}`}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Observação (opcional)</label>
            <input placeholder="Detalhes extras..." value={f.obs} onChange={s('obs')} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save} disabled={!ok}>
            {saving ? 'Salvando...' : 'Salvar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}
