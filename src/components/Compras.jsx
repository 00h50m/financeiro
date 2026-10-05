import { useState, useMemo } from 'react'
import { fmt, corPessoa, tituloCompra, subtituloCompra, valorParcelaBase } from '../lib/utils'
import { parcelasPagas } from '../lib/financeiro'
import ModalCompra from './ModalCompra'
import { rotuloOrigem } from '../lib/origem'

export default function Compras({ store }) {
  const { compras, cartoes, categorias, pessoas, comprasPagamentos, comprasPagamentosOk, addCompra, updateCompra, updateComprasLote, delCompra } = store
  const [modal, setModal] = useState(false)
  const [filtro, setFiltro] = useState('')
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [marcadas, setMarcadas] = useState([])
  const [novaCat, setNovaCat] = useState('')
  const [novaSub, setNovaSub] = useState('')

  const lista = useMemo(() =>
    compras.filter((c) =>
      (!filtro || (c.descricao + c.categoria + c.subcategoria + (c.obs || '') + (c.identificacao || '')).toLowerCase().includes(filtro.toLowerCase())) &&
      (!filtroPessoa || c.pessoa === filtroPessoa)
    ), [compras, filtro, filtroPessoa])

  const idsVisiveis = lista.map((c) => c.id)
  // Só vale o que está aparecendo: marcar, mudar a busca e aplicar nunca altera compras que a pessoa não vê.
  const selecionadas = marcadas.filter((id) => idsVisiveis.includes(id))
  const todasMarcadas = idsVisiveis.length > 0 && idsVisiveis.every((id) => marcadas.includes(id))
  const alternar = (id) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const subsNova = categorias.find((c) => c.nome === novaCat)?.subcategorias || []

  async function aplicarCategoria() {
    if (!novaCat || !selecionadas.length) return
    const sub = novaSub || subsNova[0] || 'Outros'
    if (!confirm(`Mudar ${selecionadas.length} compra${selecionadas.length > 1 ? 's' : ''} para ${novaCat} › ${sub}?`)) return
    const ok = await updateComprasLote(selecionadas, { categoria: novaCat, subcategoria: sub })
    if (ok) { setMarcadas([]); setNovaCat(''); setNovaSub('') }
  }

  function editarIdentificacao(c) {
    const novo = window.prompt(`Identificação de "${c.descricao}" (o que é essa compra). Deixe vazio para remover:`, c.identificacao || '')
    if (novo == null) return
    updateCompra(c.id, { identificacao: novo.trim() || null })
  }

  return (
    <div className="page">
      {modal && (
        <ModalCompra
          cartoes={cartoes}
          categorias={categorias}
          pessoas={pessoas}
          onSave={addCompra}
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
          {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
        </select>
        <button className="btn btn-primary" onClick={() => setModal(true)} style={{ marginLeft: 'auto' }}>
          + Nova compra
        </button>
      </div>

      {selecionadas.length > 0 && (
        <div className="toolbar" style={{ background: 'var(--bg2, transparent)' }}>
          <span style={{ fontSize: 13 }}>{selecionadas.length} selecionada{selecionadas.length > 1 ? 's' : ''}</span>
          <select value={novaCat} onChange={(e) => { setNovaCat(e.target.value); setNovaSub('') }} style={{ width: 170 }}>
            <option value="">Nova categoria…</option>
            {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          {novaCat && (
            <select value={novaSub || subsNova[0] || ''} onChange={(e) => setNovaSub(e.target.value)} style={{ width: 170 }}>
              {subsNova.length ? subsNova.map((x) => <option key={x}>{x}</option>) : <option>Outros</option>}
            </select>
          )}
          <button className="btn btn-primary" disabled={!novaCat} onClick={aplicarCategoria}>Aplicar</button>
          <button className="btn" onClick={() => setMarcadas([])}>Limpar</button>
        </div>
      )}

      <div className="card">
        {lista.length === 0 ? (
          <div className="empty">Nenhuma compra encontrada.{'\n'}Clique em "+ Nova compra" para começar.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={todasMarcadas} title="Marcar todas as que aparecem"
                    onChange={() => setMarcadas(todasMarcadas ? [] : idsVisiveis)} />
                </th>
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
                    <td><input type="checkbox" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} /></td>
                    <td style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {dd[2]}/{dd[1]}/{dd[0].slice(2)}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tituloCompra(c)}
                        <button
                          onClick={() => editarIdentificacao(c)}
                          title="Identificar / renomear (o que é essa compra)"
                          style={{ background: 'transparent', color: 'var(--text3)', fontSize: 12, padding: 0 }}
                        >✎</button>
                      </div>
                      {subtituloCompra(c) && <div style={{ fontSize: 11, color: 'var(--text3)' }}>no cartão: {subtituloCompra(c)}</div>}
                      {c.obs && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.obs}</div>}
                      {rotuloOrigem(c.origem) && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{rotuloOrigem(c.origem)}</div>}
                    </td>
                    <td>
                      <span className={`badge badge-${corPessoa(pessoas, c.pessoa)}`}>
                        {c.pessoa}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {c.categoria}<br />
                      <span style={{ color: 'var(--text3)' }}>{c.subcategoria}</span>
                    </td>
                    <td>
                      {cartao ? (
                        <span className="badge badge-gray">{cartao.nome}</span>
                      ) : (
                        <div>
                          <span className="badge badge-gray">Sem cartão</span>
                          <div style={{ marginTop: 3 }}>
                            {(() => {
                              const { pagas, total } = parcelasPagas(c, cartoes, comprasPagamentos, comprasPagamentosOk)
                              if (total > 1 && pagas > 0 && pagas < total) {
                                return <span className="badge badge-amber" style={{ fontSize: 10 }}>{pagas}/{total} pagas</span>
                              }
                              return pagas === total
                                ? <span className="badge badge-green" style={{ fontSize: 10 }}>pago</span>
                                : <span className="badge badge-amber" style={{ fontSize: 10 }}>a pagar</span>
                            })()}
                          </div>
                        </div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.valor_total)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {Number(c.parcelas) > 1 ? (
                        <div>
                          <span className="badge badge-amber">{c.parcelas}x</span>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                            {fmt(valorParcelaBase(c))}/mês
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
