import { useState, Fragment } from 'react'
import { calendarioQuitacao, terminandoLogo, simularQuitacao } from '../lib/parcelamentos'
import { compilar } from '../lib/filtro'
import { CampoBusca, ResumoFiltro } from './FiltroLista'
import { fmtK, fmt, mesLabel, nowYM, gerarParcelas, valorParcelaBase, tituloCompra, subtituloCompra } from '../lib/utils'

export default function Parcelamentos({ store }) {
  const { compras, cartoes, pessoas } = store
  const mes = nowYM()
  const [busca, setBusca] = useState('')
  const [filtroCartao, setFiltroCartao] = useState('')
  const [analise, setAnalise] = useState('') // '' = análises recolhidas | 'calendario' | 'cartao' | 'categoria'
  const [acabamAberto, setAcabamAberto] = useState(false)
  const [recolhidas, setRecolhidas] = useState({}) // pessoas com a lista recolhida
  const [simulando, setSimulando] = useState(null) // id da compra com a simulação de quitação aberta
  const [valorBanco, setValorBanco] = useState('')

  // Só compras parceladas (2x ou mais): uma compra à vista deste mês não é um parcelamento em andamento.
  const ativas = compras.filter((c) => Number(c.parcelas) > 1 && gerarParcelas(c, cartoes).some((p) => p.mes >= mes))
  const totalRestante = ativas.reduce((s, c) =>
    s + gerarParcelas(c, cartoes).filter((p) => p.mes >= mes).reduce((ss, p) => ss + p.valor, 0), 0)
  const totalMes = ativas.reduce((s, c) =>
    s + gerarParcelas(c, cartoes).filter((p) => p.mes === mes).reduce((ss, p) => ss + p.valor, 0), 0)

  const { combina } = compilar(busca)
  const filtroAtivo = !!(busca.trim() || filtroCartao)
  const filtradas = ativas.filter((c) =>
    (!filtroCartao || c.cartao_id === filtroCartao) &&
    combina({
      texto: [c.descricao, c.identificacao, c.categoria, c.subcategoria, c.obs, c.pessoa, cartoes.find((x) => x.id === c.cartao_id)?.nome].filter(Boolean).join(' '),
      valor: [Number(c.valor_total), valorParcelaBase(c)],
      data: c.data_compra,
    }))

  const calendario = calendarioQuitacao(compras, cartoes, mes, 12)
  const maxCal = Math.max(1, ...calendario.map((m) => m.total))
  const acabamLogo = terminandoLogo(compras, cartoes, mes, 2)
  const liberaTotal = acabamLogo.reduce((t, a) => t + a.libera, 0)
  const lerValor = (t) => { const n = Number(String(t).trim().replace(/\./g, '').replace(',', '.')); return String(t).trim() && Number.isFinite(n) && n >= 0 ? n : null }

  // Restante (do mês atual em diante) e parcela do mês de cada compra, para os resumos e os totais.
  const valoresDe = (c) => {
    const ps = gerarParcelas(c, cartoes)
    return { restante: ps.filter((p) => p.mes >= mes).reduce((t, p) => t + p.valor, 0), doMes: ps.filter((p) => p.mes === mes).reduce((t, p) => t + p.valor, 0) }
  }
  const baseFiltrada = filtradas.reduce((t, c) => t + valoresDe(c).restante, 0)
  function agrupar(chave) {
    const mapa = {}
    filtradas.forEach((c) => {
      const k = chave(c)
      const v = valoresDe(c)
      if (!mapa[k]) mapa[k] = { nome: k, restante: 0, doMes: 0, qtd: 0 }
      mapa[k].restante += v.restante
      mapa[k].doMes += v.doMes
      mapa[k].qtd += 1
    })
    return Object.values(mapa).sort((x, y) => y.restante - x.restante)
  }
  const porCartao = agrupar((c) => cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão')
  const porCategoria = agrupar((c) => c.categoria || 'Sem categoria')

  // Tabela de resumo com total e % do restante (usada por cartão e por categoria).
  function TabelaResumo({ titulo, rotulo, linhas, badge }) {
    if (!linhas.length) return null
    const tot = linhas.reduce((t, l) => ({ qtd: t.qtd + l.qtd, doMes: t.doMes + l.doMes, restante: t.restante + l.restante }), { qtd: 0, doMes: 0, restante: 0 })
    const pct = (v) => (baseFiltrada > 0 ? Math.round((v / baseFiltrada) * 1000) / 10 : 0)
    return (
      <>
        {titulo && <div className="section-label">{titulo}</div>}
        <div className={titulo ? 'card' : undefined} style={titulo ? undefined : { overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>{rotulo}</th>
                <th style={{ textAlign: 'center' }}>Compras ativas</th>
                <th style={{ textAlign: 'right' }}>Parcela do mês</th>
                <th style={{ textAlign: 'right' }}>Restante</th>
                <th style={{ textAlign: 'right' }}>% do total</th>
                <th>Participação</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ nome, qtd, doMes, restante }) => (
                <tr key={nome}>
                  <td>{badge ? <span className="badge badge-gray">{nome}</span> : nome}</td>
                  <td style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 13 }}>{qtd}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(doMes)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(restante)}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{pct(restante).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</td>
                  <td>
                    <div className="prog-bar" style={{ minWidth: 80 }}>
                      <div className="prog-fill" style={{ width: pct(restante) + '%', background: 'var(--amber)' }} />
                    </div>
                  </td>
                </tr>
              ))}
              <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border)' }}>
                <td>Total</td>
                <td style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 13 }}>{tot.qtd}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(tot.doMes)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(tot.restante)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>100%</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </>
    )
  }

  function renderGrupo(pessoa) {
    const lista = filtradas.filter((c) => c.pessoa === pessoa)
    if (!lista.length) return null
    return (
      <div key={pessoa}>
        <button className="section-label" onClick={() => setRecolhidas((r) => ({ ...r, [pessoa]: !r[pessoa] }))} aria-expanded={!recolhidas[pessoa]}
          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ fontSize: 10, width: 10 }}>{recolhidas[pessoa] ? '▶' : '▼'}</span>
          <span>{pessoa}</span>
          <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>
            {lista.length} compra{lista.length > 1 ? 's' : ''} · {fmt(lista.reduce((t, c) => t + valorParcelaBase(c), 0))}/mês · restam {fmt(lista.reduce((t, c) => t + valoresDe(c).restante, 0))}
          </span>
        </button>
        {!recolhidas[pessoa] && <div className="card">
          <table>
            <thead>
              <tr>
                <th>Compra</th>
                <th>Cartão</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Parcela</th>
                <th style={{ width: 130, textAlign: 'center' }}>Progresso</th>
                <th style={{ textAlign: 'right' }}>Restante</th>
                <th style={{ textAlign: 'center' }}>Término</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const cartao = cartoes.find((x) => x.id === c.cartao_id)
                const ps = gerarParcelas(c, cartoes)
                const total = Number(c.parcelas)
                const pagas = ps.filter((p) => p.mes < mes).length
                const pct = Math.round((pagas / total) * 100)
                const valorRest = ps.filter((p) => p.mes >= mes).reduce((s, p) => s + p.valor, 0)
                const termino = ps[ps.length - 1]?.mes || ''
                const mesesLeft = termino
                  ? Math.round((new Date(termino + '-15') - new Date()) / (1000 * 60 * 60 * 24 * 30))
                  : 0
                const badgeT = mesesLeft <= 2 ? 'badge-green' : mesesLeft <= 6 ? 'badge-amber' : 'badge-blue'

                return (
                  <Fragment key={c.id}>
                  <tr>
                    <td>
                      <div style={{ fontWeight: 500 }}>{tituloCompra(c)}</div>
                      {subtituloCompra(c) && <div style={{ fontSize: 11, color: 'var(--text3)' }}>no cartão: {subtituloCompra(c)}</div>}
                      {c.obs && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.obs}</div>}
                    </td>
                    <td><span className="badge badge-gray">{cartao?.nome || '—'}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>{c.categoria}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>
                      {fmt(valorParcelaBase(c))}
                    </td>
                    <td style={{ padding: '11px 14px' }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', marginBottom: 3 }}>
                        {pagas} / {total}
                      </div>
                      <div className="prog-bar">
                        <div className="prog-fill" style={{
                          width: pct + '%',
                          background: pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--blue)'
                        }} />
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(valorRest)}</td>
                    <td style={{ textAlign: 'center' }}>
                      {termino ? <span className={`badge ${badgeT}`}>{mesLabel(termino)}</span> : '—'}
                    </td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => { setSimulando(simulando === c.id ? null : c.id); setValorBanco('') }} aria-expanded={simulando === c.id}>Quitar?</button></td>
                  </tr>
                  {simulando === c.id && (() => {
                    const sim = simularQuitacao(c, cartoes, mes, lerValor(valorBanco))
                    return (
                      <tr>
                        <td colSpan={8} style={{ background: 'var(--bg3)', padding: '12px 16px' }}>
                          <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                            Quitar <b>{tituloCompra(c)}</b> agora: faltam <b>{sim.parcelasRestantes}</b> parcela{sim.parcelasRestantes > 1 ? 's' : ''} ({fmt(sim.restante)} somando tudo, até {mesLabel(sim.ultimoMes)}).
                            Depois disso, <b>{fmt(sim.libera)}</b> deixa de sair todo mês.
                          </div>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
                            <label style={{ fontSize: 12, color: 'var(--text2)' }}>Quanto o banco/loja cobra para quitar hoje (R$, opcional):</label>
                            <input value={valorBanco} onChange={(e) => setValorBanco(e.target.value)} placeholder="ex.: 950,00" style={{ width: 130 }} inputMode="decimal" />
                          </div>
                          {sim.economia != null && (
                            <div className={`alert alert-${sim.economia > 0 ? 'green' : 'amber'}`} style={{ marginTop: 10, marginBottom: 0 }}>
                              {sim.economia > 0
                                ? <>Quitando por {fmt(sim.valorBanco)} você <b>economiza {fmt(sim.economia)}</b> ({String(sim.descontoPct).replace('.', ',')}% do que falta) — são os juros que deixa de pagar.</>
                                : sim.economia === 0 ? <>Esse valor é igual ao que falta: quitar não economiza nada, só libera o fluxo mais cedo.</>
                                  : <>Esse valor é <b>{fmt(Math.abs(sim.economia))} maior</b> que o que falta nas parcelas: não compensa quitar assim.</>}
                            </div>
                          )}
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>O app não sabe os juros embutidos nas parcelas; peça ao banco o valor de quitação antecipada (por lei, os juros futuros saem do valor).</div>
                        </td>
                      </tr>
                    )
                  })()}
                  </Fragment>
                )
              })}
              <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border)' }}>
                <td colSpan={3}>Total de {pessoa} ({lista.length})</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lista.reduce((t, c) => t + valorParcelaBase(c), 0))}</td>
                <td />
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lista.reduce((t, c) => t + valoresDe(c).restante, 0))}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Dívida total restante</div>
          <div className="metric-val red">{fmtK(totalRestante)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Parcelas ativas</div>
          <div className="metric-val blue">{ativas.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Comprometido este mês</div>
          <div className="metric-val amber">{fmtK(totalMes)}</div>
        </div>
      </div>

      {ativas.length > 0 && (
        <div className="toolbar">
          <CampoBusca valor={busca} onChange={setBusca} />
          <select value={filtroCartao} onChange={(e) => setFiltroCartao(e.target.value)} aria-label="Filtrar por cartão">
            <option value="">Todos os cartões</option>
            {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
      )}
      <ResumoFiltro ativo={filtroAtivo} mostrando={filtradas.length} total={ativas.length} onLimpar={() => { setBusca(''); setFiltroCartao('') }} />

      {acabamLogo.length > 0 && (
        <div className="alert alert-green" style={{ padding: '9px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span>
              <b>{acabamLogo.length === 1 ? '1 parcelamento acaba' : `${acabamLogo.length} parcelamentos acabam`}</b> em até 2 meses — libera <b>{fmt(liberaTotal)}</b>/mês
            </span>
            <button className="link-btn" onClick={() => setAcabamAberto((v) => !v)} aria-expanded={acabamAberto}>{acabamAberto ? 'ocultar' : 'ver quais'}</button>
          </div>
          {acabamAberto && acabamLogo.map((a) => (
            <div key={a.compra.id} style={{ fontSize: 12, marginTop: 4 }}>
              · {tituloCompra(a.compra)} — {a.mesesRestantes === 0 ? 'última parcela este mês' : `termina em ${mesLabel(a.termino)}`} ({a.parcelasRestantes} parcela{a.parcelasRestantes > 1 ? 's' : ''}) · libera {fmt(a.libera)}/mês
            </div>
          ))}
        </div>
      )}

      {ativas.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'visible' }}>
          <button
            onClick={() => setAnalise(analise ? '' : 'calendario')} aria-expanded={!!analise}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'transparent', color: 'var(--text)', textAlign: 'left', fontSize: 13 }}
          >
            <span style={{ fontSize: 10, color: 'var(--text3)', width: 10 }}>{analise ? '▼' : '▶'}</span>
            <span style={{ fontWeight: 500 }}>Análises</span>
            <span style={{ color: 'var(--text3)', fontSize: 12 }}>calendário de quitação · por cartão · por categoria</span>
          </button>
          {analise && (
            <div style={{ padding: '0 16px 14px', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                {[['calendario', 'Próximos 12 meses'], ['cartao', 'Por cartão'], ['categoria', 'Por categoria']].map(([k, n]) => (
                  <button key={k} className={`btn btn-sm ${analise === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAnalise(k)}>{n}</button>
                ))}
              </div>
              {analise === 'calendario' && (
                <div>
                  {calendario.map((m, i) => {
                    const anterior = i > 0 ? calendario[i - 1].total : null
                    const dif = anterior == null ? null : Math.round((m.total - anterior) * 100) / 100
                    return (
                      <div key={m.mes} style={{ display: 'grid', gridTemplateColumns: '70px 1fr 110px 130px', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <span className="mono" style={{ color: 'var(--text3)' }}>{mesLabel(m.mes)}</span>
                        <div className="prog-bar"><div className="prog-fill" style={{ width: (m.total / maxCal) * 100 + '%', background: 'var(--amber)' }} /></div>
                        <span className="mono" style={{ textAlign: 'right' }}>{fmt(m.total)}</span>
                        <span style={{ fontSize: 11, color: m.terminam.length || dif < 0 ? 'var(--green)' : 'var(--text3)' }}>
                          {m.terminam.length ? `acaba: ${m.terminam.map((c) => tituloCompra(c)).join(', ').slice(0, 40)}` : dif ? `${dif < 0 ? '↓' : '↑'} ${fmt(Math.abs(dif))}` : ''}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
              {analise !== 'calendario' && filtroAtivo && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Considera só o que combina com a busca/filtro.</div>}
              {analise === 'cartao' && TabelaResumo({ titulo: null, rotulo: 'Cartão', linhas: porCartao, badge: true })}
              {analise === 'categoria' && TabelaResumo({ titulo: null, rotulo: 'Categoria', linhas: porCategoria })}
            </div>
          )}
        </div>
      )}

      {ativas.length === 0 && (
        <div className="empty">
          Nenhum parcelamento ativo.{'\n'}As compras parceladas aparecem aqui automaticamente.
        </div>
      )}

      {filtroAtivo && filtradas.length === 0 && <div className="empty">Nenhum parcelamento com esses filtros.{'\n'}Tente outro termo ou clique em "Limpar filtros".</div>}
      {pessoas.map((p) => renderGrupo(p.nome))}
      {/* Compras de quem não está (mais) na lista de pessoas: aparecem aqui para os totais do topo fecharem. */}
      {[...new Set(filtradas.map((c) => c.pessoa))]
        .filter((nome) => !pessoas.some((p) => p.nome === nome))
        .map((nome) => renderGrupo(nome))}
    </div>
  )
}
