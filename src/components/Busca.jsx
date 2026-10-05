import { useMemo, useState } from 'react'
import { fmt } from '../lib/utils'
import { buscar } from '../lib/busca'

export default function Busca({ store, irPara }) {
  const [termo, setTermo] = useState('')
  const r = useMemo(() => buscar(store, termo), [store, termo])

  return (
    <div className="page">
      <input autoFocus placeholder="Buscar compra, conta fixa, cartão, meta, Inbox ou valor (ex.: 89,90)" value={termo} onChange={(e) => setTermo(e.target.value)} style={{ width: '100%', marginBottom: 14 }} aria-label="Buscar em todo o app" />
      {termo.trim().length < 2 && <div style={{ fontSize: 13, color: 'var(--text3)' }}>Digite pelo menos 2 letras. Acento e maiúscula não importam.</div>}
      {termo.trim().length >= 2 && r.total === 0 && <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Nada encontrado para "{termo}".</div>}
      {r.grupos.map((g) => (
        <div key={g.id}>
          <div className="section-label">{g.titulo} · {g.total}{g.total > g.itens.length ? ` (mostrando ${g.itens.length})` : ''}</div>
          <div className="card" style={{ padding: '4px 14px' }}>
            {g.itens.map((i) => (
              <div key={i.chave} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.titulo}</div>
                  {i.sub && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{i.sub}</div>}
                </div>
                {i.valor != null && <span className="mono" style={{ fontSize: 13 }}>{fmt(i.valor)}</span>}
                <button className="btn btn-ghost btn-sm" onClick={() => irPara(g.aba)}>Abrir {g.titulo.toLowerCase()}</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
