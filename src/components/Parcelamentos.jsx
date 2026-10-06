import { useState } from 'react'
import { compilar } from '../lib/filtro'
import { CampoBusca, ResumoFiltro } from './FiltroLista'
import { fmtK, fmt, mesLabel, nowYM, gerarParcelas, valorParcelaBase, tituloCompra, subtituloCompra } from '../lib/utils'

export default function Parcelamentos({ store }) {
  const { compras, cartoes, pessoas } = store
  const mes = nowYM()
  const [busca, setBusca] = useState('')
  const [filtroCartao, setFiltroCartao] = useState('')

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
        <div className="section-label">{titulo}</div>
        <div className="card">
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
        <div className="section-label">{pessoa}</div>
        <div className="card">
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
                  <tr key={c.id}>
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
                  </tr>
                )
              })}
              <tr style={{ fontWeight: 600, borderTop: '1px solid var(--border)' }}>
                <td colSpan={3}>Total de {pessoa} ({lista.length})</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lista.reduce((t, c) => t + valorParcelaBase(c), 0))}</td>
                <td />
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(lista.reduce((t, c) => t + valoresDe(c).restante, 0))}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
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
      {ativas.length === 0 ? (
        <div className="empty">
          Nenhum parcelamento ativo.{'\n'}As compras parceladas aparecem aqui automaticamente.
        </div>
      ) : (
        <>
          {filtroAtivo && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Os resumos abaixo consideram só o que combina com a busca/filtro.</div>}
          {TabelaResumo({ titulo: 'dívida restante por cartão', rotulo: 'Cartão', linhas: porCartao, badge: true })}
          {TabelaResumo({ titulo: 'dívida restante por categoria', rotulo: 'Categoria', linhas: porCategoria })}
        </>
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
