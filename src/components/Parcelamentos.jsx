import { useState, Fragment } from 'react'
import { calendarioQuitacao, terminandoLogo, simularQuitacao } from '../lib/parcelamentos'
import { compilar } from '../lib/filtro'
import { CampoBusca, ResumoFiltro } from './FiltroLista'
import { fmtK, fmt, mesLabel, nowYM, gerarParcelas, valorParcelaBase, tituloCompra, subtituloCompra } from '../lib/utils'
import Selo from './ui/Selo'
import Indicador from './ui/Indicador'
import EstadoVazio from './ui/EstadoVazio'
import { Lista, ItemLista } from './ui/Lista'

export default function Parcelamentos({ store }) {
  const { compras, cartoes, pessoas } = store
  const mes = nowYM()
  const [busca, setBusca] = useState('')
  const [filtroCartao, setFiltroCartao] = useState('')
  const [agrupar, setAgruparEstado] = useState(() => { try { const v = localStorage.getItem('parcelamentos_agrupar'); return ['pessoa', 'categoria', 'cartao'].includes(v) ? v : 'pessoa' } catch { return 'pessoa' } })
  const setAgrupar = (v) => { setAgruparEstado(v); try { localStorage.setItem('parcelamentos_agrupar', v) } catch { /* sem armazenamento: não lembra */ } }
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
  function agruparPor(chave) {
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
  const porCartao = agruparPor((c) => cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão')
  const porCategoria = agruparPor((c) => c.categoria || 'Sem categoria')

  // Tabela de resumo com total e % do restante (usada por cartão e por categoria).
  function TabelaResumo({ titulo, rotulo, linhas, badge }) {
    if (!linhas.length) return null
    const tot = linhas.reduce((t, l) => ({ qtd: t.qtd + l.qtd, doMes: t.doMes + l.doMes, restante: t.restante + l.restante }), { qtd: 0, doMes: 0, restante: 0 })
    const pct = (v) => (baseFiltrada > 0 ? Math.round((v / baseFiltrada) * 1000) / 10 : 0)
    return (
      <>
        {titulo && <div className="section-label">{titulo}</div>}
        <Lista rotulo={`Parcelamentos por ${rotulo.toLowerCase()}`}>
          {linhas.map(({ nome, qtd, doMes, restante }) => (
            <ItemLista key={nome} titulo={badge ? <Selo tom="neutro">{nome}</Selo> : nome} valor={fmt(restante)}
              meta={<span>{qtd} {qtd === 1 ? 'compra ativa' : 'compras ativas'} · {fmt(doMes)} no mês · {pct(restante).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}% do total</span>}>
              <div className="prog-bar il-barra" aria-hidden="true"><div className="prog-fill" style={{ width: pct(restante) + '%', background: 'var(--amber)' }} /></div>
            </ItemLista>
          ))}
          <ItemLista titulo="Total" valor={fmt(tot.restante)} meta={<span>{tot.qtd} {tot.qtd === 1 ? 'compra' : 'compras'} · {fmt(tot.doMes)} no mês</span>} />
        </Lista>
      </>
    )
  }

  // Como as compras são agrupadas na lista: por pessoa (padrão), por categoria ou por cartão.
  const nomeCartao = (c) => cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão'
  const chaveDoGrupo = (c) => (agrupar === 'categoria' ? c.categoria || 'Sem categoria' : agrupar === 'cartao' ? nomeCartao(c) : c.pessoa)
  const ROTULO_AGRUPAR = { pessoa: 'Pessoa', categoria: 'Categoria', cartao: 'Cartão' }

  function renderGrupo(chave) {
    const pessoa = chave // (nome do grupo: pessoa, categoria ou cartão, conforme o agrupamento)
    const lista = filtradas.filter((c) => chaveDoGrupo(c) === chave)
    if (!lista.length) return null
    return (
      <div key={pessoa}>
        <button className="section-label" onClick={() => setRecolhidas((r) => ({ ...r, [agrupar + '|' + pessoa]: !r[agrupar + '|' + pessoa] }))} aria-expanded={!recolhidas[agrupar + '|' + pessoa]}
          style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
          <span style={{ fontSize: 10, width: 10 }}>{recolhidas[agrupar + '|' + pessoa] ? '▶' : '▼'}</span>
          <span>{pessoa}</span>
          <span style={{ marginLeft: 'auto', textTransform: 'none', letterSpacing: 0 }}>
            {lista.length} compra{lista.length > 1 ? 's' : ''} · {fmt(lista.reduce((t, c) => t + valorParcelaBase(c), 0))}/mês · restam {fmt(lista.reduce((t, c) => t + valoresDe(c).restante, 0))}
          </span>
        </button>
        {!recolhidas[agrupar + '|' + pessoa] && <div className="card">
          <Lista rotulo={`Parcelamentos de ${pessoa}`}>
            {lista.map((c) => {
              const cartao = cartoes.find((x) => x.id === c.cartao_id)
              const ps = gerarParcelas(c, cartoes)
              const total = Number(c.parcelas)
              const pagas = ps.filter((p) => p.mes < mes).length
              const pct = Math.round((pagas / total) * 100)
              const valorRest = ps.filter((p) => p.mes >= mes).reduce((s, p) => s + p.valor, 0)
              const termino = ps[ps.length - 1]?.mes || ''
              const mesesLeft = termino ? Math.round((new Date(termino + '-15') - new Date()) / (1000 * 60 * 60 * 24 * 30)) : 0
              const tomT = mesesLeft <= 2 ? 'ok' : mesesLeft <= 6 ? 'aviso' : 'info'
              const aberto = simulando === c.id
              return (
                <ItemLista key={c.id} titulo={tituloCompra(c)} valor={fmt(valorRest)}
                  selos={termino ? <Selo tom={tomT}>termina {mesLabel(termino)}</Selo> : null}
                  meta={<>
                    <span>{fmt(valorParcelaBase(c))}/mês · {pagas}/{total} pagas</span>
                    {agrupar !== 'pessoa' && <span>{c.pessoa}</span>}
                    {agrupar !== 'cartao' && <span>{cartao?.nome || 'sem cartão'}</span>}
                    {agrupar !== 'categoria' && <span>{c.categoria}</span>}
                  </>}
                  acoes={<button className="btn btn-ghost btn-sm" onClick={() => { setSimulando(aberto ? null : c.id); setValorBanco('') }} aria-expanded={aberto}>Quitar?<span className="so-leitor"> {tituloCompra(c)}</span></button>}>
                  <div className="prog-bar il-barra" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pagas} de ${total} parcelas pagas`}>
                    <div className="prog-fill" style={{ width: pct + '%', background: pct >= 80 ? 'var(--green)' : pct >= 40 ? 'var(--amber)' : 'var(--blue)' }} />
                  </div>
                  {subtituloCompra(c) && <div className="fch-nota">no cartão: {subtituloCompra(c)}</div>}
                  {c.obs && <div className="fch-nota">{c.obs}</div>}
                  {aberto && (() => {
                    const sim = simularQuitacao(c, cartoes, mes, lerValor(valorBanco))
                    return (
                      <div className="fx-meses">
                        <p>
                          Quitar <b>{tituloCompra(c)}</b> agora: faltam <b>{sim.parcelasRestantes}</b> parcela{sim.parcelasRestantes > 1 ? 's' : ''} ({fmt(sim.restante)} somando tudo, até {mesLabel(sim.ultimoMes)}).
                          Depois disso, <b>{fmt(sim.libera)}</b> deixa de sair todo mês.
                        </p>
                        <div className="form-group il-banco">
                          <label htmlFor={`banco-${c.id}`}>Quanto o banco/loja cobra para quitar hoje (R$, opcional):</label>
                          <input id={`banco-${c.id}`} value={valorBanco} onChange={(e) => setValorBanco(e.target.value)} placeholder="ex.: 950,00" inputMode="decimal" />
                        </div>
                        {sim.economia != null && (
                          <div className={`alert alert-${sim.economia > 0 ? 'green' : 'amber'}`}>
                            {sim.economia > 0
                              ? <>Quitando por {fmt(sim.valorBanco)} você <b>economiza {fmt(sim.economia)}</b> ({String(sim.descontoPct).replace('.', ',')}% do que falta) — são os juros que deixa de pagar.</>
                              : sim.economia === 0 ? <>Esse valor é igual ao que falta: quitar não economiza nada, só libera o fluxo mais cedo.</>
                                : <>Esse valor é <b>{fmt(Math.abs(sim.economia))} maior</b> que o que falta nas parcelas: não compensa quitar assim.</>}
                          </div>
                        )}
                        <div className="fch-nota">O app não sabe os juros embutidos nas parcelas; peça ao banco o valor de quitação antecipada (por lei, os juros futuros saem do valor).</div>
                      </div>
                    )
                  })()}
                </ItemLista>
              )
            })}
            <ItemLista titulo={`Total de ${pessoa} (${lista.length})`} valor={fmt(lista.reduce((t, c) => t + valoresDe(c).restante, 0))} meta={<span>{fmt(lista.reduce((t, c) => t + valorParcelaBase(c), 0))}/mês</span>} />
          </Lista>
        </div>}
      </div>
    )
  }

  return (
    <div className="page">
      <div className="indicadores">
        <Indicador rotulo="Dívida total restante" valor={fmtK(totalRestante)} tom="erro" />
        <Indicador rotulo="Parcelas ativas" valor={ativas.length} tom="info" />
        <Indicador rotulo="Comprometido este mês" valor={fmtK(totalMes)} tom="aviso" />
      </div>

      {ativas.length > 0 && (
        <div className="toolbar">
          <CampoBusca valor={busca} onChange={setBusca} />
          <select value={filtroCartao} onChange={(e) => setFiltroCartao(e.target.value)} aria-label="Filtrar por cartão">
            <option value="">Todos os cartões</option>
            {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text3)' }} title="Sua escolha fica salva neste aparelho e vira o padrão">
            Agrupar por
            {Object.entries(ROTULO_AGRUPAR).map(([k, n]) => (
              <button key={k} className={`btn btn-sm ${agrupar === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setAgrupar(k)} aria-pressed={agrupar === k}>{n}</button>
            ))}
          </span>
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
        <EstadoVazio titulo="Nenhum parcelamento ativo" texto="As compras parceladas aparecem aqui automaticamente." />
      )}

      {filtroAtivo && filtradas.length === 0 && <EstadoVazio titulo="Nenhum parcelamento com esses filtros" texto="Tente outro termo ou limpe os filtros." acao="Limpar filtros" aoClicar={() => { setBusca(''); setFiltroCartao('') }} />}
      {agrupar === 'pessoa' ? (
        <>
          {pessoas.map((p) => renderGrupo(p.nome))}
          {/* Compras de quem não está (mais) na lista de pessoas: aparecem aqui para os totais do topo fecharem. */}
          {[...new Set(filtradas.map((c) => c.pessoa))]
            .filter((nome) => !pessoas.some((p) => p.nome === nome))
            .map((nome) => renderGrupo(nome))}
        </>
      ) : (
        // categoria / cartão: do grupo com mais dívida restante para o menor
        agrupar === 'categoria' ? porCategoria.map((g) => renderGrupo(g.nome)) : porCartao.map((g) => renderGrupo(g.nome))
      )}
    </div>
  )
}
