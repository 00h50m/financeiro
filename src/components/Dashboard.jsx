import { fmt, fmtK, mesLabel, nowYM, addMonths, gerarParcelas, totalRenda, PESSOAS } from '../lib/utils'

export default function Dashboard({ store }) {
  const { compras, cartoes, rendas, fixos } = store
  const mes = nowYM()

  const totalFixos = fixos.filter((f) => f.ativo).reduce((s, f) => s + Number(f.valor), 0)
  const parcelasMes = compras.flatMap((c) => gerarParcelas(c, cartoes).filter((p) => p.mes === mes))
  const totalParc = parcelasMes.reduce((s, p) => s + p.valor, 0)
  const totalMes = totalFixos + totalParc

  const rendaMes = rendas.find((r) => r.mes === mes)
  const renda = totalRenda(rendaMes)
  const saldo = renda - totalMes
  const pct = renda > 0 ? Math.min(999, Math.round((totalMes / renda) * 100)) : 0

  const meses6 = Array.from({ length: 6 }, (_, i) => addMonths(mes, i)).map((m) => {
    const ps = compras.flatMap((c) => gerarParcelas(c, cartoes).filter((p) => p.mes === m))
    const tot = totalFixos + ps.reduce((s, p) => s + p.valor, 0)
    const r = rendas.find((x) => x.mes === m)
    const rTot = totalRenda(r)
    return { mes: m, compromisso: tot, renda: rTot, saldo: rTot - tot }
  })

  const gastoPessoa = PESSOAS.map((pessoa) => ({
    pessoa,
    valor: compras
      .flatMap((c) => (c.pessoa === pessoa ? gerarParcelas(c, cartoes).filter((p) => p.mes === mes) : []))
      .reduce((s, p) => s + p.valor, 0),
  }))

  return (
    <div className="page">
      <div className="section-label">{mesLabel(mes)} · resumo do mês</div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Renda do mês</div>
          <div className={`metric-val ${renda > 0 ? 'green' : 'amber'}`}>
            {renda > 0 ? fmtK(renda) : 'Não informada'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Comprometido</div>
          <div className="metric-val amber">{fmtK(totalMes)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Saldo projetado</div>
          <div className={`metric-val ${renda === 0 ? 'blue' : saldo >= 0 ? 'green' : 'red'}`}>
            {renda > 0 ? fmtK(saldo) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">% da renda</div>
          <div className={`metric-val ${pct > 90 ? 'red' : pct > 70 ? 'amber' : 'green'}`}>
            {renda > 0 ? pct + '%' : '—'}
          </div>
        </div>
      </div>

      <div className="section-label">distribuição por pessoa · {mesLabel(mes)}</div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Pessoa</th>
              <th style={{ textAlign: 'right' }}>Parcelamentos</th>
              <th>Participação</th>
            </tr>
          </thead>
          <tbody>
            {gastoPessoa.map(({ pessoa, valor }) => {
              const p2 = totalParc > 0 ? Math.round((valor / totalParc) * 100) : 0
              return (
                <tr key={pessoa}>
                  <td>
                    <span className={`badge ${pessoa === 'Giovanna' ? 'badge-purple' : pessoa === 'Sabrina' ? 'badge-blue' : 'badge-gray'}`}>
                      {pessoa}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(valor)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="prog-bar" style={{ flex: 1 }}>
                        <div className="prog-fill" style={{ width: p2 + '%', background: pessoa === 'Giovanna' ? 'var(--purple)' : pessoa === 'Sabrina' ? 'var(--blue)' : 'var(--text3)' }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 28 }}>{p2}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr style={{ borderTop: '1px solid var(--border2)' }}>
              <td style={{ color: 'var(--text2)' }}>Fixos da casa</td>
              <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text2)' }}>{fmt(totalFixos)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="section-label">projeção · próximos 6 meses</div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th style={{ textAlign: 'right' }}>Renda</th>
              <th style={{ textAlign: 'right' }}>Compromisso</th>
              <th style={{ textAlign: 'right' }}>Saldo</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {meses6.map((p) => (
              <tr key={p.mes}>
                <td>
                  {mesLabel(p.mes)}
                  {p.mes === mes && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>hoje</span>}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text2)' }}>
                  {p.renda > 0 ? fmtK(p.renda) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--amber)' }}>
                  {fmtK(p.compromisso)}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <span style={{ fontFamily: 'DM Mono', fontSize: 13, color: p.renda === 0 ? 'var(--text3)' : p.saldo >= 0 ? 'var(--green)' : 'var(--red)' }}>
                    {p.renda > 0 ? fmtK(p.saldo) : '—'}
                  </span>
                </td>
                <td>
                  {p.renda > 0 && (
                    <div className="prog-bar">
                      <div className="prog-fill" style={{ width: Math.min(100, Math.round((p.compromisso / p.renda) * 100)) + '%', background: p.saldo >= 0 ? 'var(--green)' : 'var(--red)' }} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
