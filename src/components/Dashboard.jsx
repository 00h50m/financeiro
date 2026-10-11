import { useState, useMemo, Fragment } from 'react'
import { serieMensal } from '../lib/evolucao'
import { fmt, fmtK, mesLabel, nowYM, addMonths, gerarParcelas, corPessoa, corPessoaCss, fixosAtivos, gastosPorCategoria, statusTeto, nomeCasa, donoDoFixo, hojeSP } from '../lib/utils'
import { resumoDoMes, lerUsarSaldoAnterior } from '../lib/financeiro'
import { comprasLiquidas, fixosLiquidos } from '../lib/divisoes'
import { riscosDoMes, mesFechado } from '../lib/fechamento'
import { pendenciasValorVariavel } from '../lib/fixosVariaveis'
import { montarResumoMensal, textoDoResumo } from '../lib/resumoMensal'
import Secao from './Secao'
import NavMes from './NavMes'

export default function Dashboard({ store, irPara }) {
  const { compras, cartoes, fixos, pessoas, orcamentos } = store
  const [mes, setMes] = useState(nowYM())
  const [secoes, setSecoes] = useState({ pessoa: false, proj: false }) // seção → aberta (sem valor: aberta)
  const aberta = (k) => secoes[k] !== false && (secoes[k] === true || !(k in { pessoa: 1, proj: 1 }))
  const alt = (k) => () => setSecoes((m) => ({ ...m, [k]: !aberta(k) }))
  const [abertas, setAbertas] = useState({})
  const [resumo, setResumo] = useState(null) // resumo do mês (modal): dados estruturados
  const [copiado, setCopiado] = useState(false)
  const alternar = (categoria) => setAbertas((a) => ({ ...a, [categoria]: !a[categoria] }))

  // Mesma conta da aba Pagamentos (motor financeiro único), para os números baterem.
  const usarSaldoAnterior = lerUsarSaldoAnterior()
  const cacheDetalhes = new Map()
  const resumoDe = (m) => resumoDoMes(store, m, { usarSaldoAnterior, cacheDetalhes })
  const resumoMes = resumoDe(mes)
  const totalMes = resumoMes.comprometido

  const totalFixos = fixosAtivos(fixos, mes).reduce((s, f) => s + Number(f.valor), 0)
  const totalParc = compras
    .flatMap((c) => gerarParcelas(c, cartoes).filter((p) => p.mes === mes))
    .reduce((s, p) => s + p.valor, 0)

  const renda = resumoMes.renda
  const saldo = resumoMes.sobraProjetada
  const pct = renda > 0 ? Math.min(999, Math.round((totalMes / renda) * 100)) : 0

  const meses6 = Array.from({ length: 6 }, (_, i) => addMonths(mes, i)).map((m) => {
    const r = resumoDe(m)
    return { mes: m, compromisso: r.comprometido, renda: r.renda, saldo: r.sobraDoMes }
  })

  // Parcelamentos e fixos de cada pessoa. Fixo sem pessoa é da Casa. Quem aparece nos dados mas não está
  // cadastrado (nome antigo, por exemplo) ganha a própria linha, para os totais sempre fecharem.
  const parcPorPessoa = {}
  compras.forEach((c) => {
    const v = gerarParcelas(c, cartoes).filter((p) => p.mes === mes).reduce((t, p) => t + p.valor, 0)
    if (v) parcPorPessoa[c.pessoa] = (parcPorPessoa[c.pessoa] || 0) + v
  })
  const fixPorPessoa = {}
  fixosAtivos(fixos, mes).forEach((f) => {
    const dono = donoDoFixo(f, pessoas)
    fixPorPessoa[dono] = (fixPorPessoa[dono] || 0) + Number(f.valor)
  })
  const nomesPessoas = [...new Set([...pessoas.map((p) => p.nome), nomeCasa(pessoas), ...Object.keys(parcPorPessoa), ...Object.keys(fixPorPessoa)])]
  const gastoPessoa = nomesPessoas.map((pessoa) => {
    const parc = parcPorPessoa[pessoa] || 0
    const fix = fixPorPessoa[pessoa] || 0
    return { pessoa, parc, fix, total: parc + fix }
  })
  const totalGeralPessoas = gastoPessoa.reduce((t, g) => t + g.total, 0)

  const pendenciasVariaveis = pendenciasValorVariavel(fixos, hojeSP())
  const porCategoriaMap = gastosPorCategoria(comprasLiquidas(store), cartoes, fixosLiquidos(store), mes)
  const porCategoria = Object.entries(porCategoriaMap)
    .map(([categoria, { total, itens }]) => ({
      categoria,
      total,
      teto: Number(orcamentos.find((o) => o.categoria === categoria)?.valor) || 0,
      itens: [...itens].sort((a, b) => b.valor - a.valor),
    }))
    .sort((a, b) => b.total - a.total)

  const serie6 = useMemo(() => serieMensal(store, mes, 6), [store, mes])
  const mesAnterior = addMonths(mes, -1)
  const anteriorPorCategoria = gastosPorCategoria(comprasLiquidas(store), cartoes, fixosLiquidos(store), mesAnterior)
  const riscos = riscosDoMes(store, mes)
  const fechadoAtual = mesFechado(store.fechamentos, mes)

  const estouradas = porCategoria.filter((c) => statusTeto(c.total, c.teto) === 'estourou')
  const pertoDoTeto = porCategoria.filter((c) => statusTeto(c.total, c.teto) === 'perto')

  return (
    <div className="page">
      {resumo != null && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setResumo(null) }}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div className="modal-title">{resumo.titulo}</div>
            {resumo.vazio ? <div className="empty" style={{ padding: 24 }}>Ainda não há renda nem gastos neste mês.</div> : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
                  {resumo.kpis.map((k) => (
                    <div key={k.rotulo} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{k.rotulo}</div>
                      <div className="mono" style={{ fontSize: 17, marginTop: 4, color: k.tom === 'bom' ? 'var(--green)' : k.tom === 'ruim' ? 'var(--red)' : 'var(--text)' }}>{k.valor}</div>
                      {k.nota && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{k.nota}</div>}
                    </div>
                  ))}
                </div>
                {resumo.comparativo && <div style={{ fontSize: 13, color: resumo.comparativo.dif > 0 ? 'var(--amber)' : 'var(--green)', marginBottom: 12 }}>{resumo.comparativo.dif > 0 ? '↑' : resumo.comparativo.dif < 0 ? '↓' : '='} {resumo.comparativo.texto}</div>}
                {resumo.categorias.length > 0 && (
                  <>
                    <div className="section-label" style={{ margin: '4px 0 6px' }}>onde foi o dinheiro</div>
                    {resumo.categorias.map((c) => (
                      <div key={c.nome} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                        <span>{c.nome}</span><span className="mono">{fmt(c.valor)} <span style={{ color: 'var(--text3)' }}>· {String(c.pct).replace('.', ',')}%</span></span>
                      </div>
                    ))}
                  </>
                )}
                {resumo.avisos.map((a, i) => (
                  <div key={i} className={`alert alert-${a.tom === 'ruim' ? 'red' : a.tom === 'atencao' ? 'amber' : a.tom === 'bom' ? 'green' : 'blue'}`} style={{ marginTop: 10, marginBottom: 0, fontSize: 12 }}>{a.texto}</div>
                ))}
              </>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setResumo(null)}>Fechar</button>
              <button className="btn btn-primary" disabled={resumo.vazio} title="Copia como texto simples, pronto para colar no WhatsApp ou Telegram" onClick={async () => { try { await navigator.clipboard.writeText(textoDoResumo(resumo)); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { window.alert('Não consegui copiar automaticamente neste navegador.') } }}>{copiado ? 'Copiado ✓' : 'Copiar como texto'}</button>
            </div>
          </div>
        </div>
      )}

      <div className="pag-topo">
        <NavMes mes={mes} onChange={setMes} fechado={fechadoAtual} />
        <button className="btn btn-ghost btn-sm" onClick={() => setResumo(montarResumoMensal(store, mes, hojeSP()))}>Resumo do mês</button>
      </div>

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
          {renda > 0 && resumoMes.saldoAnterior !== 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              inclui {resumoMes.saldoAnterior > 0 ? '+' : '−'}{fmtK(Math.abs(resumoMes.saldoAnterior))} do mês anterior
            </div>
          )}
        </div>
        <div className="metric">
          <div className="metric-label">Já pago</div>
          <div className="metric-val green">{fmtK(resumoMes.pago)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Falta pagar</div>
          <div className="metric-val amber">{fmtK(resumoMes.aPagar)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Disponível hoje</div>
          <div className={`metric-val ${resumoMes.disponivel >= 0 ? 'blue' : 'red'}`}>{renda > 0 ? fmtK(resumoMes.disponivel) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>dinheiro que existe agora</div>
        </div>
        <div className="metric">
          <div className="metric-label">% da renda</div>
          <div className={`metric-val ${pct > 90 ? 'red' : pct > 70 ? 'amber' : 'green'}`}>
            {renda > 0 ? pct + '%' : '—'}
          </div>
        </div>
      </div>

      {riscos.length > 0 && (
        <Secao titulo="Atenção neste mês" info={`${riscos.length} ${riscos.length === 1 ? 'ponto' : 'pontos'}`} aberto={aberta('riscos')} onToggle={alt('riscos')}>
          <div style={{ padding: '4px 14px', borderTop: '1px solid var(--border)' }}>
            {riscos.map((r) => (
              <div key={r.texto} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                <span className={`badge ${r.nivel === 'alto' ? 'badge-red' : 'badge-amber'}`}>{r.nivel === 'alto' ? 'Alto' : 'Médio'}</span>
                <span style={{ flex: 1, fontSize: 13 }}>{r.texto}</span>
                {irPara && <button className="btn btn-ghost btn-sm" onClick={() => irPara(r.aba)}>Abrir</button>}
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="Distribuição por pessoa" info={mesLabel(mes)} destaque={fmt(totalParc + totalFixos)} aberto={aberta('pessoa')} onToggle={alt('pessoa')}>
        <table className="tabela-compacta">
          <thead>
            <tr>
              <th>Pessoa</th>
              <th className="col-opc" style={{ textAlign: 'right' }}>Parcelamentos</th>
              <th className="col-opc" style={{ textAlign: 'right' }}>Fixos</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th className="col-opc">Participação</th>
            </tr>
          </thead>
          <tbody>
            {gastoPessoa.map(({ pessoa, parc, fix, total }) => {
              const p2 = totalGeralPessoas > 0 ? Math.round((total / totalGeralPessoas) * 100) : 0
              return (
                <tr key={pessoa}>
                  <td>
                    <span className={`badge badge-${corPessoa(pessoas, pessoa)}`}>
                      {pessoa}
                    </span>
                    <div className="so-mobile">Parcelamentos {fmt(parc)} · Fixos {fmt(fix)} · {p2}% do total</div>
                  </td>
                  <td className="col-opc" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(parc)}</td>
                  <td className="col-opc" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(fix)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(total)}</td>
                  <td className="col-opc">
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
              <td style={{ color: 'var(--text2)' }}>Total</td>
              <td className="col-opc" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text2)' }}>{fmt(totalParc)}</td>
              <td className="col-opc" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text2)' }}>{fmt(totalFixos)}</td>
              <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text2)' }}>{fmt(totalParc + totalFixos)}</td>
              <td className="col-opc" />
            </tr>
          </tbody>
        </table>
      </Secao>

      {pendenciasVariaveis.length > 0 && (
        <div className="alert alert-amber" style={{ marginTop: 20 }}>
          <strong>{pendenciasVariaveis.length === 1 ? '1 conta de valor variável' : `${pendenciasVariaveis.length} contas de valor variável`} ainda com valor estimado:</strong>{' '}
          {pendenciasVariaveis.map((p) => `${p.fixo.nome} (${mesLabel(p.mes)}${p.tipo === 'vencida' ? `, venceu há ${p.diasAtraso} dia${p.diasAtraso > 1 ? 's' : ''}` : ''})`).join(' · ')}.{' '}
          <a href="#pagamentos" onClick={(e) => { e.preventDefault(); irPara?.('pagamentos') }} style={{ color: 'inherit', textDecoration: 'underline' }}>Informar em Pagamentos</a>
        </div>
      )}

      {estouradas.length > 0 && (
        <div className="alert alert-red" style={{ marginTop: 20 }}>
          <strong>{estouradas.length === 1 ? '1 categoria passou' : `${estouradas.length} categorias passaram`} do teto este mês:</strong>{' '}
          {estouradas.map((c) => `${c.categoria} (${fmtK(c.total)} de ${fmtK(c.teto)})`).join(' · ')}.{' '}
          <a href="#orcamento" onClick={(e) => { e.preventDefault(); irPara?.('orcamento') }} style={{ color: 'inherit', textDecoration: 'underline' }}>Ver orçamento</a>
        </div>
      )}

      {pertoDoTeto.length > 0 && (
        <div className="alert alert-amber" style={{ marginTop: 20 }}>
          <strong>{pertoDoTeto.length === 1 ? '1 categoria está' : `${pertoDoTeto.length} categorias estão`} perto do teto (80% ou mais):</strong>{' '}
          {pertoDoTeto.map((c) => `${c.categoria} (${fmtK(c.total)} de ${fmtK(c.teto)})`).join(' · ')}.
        </div>
      )}

      <Secao titulo="Gastos por categoria" info={mesLabel(mes)} destaque={fmt(totalMes)} aberto={aberta('cat')} onToggle={alt('cat')}>
        {porCategoria.length === 0 ? (
          <div className="empty">Nenhum gasto categorizado em {mesLabel(mes)} ainda.</div>
        ) : (
          <table className="tabela-compacta">
            <thead>
              <tr>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'right' }}>vs {mesLabel(mesAnterior)}</th>
                <th className="col-opc" style={{ textAlign: 'right' }} title="Compara com a média dos 5 meses anteriores ao atual">vs média (5 meses)</th>
                <th className="col-opc">Participação</th>
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
                              <span className="so-mobile" style={{ display: 'inline' }}>{` · ${pct}% do total`}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, whiteSpace: 'nowrap' }}>{fmt(total)}</td>
                      <td style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {(() => {
                          const ant = anteriorPorCategoria[categoria]?.total || 0
                          const dif = Math.round((total - ant) * 100) / 100
                          if (!ant) return <span style={{ color: 'var(--text3)' }}>novo</span>
                          if (Math.abs(dif) < 0.005) return <span style={{ color: 'var(--text3)' }}>igual</span>
                          return <span style={{ color: dif > 0 ? 'var(--red)' : 'var(--green)' }} title={`Mês anterior: ${fmt(ant)}`}>{dif > 0 ? '↑' : '↓'} {fmt(Math.abs(dif))} <span style={{ color: 'var(--text3)' }}>({Math.round((Math.abs(dif) / ant) * 100)}%)</span></span>
                        })()}
                      </td>
                      <td className="col-opc" style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap' }}>
                        {(() => {
                          const antes = serie6.slice(0, -1).map((l) => l.porCategoria?.[categoria] || 0)
                          const media = antes.reduce((t, v) => t + v, 0) / (antes.length || 1)
                          if (!(media >= 1)) return <span style={{ color: 'var(--text3)' }}>sem histórico</span>
                          const p = Math.round(((total - media) / media) * 100)
                          if (Math.abs(p) < 5) return <span style={{ color: 'var(--text3)' }} title={`Média: ${fmt(media)}`}>na média</span>
                          return <span style={{ color: p > 0 ? 'var(--red)' : 'var(--green)' }} title={`Média dos 5 meses anteriores: ${fmt(media)}`}>{p > 0 ? '↑' : '↓'} {Math.abs(p)}% <span style={{ color: 'var(--text3)' }}>({fmt(media)})</span></span>
                        })()}
                      </td>
                      <td className="col-opc">
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
                        <td colSpan={5} style={{ padding: 0, background: 'var(--bg3)' }}>
                          <div style={{ padding: '10px 14px 4px 38px', fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                            <span>Mês a mês:</span>
                            {serie6.map((l) => (
                              <span key={l.mes} style={{ color: l.mes === mes ? 'var(--text)' : undefined }}>
                                {mesLabel(l.mes)} <span className="mono">{fmtK(l.porCategoria?.[categoria] || 0)}</span>
                              </span>
                            ))}
                          </div>
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
      </Secao>

      <Secao titulo="Projeção" info="próximos 6 meses" aberto={aberta('proj')} onToggle={alt('proj')}>
        <table className="tabela-compacta">
          <thead>
            <tr>
              <th>Mês</th>
              <th style={{ textAlign: 'right' }}>Renda</th>
              <th style={{ textAlign: 'right' }}>Compromisso</th>
              <th style={{ textAlign: 'right' }}>Sobra do mês</th>
              <th className="col-opc" style={{ width: 100 }} />
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
                <td className="col-opc">
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
      </Secao>
    </div>
  )
}
