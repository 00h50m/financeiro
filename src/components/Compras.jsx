import { useState, useMemo } from 'react'
import { fmt, PESSOAS } from '../lib/utils'
import ModalCompra from './ModalCompra'

export default function Compras({ store }) {
  const { compras, cartoes, addCompra, delCompra } = store
  const [modal, setModal] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [filtroPessoa, setFiltroPessoa] = useState('')

  const lista = useMemo(() =>
    compras.filter((c) =>
      (!filtro || (c.descricao + c.categoria + c.subcategoria).toLowerCase().includes(filtro.toLowerCase())) &&
      (!filtroPessoa || c.pessoa === filtroPessoa)
    ), [compras, filtro, filtroPessoa])

  return (
    <div className="page">
      {modal && (
        <ModalCompra
          cartoes={cartoes}
          onSave={async (d) => { await addCompra(d); setModal(false) }}
          onClose={() => setModal(false)}
        />
      )}

      {cartoes.length === 0 && (
        <div className="alert alert-amber">⚠ Cadastre pelo menos um cartão antes de registrar compras.</div>
      )}

      <div className="toolbar">
        <input placeholder="Buscar..." value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} style={{ width: 140 }}>
          <option value="">Todas</option>
          {PESSOAS.map((p) => <option key={p}>{p}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setModal(true)} style={{ marginLeft: 'auto' }}>
          + Nova compra
        </button>
      </div>

      <div className="card">
        {lista.length === 0 ? (
          <div className="empty">Nenhuma compra encontrada.{'\n'}Clique em "+ Nova compra" para começar.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Pessoa</th>
                <th>Categoria</th>
                <th>Cartão</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'center' }}>Parcelas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const cartao = cartoes.find((x) => x.id === c.cartao_id)
                const dd = c.data_compra.slice(0, 10).split('-')
                return (
                  <tr key={c.id}>
                    <td style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {dd[2]}/{dd[1]}/{dd[0].slice(2)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{c.descricao}</div>
                      {c.obs && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.obs}</div>}
                    </td>
                    <td>
                      <span className={`badge ${c.pessoa === 'Giovanna' ? 'badge-purple' : c.pessoa === 'Sabrina' ? 'badge-blue' : 'badge-gray'}`}>
                        {c.pessoa}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {c.categoria}<br />
                      <span style={{ color: 'var(--text3)' }}>{c.subcategoria}</span>
                    </td>
                    <td><span className="badge badge-gray">{cartao?.nome || '—'}</span></td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.valor_total)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(c.parcelas) > 1 ? (
                        <div>
                          <span className="badge badge-amber">{c.parcelas}x</span>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                            {fmt(c.valor_total / c.parcelas)}/mês
                          </div>
                        </div>
                      ) : (
                        <span className="badge badge-gray">à vista</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="btn btn-danger"
                        onClick={() => { if (confirm(`Remover "${c.descricao}"?`)) delCompra(c.id) }}
                      >×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
