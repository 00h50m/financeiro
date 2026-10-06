import { useState, Fragment } from 'react'
import { fmt, mesLabel, nowYM, hojeSP, tituloCompra, subtituloCompra } from '../lib/utils'
import { lancadoDoCartao, itensDaFatura } from '../lib/financeiro'
import EditarCompra from './EditarCompra'
import { mesesDeFaturas } from '../lib/faturaMeses'
import { lerValorReal, validarFatura, dadosDaFatura } from '../lib/faturaEdicao'

const CHAVE_REVISADAS = 'faturas_revisadas'
const lerRevisadas = () => {
  try { return JSON.parse(localStorage.getItem(CHAVE_REVISADAS) || '[]') } catch { return [] }
}

const fmtDia = (iso) => String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/')

// Lista do que compõe o "lançado" de uma fatura, com Editar em cada compra.
function ComprasDaFatura({ det, onEditar, irPara }) {
  if (det.itens.length === 0 && det.fixos.length === 0) {
    return <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text3)' }}>Nenhuma compra lançada neste cartão e mês.</div>
  }
  return (
    <div style={{ padding: '4px 14px 12px' }}>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Compra</th>
            <th>Categoria</th>
            <th style={{ textAlign: 'center' }}>Parcela</th>
            <th style={{ textAlign: 'right' }}>Neste mês</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {det.itens.map(({ compra: c, parcela, de, valor }) => (
            <tr key={c.id}>
              <td style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDia(c.data_compra)}</td>
              <td>
                <div style={{ fontWeight: 500 }}>{tituloCompra(c)}</div>
                {subtituloCompra(c) && <div style={{ fontSize: 11, color: 'var(--text3)' }}>no cartão: {subtituloCompra(c)}</div>}
                {c.grupo_id && <span className="badge badge-blue" style={{ fontSize: 10 }}>compra dividida</span>}
              </td>
              <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.categoria}<br /><span style={{ color: 'var(--text3)' }}>{c.subcategoria}</span></td>
              <td style={{ textAlign: 'center' }}>
                {de > 1 ? <span className="badge badge-amber">{parcela}/{de}</span> : <span className="badge badge-gray">à vista</span>}
              </td>
              <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(valor)}</td>
              <td><button className="btn btn-ghost btn-sm" onClick={() => onEditar(c)}>Editar</button></td>
            </tr>
          ))}
          {det.fixos.map((f) => (
            <tr key={f.id}>
              <td />
              <td><div style={{ fontWeight: 500 }}>{f.nome}</div><span className="badge badge-gray" style={{ fontSize: 10 }}>conta fixa</span></td>
              <td />
              <td style={{ textAlign: 'center' }}><span className="badge badge-gray">mensal</span></td>
              <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(f.valor)}</td>
              <td>{irPara && <button className="btn btn-ghost btn-sm" onClick={() => irPara('fixos')}>Contas fixas</button>}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid var(--border2)' }}>
            <td colSpan={4} style={{ color: 'var(--text2)' }}>Total lançado</td>
            <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontWeight: 500 }}>{fmt(det.total)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export default function Faturas({ store, irPara }) {
  const { faturas, cartoes, compras, upsertFatura, updateFatura, delFatura } = store
  const [modal, setModal] = useState(false)
  const formVazio = { cartao_id: '', mes: nowYM(), valor_real: '', pago: false, data_pagamento: '' }
  const [form, setForm] = useState(formVazio)
  const [editId, setEditId] = useState(null) // null = lançando uma fatura nova
  const [abertas, setAbertas] = useState([]) // faturas com a lista de compras aberta
  const [compraEditando, setCompraEditando] = useState(null)
  const [verTodos, setVerTodos] = useState(false) // meses antigos ficam recolhidos
  const alternarCompras = (id) => setAbertas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  const [saving, setSaving] = useState(false)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const [revisadas, setRevisadas] = useState(lerRevisadas)
  const getLancado = (cartao_id, mes) => lancadoDoCartao(compras, cartoes, cartao_id, mes, store.fixos)
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

  function abrirNova(extra = {}) {
    setForm({ ...formVazio, ...extra })
    setEditId(null)
    setModal(true)
  }
  function abrirEdicao(fat) {
    setForm({
      cartao_id: fat.cartao_id,
      mes: fat.mes,
      valor_real: temReal(fat) ? String(fat.valor_real) : '',
      pago: !!fat.pago,
      data_pagamento: fat.data_pagamento ? String(fat.data_pagamento).slice(0, 10) : '',
    })
    setEditId(fat.id)
    setModal(true)
  }

  const erros = validarFatura(form, { faturas, cartoes, id: editId })
  async function salvar() {
    if (erros.length) return
    setSaving(true)
    let ok
    if (editId) {
      ok = await updateFatura(editId, dadosDaFatura(form, hojeSP()))
    } else {
      // fatura nova: guarda só o valor (o pagamento continua sendo marcado em Pagamentos, como antes)
      ok = await upsertFatura({ cartao_id: form.cartao_id, mes: form.mes, valor_real: lerValorReal(form.valor_real).valor })
    }
    setSaving(false)
    if (ok) setModal(false) // se deu erro, mantém o formulário
  }

  // Todos os meses com fatura cadastrada OU com algo lançado no cartão (antes só os com valor do banco).
  const todosMeses = mesesDeFaturas({ faturas, compras, cartoes, fixos: store.fixos, hoje: nowYM() })
  const MESES_VISIVEIS = 12
  const meses = verTodos ? todosMeses : todosMeses.slice(0, MESES_VISIVEIS)

  return (
    <div className="page">
      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setModal(false) }}>
          <div className="modal">
            <div className="modal-title">{editId ? 'Editar fatura' : 'Lançar fatura'}</div>
            <div className="alert alert-blue" style={{ marginBottom: 16 }}>
              {editId
                ? 'Corrija o valor do banco, o cartão, o mês ou o pagamento. Deixar o valor vazio faz a fatura voltar a valer o que foi lançado.'
                : 'Informe o valor total que aparece no app do banco. O sistema compara com seus lançamentos e mostra a diferença.'}
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
                <label>Valor real da fatura (R$){editId ? ' — opcional' : ''}</label>
                <input type="number" step="0.01" min="0" placeholder="0,00" value={form.valor_real} onChange={s('valor_real')} autoFocus />
              </div>
            </div>
            {form.cartao_id && form.mes && (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: -8, marginBottom: 8 }}>
                Lançado neste mês: {fmt(getLancado(form.cartao_id, form.mes))}
                {lerValorReal(form.valor_real).valor > 0 && ` · diferença para o banco: ${fmt(lerValorReal(form.valor_real).valor - getLancado(form.cartao_id, form.mes))}`}
              </div>
            )}
            {editId && (
              <div className="form-row cols2" style={{ marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.pago} onChange={(e) => setForm((f) => ({ ...f, pago: e.target.checked, data_pagamento: e.target.checked ? f.data_pagamento || hojeSP() : '' }))} />
                  Fatura paga
                </label>
                {form.pago && (
                  <div className="form-group">
                    <label>Pago em</label>
                    <input type="date" value={form.data_pagamento} onChange={s('data_pagamento')} />
                  </div>
                )}
              </div>
            )}
            {erros.length > 0 && (form.valor_real !== '' || editId) && (
              <div style={{ fontSize: 12, color: 'var(--amber)', marginBottom: 8 }}>{erros[0]}</div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={erros.length > 0 || saving}>
                {saving ? 'Salvando...' : editId ? 'Salvar alterações' : 'Salvar fatura'}
              </button>
            </div>
          </div>
        </div>
      )}

      {compraEditando && <EditarCompra store={store} compra={compraEditando} onClose={() => setCompraEditando(null)} />}

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => abrirNova()}>
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

      {meses.length === 0 && (
        <div className="empty">
          Nenhuma fatura lançada ainda.{'\n'}Lance o valor real do banco e o sistema mostra o que está faltando categorizar.
        </div>
      )}

      {meses.map(({ mes, linhas }) => {
        // Cartão com compras no mês mas sem fatura cadastrada vira uma linha "de mentira" (sem id no banco).
        const fatsDoMes = linhas.map((l) => l.fatura || { id: `sem|${l.cartao_id}|${mes}`, cartao_id: l.cartao_id, mes, valor_real: null, pago: false, sintetica: true })
        const comReal = fatsDoMes.filter(temReal)
        const totalReal = comReal.reduce((s, f) => s + Number(f.valor_real), 0)
        const totalLanc = comReal.reduce((s, f) => s + getLancado(f.cartao_id, mes), 0)
        const totalDiff = totalReal - totalLanc
        const semNenhumReal = comReal.length === 0
        const totalLancTodos = fatsDoMes.reduce((s, f) => s + getLancado(f.cartao_id, mes), 0)

        return (
          <div key={mes}>
            <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{mesLabel(mes)}</span>
              <span style={{ fontSize: 11, fontFamily: 'DM Mono', color: semNenhumReal ? 'var(--text3)' : Math.abs(totalDiff) < 1 ? 'var(--green)' : totalDiff > 0 ? 'var(--red)' : 'var(--amber)' }}>
                {semNenhumReal ? 'sem valor do banco ainda' : Math.abs(totalDiff) < 1 ? '✓ tudo identificado' : totalDiff > 0 ? `⚠ ${fmt(totalDiff)} não identificado` : `excede ${fmt(Math.abs(totalDiff))}`}
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
                    const det = itensDaFatura(compras, cartoes, fat.cartao_id, mes, store.fixos)
                    const aberta = abertas.includes(fat.id)
                    const qtd = det.itens.length + det.fixos.length
                    const botaoCompras = (
                      <button className="btn btn-ghost btn-sm" onClick={() => alternarCompras(fat.id)} style={{ marginRight: 6 }} aria-expanded={aberta}>
                        {aberta ? '▾' : '▸'} Compras ({qtd})
                      </button>
                    )
                    const linhaDetalhe = aberta && (
                      <tr>
                        <td colSpan={6} style={{ background: 'var(--bg3)', padding: 0 }}>
                          <ComprasDaFatura det={det} onEditar={setCompraEditando} irPara={irPara} />
                        </td>
                      </tr>
                    )
                    if (!temReal(fat)) {
                      // Linha criada só para marcar como paga: ainda não há valor do banco para comparar.
                      return (
                        <Fragment key={fat.id}>
                        <tr>
                          <td style={{ fontWeight: 500 }}>{cartao?.nome || '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text3)' }}>—</td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lanc)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text3)' }}>—</td>
                          <td>
                            <span className="badge badge-gray">{fat.sintetica ? 'fatura não lançada' : 'sem valor do banco'}</span>{' '}
                            {fat.pago && <span className="badge badge-green">paga</span>}{' '}
                            <button className="btn btn-ghost btn-sm" onClick={() => (fat.sintetica ? abrirNova({ cartao_id: fat.cartao_id, mes }) : abrirEdicao(fat))}>Informar valor</button>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {botaoCompras}
                            {!fat.sintetica && <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(fat)} style={{ marginRight: 6 }}>Editar</button>}
                          </td>
                        </tr>
                        {linhaDetalhe}
                        </Fragment>
                      )
                    }
                    const diff = fat.valor_real - lanc
                    const pct = fat.valor_real > 0 ? Math.round((lanc / fat.valor_real) * 100) : 0
                    return (
                      <Fragment key={fat.id}>
                      <tr>
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
                          {fat.pago && <> <span className="badge badge-green" title={fat.data_pagamento ? `Paga em ${String(fat.data_pagamento).slice(0, 10).split('-').reverse().join('/')}` : 'Paga'}>paga</span></>}
                        </td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          {botaoCompras}
                          <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(fat)} style={{ marginRight: 6 }}>Editar</button>
                          <button className="btn btn-danger" onClick={() => { if (confirm('Remover o valor real desta fatura? Se ela estava marcada como paga, isso também some.')) delFatura(fat.id) }}>×</button>
                        </td>
                      </tr>
                      {linhaDetalhe}
                      </Fragment>
                    )
                  })}
                  {fatsDoMes.length > 1 && (
                    <tr style={{ borderTop: '2px solid var(--border2)' }}>
                      <td style={{ fontWeight: 500, color: 'var(--text2)' }}>Total</td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontWeight: 500 }}>{semNenhumReal ? '—' : fmt(totalReal)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontWeight: 500 }}>{fmt(semNenhumReal ? totalLancTodos : totalLanc)}</td>
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
      {todosMeses.length > MESES_VISIVEIS && (
        <div style={{ textAlign: 'center', margin: '8px 0 24px' }}>
          <button className="btn btn-ghost" onClick={() => setVerTodos((v) => !v)}>
            {verTodos ? 'Mostrar só os últimos 12 meses' : `Mostrar meses anteriores (${todosMeses.length - MESES_VISIVEIS})`}
          </button>
        </div>
      )}
    </div>
  )
}
