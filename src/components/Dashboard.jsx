import { useState, Fragment } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths, gerarParcelas, totalRenda, corPessoa, corPessoaCss, fixosAtivos, gastosPorCategoria, statusTeto, detalhePagamentos } from '../lib/utils'

export default function Dashboard({ store, irPara }) {
  const { compras, cartoes, rendas, fixos, pessoas, orcamentos } = store
  const mes = nowYM()
  const [abertas, setAbertas] = useState({})
  const alternar = (categoria) => setAbertas((a) => ({ ...a, [categoria]: !a[categoria] }))

  // Mesma conta da aba Pagamentos (fatura com valor real conta pelo valor real), para os números baterem.
  const comprometidoDe = (m) => detalhePagamentos(store, m).comprometido
  const totalMes = comprometidoDe(mes)

  const totalFixos = fixosAtivos(fixos, mes).reduce((s, f) => s + Number(f.valor), 0)
  const totalParc = compras
    .flatMap((c) => gerarParcelas(c, cartoes).filter((p) => p.mes === mes))
    .reduce((s, p) => s + p.valor, 0)

  const rendaMes = rendas.find((r) => r.mes === mes)
  const renda = totalRenda(rendaMes)
  const saldo = renda - totalMes
  const pct = renda > 0 ? Math.min(999, Math.round((totalMes / renda) * 100)) : 0

  const meses6 = Array.from({ length: 6 }, (_, i) => addMonths(mes, i)).map((m) => {
    const tot = comprometidoDe(m)
    const r = rendas.find((x) => x.mes === m)
    const rTot = totalRenda(r)
    return { mes: m, compromisso: tot, renda: rTot, saldo: rTot - tot }
  })

  const gastoPessoa = pessoas.map(({ nome: pessoa }) => ({
    pessoa,
    valor: compras
      .flatMap((c) => (c.pessoa === pessoa ? gerarParcelas(c, cartoes).filter((p) => p.mes === mes) : []))
      .reduce((s, p) => s + p.valor, 0),
  }))

  const porCategoriaMap = gastosPorCategoria(compras, cartoes, fixos, mes)
  const porCategoria = Object.entries(porCategoriaMap)
    .map(([categoria, { total, itens }]) => ({
      categoria,
      total,
      teto: Number(orcamentos.find((o) => o.categoria === categoria)?.valor) || 0,
      itens: [...itens].sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.total - a.total)

  const estouradas = porCategoria.filter((c) => statusTeto(c.total, c.teto) === 'estourou')

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
          <div className="metric-label">Sobra projetada</div>
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
                    <span className={`badge badge-${corPessoa(pessoas, pessoa)}`}>
                      {pessoa}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(valor)}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="prog-bar" style={{ flex: 1 }}>
                        <div className="prog-fill" style={{ width: p2 + '%', background: corPessoaCss(pessoas, pessoa) }} />
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

      {estouradas.length > 0 && (
        <div className="alert alert-red" style={{ marginTop: 20 }}>
          <strong>{estouradas.length === 1 ? '1 categoria passou' : `${estouradas.length} categorias passaram`} do teto este mês:</strong>{' '}
          {estouradas.map((c) => `${c.categoria} (${fmtK(c.total)} de ${fmtK(c.teto)})`).join(' · ')}.{' '}
          <a href="#orcamento" onClick={(e) => { e.preventDefault(); irPara?.('orcamento') }} style={{ color: 'inherit', textDecoration: 'underline' }}>Ver orçamento</a>
        </div>
      )}

      <div className="section-label">gastos por categoria · {mesLabel(mes)}</div>
      <div className="card">
        {porCategoria.length === 0 ? (
          <div className="empty">Nenhum gasto categorizado em {mesLabel(mes)} ainda.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Participação</th>
              </tr>
            </thead>
            <tbody>
              {porCategoria.map(({ categoria, total, itens, teto }) => {
                const statusT = statusTeto(total, teto)
                const pct = totalMes > 0 ? Math.round((total / totalMes) * 100) : 0
                const aberta = !!abertas[categoria]
                return (
                  <Fragment key={categoria}>
                    <tr onClick={() => alternar(categoria)} style={{ cursor: 'pointer' }} title="Clique para ver os gastos desta categoria">
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 10, color: 'var(--text3)', width: 10 }}>{aberta ? '▼' : '▶'}</span>
                          <div>
                            <div style={{ fontWeight: 500 }}>
                              {categoria}
                              {statusT === 'estourou' && <span className="badge badge-red" style={{ marginLeft: 8, fontSize: 10 }}>estourou o teto</span>}
                              {statusT === 'perto' && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 10 }}>{Math.round((total / teto) * 100)}% do teto</span>}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                              {itens.length} {itens.length === 1 ? 'gasto' : 'gastos'}
                              {teto > 0 && ` · teto ${fmtK(teto)}`}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(total)}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="prog-bar" style={{ flex: 1 }}>
                            <div className="prog-fill" style={{ width: pct + '%', background: 'var(--blue)' }} />
                          </div>
                          <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 28 }}>{pct}%</span>
                        </div>
                      </td>
                    </tr>
                    {aberta && (
                      <tr>
                        <td colSpan={3} style={{ padding: 0, background: 'var(--bg3)' }}>
                          <table>
                            <tbody>
                              {itens.map((it, i) => (
                                <tr key={i}>
                                  <td style={{ paddingLeft: 38, background: 'transparent' }}>
                                    <div style={{ fontWeight: 500, fontSize: 13 }}>{it.nome}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                                      {[it.sub, it.origem, it.detalhe].filter(Boolean).join(' · ')}
                                    </div>
                                  </td>
                                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, background: 'transparent', width: 130 }}>
                                    {fmt(it.valor)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        )}
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
