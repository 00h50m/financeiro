import { useState } from 'react'
import { addMonths, fmt, mesLabel, nowYM, corPessoa, corPessoaCss } from '../lib/utils'
import { visaoPorPessoa } from '../lib/porPessoa'

const Seta = () => (
  <svg className="pp-seta" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
)

export default function PorPessoa({ store }) {
  const [mes, setMes] = useState(nowYM())
  const [abertos, setAbertos] = useState({}) // por pessoa; começa recolhido para ver o panorama de uma vez
  const visao = visaoPorPessoa(store, mes)
  const totalGeral = visao.reduce((s, v) => s + v.total, 0)
  const todosAbertos = visao.length > 0 && visao.every((v) => abertos[v.pessoa])
  const alternar = (pessoa) => setAbertos((a) => ({ ...a, [pessoa]: !a[pessoa] }))
  const alternarTodos = () => setAbertos(Object.fromEntries(visao.map((v) => [v.pessoa, !todosAbertos])))

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior">←</button>
        <b>{mesLabel(mes)}</b>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">→</button>
        {visao.length > 0 && <button className="btn btn-ghost btn-sm" onClick={alternarTodos}>{todosAbertos ? 'Recolher tudo' : 'Expandir tudo'}</button>}
        <span style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text2)' }}>Total do mês: <b className="mono">{fmt(totalGeral)}</b></span>
      </div>
      <div className="alert alert-blue">
        Quanto cada pessoa tem de gasto no mês: parcelas das compras no nome dela e as contas fixas dela. Contas sem dono ficam na Casa.
        A parte de compras e contas divididas que é de outra pessoa não entra aqui.
      </div>

      {visao.length === 0 && <div className="empty">Nenhum gasto neste mês.</div>}
      {visao.map((v) => {
        const pct = totalGeral > 0 ? Math.round((v.total / totalGeral) * 100) : 0
        const aberto = !!abertos[v.pessoa]
        return (
          <div key={v.pessoa} className="card" style={{ padding: 14, overflow: 'visible' }}>
            <button className="pp-cabeca" onClick={() => alternar(v.pessoa)} aria-expanded={aberto} aria-label={`${v.pessoa}: ${fmt(v.total)}. ${aberto ? 'Recolher' : 'Expandir'} detalhes`}>
              <div className="pp-linha">
                <span><Seta /><span className={`badge badge-${corPessoa(store.pessoas, v.pessoa)}`}>{v.pessoa}</span></span>
                <span className="mono" style={{ fontSize: 18 }}>{fmt(v.total)}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0' }}>
                <div className="prog-bar" style={{ flex: 1 }}>
                  <div className="prog-fill" style={{ width: pct + '%', background: corPessoaCss(store.pessoas, v.pessoa) }} />
                </div>
                <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 60 }}>{pct}% do total</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>Compras e parcelas {fmt(v.compras)} · Contas fixas {fmt(v.fixos)}</div>
            </button>
            {!aberto ? null : v.total === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 8 }}>Sem gastos neste mês.</div>
            ) : (
              <>
                <div className="section-label" style={{ marginTop: 12 }}>por categoria</div>
                <table>
                  <tbody>
                    {v.porCategoria.map((c) => (
                      <tr key={c.categoria}>
                        <td>{c.categoria}</td>
                        <td style={{ textAlign: 'right' }} className="mono">{fmt(c.valor)}</td>
                        <td style={{ textAlign: 'right', width: 48, color: 'var(--text3)', fontSize: 12 }}>{Math.round((c.valor / v.total) * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="section-label" style={{ marginTop: 12 }}>maiores itens</div>
                <table>
                  <tbody>
                    {v.maiores.map((i, k) => (
                      <tr key={k}>
                        <td>{i.nome} <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {i.detalhe}</span></td>
                        <td style={{ textAlign: 'right' }} className="mono">{fmt(i.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
