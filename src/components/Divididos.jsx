import { useState } from 'react'
import { addMonths, fmt, mesLabel, nowYM, tituloCompra } from '../lib/utils'
import { descricaoDoItem, parteTotal, resumoRepasses, saldoPorPessoa } from '../lib/divisoes'

const num = (t) => Number(String(t).replace(',', '.'))
const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

function NovaDivisao({ store, onFeito }) {
  const { compras, fixos, divisoes, pessoas, addDivisao } = store
  const [tipo, setTipo] = useState('compra')
  const [refId, setRefId] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [modo, setModo] = useState('valor')
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')

  const itens = tipo === 'compra'
    ? [...compras].sort((a, b) => (a.data_compra < b.data_compra ? 1 : -1)).slice(0, 300)
      .map((c) => ({ id: c.id, rotulo: `${tituloCompra(c)} · ${fmt(c.valor_total)} · ${brData(c.data_compra)}`, base: Number(c.valor_total) }))
    : fixos.filter((f) => f.ativo).map((f) => ({ id: f.id, rotulo: `${f.nome} · ${fmt(f.valor)} por mês`, base: Number(f.valor) }))
  const item = itens.find((i) => i.id === refId)
  const nomes = [...new Set([...pessoas.map((p) => p.nome), ...divisoes.map((d) => d.pessoa)])]
  const v = num(valor)
  const parte = item && v > 0 ? parteTotal({ modo, valor: v }, item.base) : 0
  const jaDividido = item ? divisoes.filter((d) => d.tipo === tipo && d.ref_id === item.id).reduce((s, d) => s + parteTotal(d, item.base), 0) : 0
  const excede = item && parte > 0 && jaDividido + parte > item.base + 0.005
  const valido = item && pessoa.trim() && v > 0 && (modo !== 'percentual' || v <= 100) && !excede

  async function salvar() {
    if (!valido) return
    const ok = await addDivisao({ tipo, ref_id: item.id, pessoa: pessoa.trim(), modo, valor: v, observacao: obs.trim() || null })
    if (ok) { setRefId(''); setValor(''); setObs(''); onFeito?.() }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="section-label" style={{ marginTop: 0 }}>Nova divisão</div>
      <div className="form-row cols2">
        <div className="form-group">
          <label htmlFor="dv-tipo">O que será dividido</label>
          <select id="dv-tipo" value={tipo} onChange={(e) => { setTipo(e.target.value); setRefId('') }}>
            <option value="compra">Uma compra (cartão ou outra)</option>
            <option value="fixo">Uma conta fixa (ex.: convênio)</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="dv-item">{tipo === 'compra' ? 'Compra' : 'Conta fixa'}</label>
          <select id="dv-item" value={refId} onChange={(e) => setRefId(e.target.value)}>
            <option value="">Escolha…</option>
            {itens.map((i) => <option key={i.id} value={i.id}>{i.rotulo}</option>)}
          </select>
        </div>
      </div>
      <div className="form-row cols3">
        <div className="form-group">
          <label htmlFor="dv-pessoa">Quem paga a parte</label>
          <input id="dv-pessoa" list="dv-nomes" value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="ex.: Mãe" />
          <datalist id="dv-nomes">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
        <div className="form-group">
          <label htmlFor="dv-modo">Como informar</label>
          <select id="dv-modo" value={modo} onChange={(e) => setModo(e.target.value)}>
            <option value="valor">Em reais{tipo === 'fixo' ? ' (por mês)' : ' (total da compra)'}</option>
            <option value="percentual">Em porcentagem</option>
          </select>
        </div>
        <div className="form-group">
          <label htmlFor="dv-valor">{modo === 'valor' ? 'Valor (R$)' : 'Porcentagem (%)'}</label>
          <input id="dv-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder={modo === 'valor' ? '0,00' : '50'} />
        </div>
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label htmlFor="dv-obs">Observação (opcional)</label>
        <input id="dv-obs" value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      {item && parte > 0 && !excede && (
        <div className="alert alert-blue">
          {pessoa.trim() || 'A pessoa'} paga {fmt(parte)}{tipo === 'fixo' ? ' por mês' : ''}; a sua parte fica {fmt(item.base - jaDividido - parte)}{tipo === 'fixo' ? ' por mês' : ''}.
        </div>
      )}
      {excede && <div className="alert alert-red">A soma das partes passa do valor total ({fmt(item.base)}). Diminua o valor.</div>}
      <button className="btn btn-primary" disabled={!valido} onClick={salvar}>Salvar divisão</button>
    </div>
  )
}

export default function Divididos({ store }) {
  const { divisoes, divisoesOk, marcarRepasse, desmarcarRepasse, delDivisao } = store
  const [mes, setMes] = useState(nowYM())

  if (!divisoesOk) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          <strong>Falta criar as tabelas de Divididos no banco.</strong> Rode o arquivo <code>inbox/18_divisoes.sql</code> no SQL Editor do Supabase e recarregue esta página.
        </div>
      </div>
    )
  }

  const r = resumoRepasses(store, mes)
  const meses = Array.from({ length: 37 }, (_, i) => addMonths(nowYM(), i - 24))
  const deve = saldoPorPessoa(store, meses)
  const totalDeve = Object.values(deve).reduce((s, x) => s + x, 0)

  async function receber(i) {
    const t = window.prompt(`Quanto ${i.pessoa} pagou de "${i.descricao}"? (R$)`, String(i.esperado).replace('.', ','))
    if (t === null) return
    const v = num(t)
    if (!(v >= 0) || Number.isNaN(v)) return alert('Valor inválido.\n\nDigite só números, com vírgula nos centavos (ex.: 312,40).')
    await marcarRepasse(i.divisao.id, mes, v)
  }

  return (
    <div className="page">
      <div className="alert alert-blue">
        Aqui você marca a parte de uma compra ou conta fixa que é de outra pessoa. A fatura e a conta continuam com o valor cheio; o teto e as
        categorias contam só a sua parte; e o que a pessoa te devolve só entra na sua receita quando você marcar como recebido.
      </div>

      <NovaDivisao store={store} />

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior">←</button>
        <strong style={{ minWidth: 110, textAlign: 'center' }}>{mesLabel(mes)}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">→</button>
      </div>

      <div className="metric-grid">
        <div className="metric"><div className="metric-label">A receber neste mês</div><div className="metric-val amber">{fmt(r.aReceber)}</div></div>
        <div className="metric"><div className="metric-label">Recebido neste mês</div><div className="metric-val green">{fmt(r.recebido)}</div></div>
        <div className="metric"><div className="metric-label">A receber (todos os meses)</div><div className="metric-val">{fmt(totalDeve)}</div></div>
      </div>

      {Object.keys(deve).length > 0 && (
        <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
          Quem deve (todos os meses): {Object.entries(deve).map(([p, v]) => `${p} ${fmt(v)}`).join(' · ')}
        </p>
      )}

      <div className="section-label">{mesLabel(mes)}</div>
      {r.itens.length === 0 ? (
        <div className="empty">Nenhuma parte de outras pessoas neste mês.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <thead><tr><th>Pessoa</th><th>Item</th><th style={{ textAlign: 'right' }}>Parte dela</th><th>Situação</th></tr></thead>
            <tbody>
              {r.itens.map((i) => (
                <tr key={i.divisao.id}>
                  <td>{i.pessoa}</td>
                  <td>{i.descricao}{i.divisao.observacao ? <div style={{ fontSize: 12, color: 'var(--text3)' }}>{i.divisao.observacao}</div> : null}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono' }}>{fmt(i.recebido ? i.valorRecebido : i.esperado)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.recebido ? (
                      <>
                        <span className="badge badge-green">recebido{i.recebidoEm ? ` em ${brData(i.recebidoEm)}` : ''}</span>{' '}
                        <button className="btn btn-ghost btn-sm" onClick={() => desmarcarRepasse(i.divisao.id, mes)}>Desfazer</button>
                      </>
                    ) : (
                      <>
                        <span className="badge badge-amber">a receber</span>{' '}
                        <button className="btn btn-primary btn-sm" onClick={() => receber(i)}>Recebi</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-label" style={{ marginTop: 24 }}>Divisões cadastradas</div>
      {divisoes.length === 0 ? (
        <div className="empty">Nenhuma divisão cadastrada ainda.</div>
      ) : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table>
            <tbody>
              {divisoes.map((d) => (
                <tr key={d.id}>
                  <td>{d.pessoa}</td>
                  <td>{descricaoDoItem(store, d)} <span style={{ fontSize: 12, color: 'var(--text3)' }}>({d.tipo === 'fixo' ? 'conta fixa' : 'compra'})</span></td>
                  <td style={{ fontFamily: 'DM Mono' }}>{d.modo === 'percentual' ? `${Number(d.valor)}%` : fmt(d.valor)}{d.tipo === 'fixo' ? ' /mês' : ''}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-danger" onClick={() => { if (window.confirm(`Apagar a divisão com ${d.pessoa}? Os valores já recebidos dela também somem.`)) delDivisao(d) }} aria-label={`Apagar divisão com ${d.pessoa}`}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
