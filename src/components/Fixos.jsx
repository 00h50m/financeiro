import { useState } from 'react'
import { fmt, mesLabel, nowYM, addMonths, fixosAtivos, corPessoa, nomeCasa, donoDoFixo } from '../lib/utils'

export default function Fixos({ store }) {
  const { fixos, categorias, pessoas, addFixo, updateFixo, delFixo } = store
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    nome: '', valor: '', pessoa: '',
    categoria: categorias[0]?.nome || '',
    subcategoria: categorias[0]?.subcategorias?.[0] || '',
    mes_fim: '', dia_vencimento: '',
  })
  const [filtroPessoa, setFiltroPessoa] = useState('') // '' = todas
  const [saving, setSaving] = useState(false)
  const mesAtual = nowYM()
  const casa = nomeCasa(pessoas)
  const casaCadastrada = pessoas.some((p) => p.nome === casa)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const subcats = categorias.find((c) => c.nome === form.categoria)?.subcategorias || []

  function abrir(fx) {
    if (fx) {
      setForm({
        nome: fx.nome, valor: fx.valor, pessoa: fx.pessoa || (casaCadastrada ? casa : ''),
        categoria: fx.categoria || categorias[0]?.nome || '',
        subcategoria: fx.subcategoria || categorias.find((c) => c.nome === fx.categoria)?.subcategorias?.[0] || '',
        mes_fim: fx.mes_fim || '', dia_vencimento: fx.dia_vencimento || '',
      })
      setEditId(fx.id)
    } else {
      setForm({
        nome: '', valor: '', pessoa: casaCadastrada ? casa : '',
        categoria: categorias[0]?.nome || '',
        subcategoria: categorias[0]?.subcategorias?.[0] || '',
        mes_fim: '', dia_vencimento: '',
      })
      setEditId(null)
    }
    setModal(true)
  }

  async function salvar() {
    if (!form.nome || !form.valor || !form.categoria) return
    setSaving(true)
    const dados = {
      nome: form.nome,
      valor: Number(form.valor),
      pessoa: form.pessoa || null,
      categoria: form.categoria,
      subcategoria: form.subcategoria,
      mes_fim: form.mes_fim || null,
      dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
    }
    let ok
    const antigo = editId && fixos.find((f) => f.id === editId)
    const mudouValor = antigo && Number(antigo.valor) !== dados.valor
    const jaComecou = antigo && (!antigo.mes_inicio || antigo.mes_inicio < mesAtual)
    if (mudouValor && jaComecou && confirm(
      `Mudar o valor só a partir de ${mesLabel(mesAtual)}?\n\nOK = os meses anteriores continuam com o valor antigo (${fmt(antigo.valor)}).\nCancelar = o valor novo vale para todos os meses, inclusive os passados.`
    )) {
      // novo registro começa neste mês; o antigo termina no mês anterior (guarda o histórico)
      ok = await addFixo({ ...dados, ativo: true, mes_inicio: mesAtual })
      if (ok) ok = await updateFixo(editId, { mes_fim: addMonths(mesAtual, -1) })
    } else {
      ok = editId ? await updateFixo(editId, dados) : await addFixo({ ...dados, ativo: true })
    }
    setSaving(false)
    if (ok) setModal(false) // se deu erro, mantém o formulário
  }

  const doFiltro = (f) => !filtroPessoa || donoDoFixo(f, pessoas) === filtroPessoa
  const fixosVisiveis = fixos.filter(doFiltro)
  const ativosAgora = fixosAtivos(fixosVisiveis, mesAtual)
  async function alternarAtivo(f, encerrado) {
    if (f.ativo && !encerrado) {
      if (!confirm(`Pausar "${f.nome}" a partir de ${mesLabel(mesAtual)}? Os meses anteriores continuam contando.`)) return
      await updateFixo(f.id, { mes_fim: addMonths(mesAtual, -1) })
    } else {
      if (!confirm(`Reativar "${f.nome}"? Ela volta a contar em todos os meses desde o início, inclusive nos que já passaram.`)) return
      await updateFixo(f.id, { ativo: true, mes_fim: null })
    }
  }

  const total = ativosAgora.reduce((s, f) => s + Number(f.valor), 0)
  const ok = form.nome && form.valor && form.categoria && !saving

  return (
    <div className="page">
      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setModal(false) }}>
          <div className="modal">
            <div className="modal-title">{editId ? 'Editar fixo' : 'Novo gasto fixo'}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Nome</label>
                <input placeholder="Ex: Condomínio" value={form.nome} onChange={s('nome')} autoFocus />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>De quem é</label>
                <select value={form.pessoa} onChange={s('pessoa')}>
                  {!casaCadastrada && <option value="">{casa} (de todos)</option>}
                  {form.pessoa && !pessoas.some((p) => p.nome === form.pessoa) && <option value={form.pessoa}>{form.pessoa}</option>}
                  {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Valor mensal (R$)</label>
                <input type="number" step="0.01" value={form.valor} onChange={s('valor')} placeholder="0,00" />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Categoria</label>
                <select
                  value={form.categoria}
                  onChange={(e) => {
                    const cat = e.target.value
                    const subs = categorias.find((c) => c.nome === cat)?.subcategorias || []
                    setForm((p) => ({ ...p, categoria: cat, subcategoria: subs[0] || '' }))
                  }}
                >
                  <option value="">Selecione...</option>
                  {categorias.map((c) => <option key={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Subcategoria</label>
                <select value={form.subcategoria} onChange={s('subcategoria')} disabled={!form.categoria}>
                  {subcats.map((sub) => <option key={sub}>{sub}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Dia do vencimento (opcional)</label>
                <input type="number" min="1" max="31" value={form.dia_vencimento} onChange={s('dia_vencimento')} placeholder="Ex: 10" />
              </div>
              <div className="form-group">
                <label>Termina em (opcional)</label>
                <input type="month" value={form.mes_fim} onChange={s('mes_fim')} min={mesAtual} />
              </div>
            </div>
            {form.mes_fim && (
              <div className="alert alert-blue" style={{ marginBottom: 0 }}>
                Última cobrança em {mesLabel(form.mes_fim)} — a partir do mês seguinte, some sozinho do comprometido e da lista de Pagamentos.
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={!ok}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => abrir(null)}>+ Novo fixo</button>
        <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} aria-label="Filtrar por pessoa">
          <option value="">Todas as pessoas</option>
          {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
          {!casaCadastrada && <option value={casa}>{casa}</option>}
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text2)' }}>
          Total{filtroPessoa ? ` · ${filtroPessoa}` : ''}: <span style={{ fontFamily: 'DM Mono', color: 'var(--amber)' }}>{fmt(total)}/mês</span>
        </span>
      </div>

      <div className="card">
        {fixosVisiveis.length === 0 ? (
          <div className="empty">{fixos.length === 0 ? 'Nenhum gasto fixo cadastrado.' : 'Nenhuma conta fixa para esse filtro.'}</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nome</th>
                <th>De quem</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Valor/mês</th>
                <th style={{ textAlign: 'center' }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {fixosVisiveis.map((f) => {
                const encerrado = f.mes_fim && f.mes_fim < mesAtual
                return (
                  <tr key={f.id}>
                    <td style={{ fontWeight: 500 }}>
                      {f.nome}
                      {f.mes_fim && (
                        <div style={{ fontSize: 11, color: encerrado ? 'var(--text3)' : 'var(--amber)', marginTop: 2, fontWeight: 400 }}>
                          {encerrado ? `encerrado em ${mesLabel(f.mes_fim)}` : `até ${mesLabel(f.mes_fim)}`}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${corPessoa(pessoas, donoDoFixo(f, pessoas))}`}>{donoDoFixo(f, pessoas)}</span>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {f.categoria ? (
                        <>
                          {f.categoria}<br />
                          <span style={{ color: 'var(--text3)' }}>{f.subcategoria}</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>sem categoria</span>
                      )}
                      {f.dia_vencimento && (
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>vence dia {f.dia_vencimento}</div>
                      )}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(f.valor)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className={`badge ${f.ativo && !encerrado ? 'badge-green' : 'badge-gray'}`}
                        style={{ cursor: 'pointer' }}
                        onClick={() => alternarAtivo(f, encerrado)}
                      >
                        {!f.ativo ? 'Pausado' : encerrado ? 'Encerrado' : 'Ativo'}
                      </button>
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => abrir(f)}>Editar</button>
                      <button className="btn btn-danger" onClick={() => { if (confirm(`Remover "${f.nome}"?`)) delFixo(f.id) }}>×</button>
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
