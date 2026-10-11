import { useMemo, useState } from 'react'
import { historicoPorCategoria, sugerirTetos } from '../lib/orcamentoSugestao'
import { comprasLiquidas, fixosLiquidos } from '../lib/divisoes'
import NavMes from './NavMes'
import { fmt, fmtK, mesLabel, nowYM, totalRenda, gastosPorCategoria, statusTeto } from '../lib/utils'

const ORDEM = { estourou: 0, perto: 1, ok: 2, sem: 3 }
const STATUS = {
  sem: { badge: 'badge-gray', texto: 'Sem teto', cor: 'var(--text3)' },
  ok: { badge: 'badge-green', texto: 'Dentro', cor: 'var(--green)' },
  perto: { badge: 'badge-amber', texto: 'Perto do teto', cor: 'var(--amber)' },
  estourou: { badge: 'badge-red', texto: 'Estourou', cor: 'var(--red)' },
}


export default function Orcamento({ store }) {
  const { compras, cartoes, fixos, divisoes, categorias, rendas, orcamentos, orcamentosOk, definirOrcamento, definirOrcamentos } = store
  const [mes, setMes] = useState(nowYM())
  const [rascunho, setRascunho] = useState({}) // categoria -> texto digitado, enquanto não salvou
  const [painel, setPainel] = useState(null) // sugestões abertas: [{ ...sugestão, marcada, valor }]
  const historico = useMemo(() => historicoPorCategoria({ ...store, compras: store.compras }, mes, 6), [store, mes])

  if (!orcamentosOk) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          <strong>Falta criar a tabela de orçamentos no banco.</strong> Rode o SQL da tabela <code>orcamentos</code> (arquivo{' '}
          <code>orcamentos.sql</code> do projeto) no SQL Editor do Supabase e recarregue esta página.
        </div>
      </div>
    )
  }

  const tetoDe = (cat) => Number(orcamentos.find((o) => o.categoria === cat)?.valor) || 0
  const gastos = gastosPorCategoria(comprasLiquidas({ compras, divisoes }), cartoes, fixosLiquidos({ fixos, divisoes }), mes)

  // Categorias cadastradas + qualquer categoria que apareça nos gastos (mesmo sem cadastro)
  const nomes = [...new Set([...categorias.map((c) => c.nome), ...Object.keys(gastos)])]
  const linhas = nomes
    .map((categoria) => {
      const gasto = gastos[categoria]?.total || 0
      const teto = tetoDe(categoria)
      return { categoria, gasto, teto, restante: teto - gasto, status: statusTeto(gasto, teto) }
    })
    .sort((a, b) => b.gasto - a.gasto || a.categoria.localeCompare(b.categoria))

  const totalTeto = linhas.reduce((s, l) => s + l.teto, 0)
  const gastoComTeto = linhas.filter((l) => l.teto > 0).reduce((s, l) => s + l.gasto, 0)
  const gastoSemTeto = linhas.filter((l) => !l.teto).reduce((s, l) => s + l.gasto, 0)
  const renda = totalRenda(rendas.find((r) => r.mes === mes))
  const estouradas = linhas.filter((l) => l.status === 'estourou').length

  function salvar(categoria) {
    const texto = rascunho[categoria]
    if (texto === undefined) return
    setRascunho((r) => { const n = { ...r }; delete n[categoria]; return n })
    const valor = texto.trim() === '' ? 0 : Number(texto)
    if (Number.isNaN(valor) || valor < 0) return
    if (valor !== tetoDe(categoria)) definirOrcamento(categoria, valor)
  }

  // Sugestões pelo histórico: abre um painel para revisar, editar e aplicar só o que fizer sentido.
  function abrirSugestoes() {
    const tetos = Object.fromEntries(orcamentos.map((o) => [o.categoria, Number(o.valor)]))
    const lista = sugerirTetos(historico, tetos).filter((s) => s.sugerido > 0)
    if (!lista.length) {
      alert('Ainda não há gastos nos meses anteriores a ' + mesLabel(mes) + ' para sugerir tetos.\n\nQuando houver pelo menos um mês de histórico, a sugestão aparece aqui.')
      return
    }
    setPainel(lista.map((s) => ({ ...s, valor: String(s.sugerido), marcada: !s.atual && !s.irregular })))
  }
  const mudarSugestao = (categoria, patch) => setPainel((l) => l.map((x) => (x.categoria === categoria ? { ...x, ...patch } : x)))
  function aplicarSugestoes() {
    const lista = painel.filter((s) => s.marcada && Number(s.valor) > 0).map((s) => ({ categoria: s.categoria, valor: Number(s.valor) }))
    if (!lista.length) return
    const sobrescreve = painel.filter((s) => s.marcada && s.atual).length
    if (sobrescreve && !confirm(`${sobrescreve} categoria${sobrescreve > 1 ? 's' : ''} já tem${sobrescreve > 1 ? 'em' : ''} teto e vai${sobrescreve > 1 ? 'ão' : ''} mudar. Continuar?`)) return
    definirOrcamentos(lista)
    setPainel(null)
  }

  return (
    <div className="page">
      <div className="pag-topo">
        <NavMes mes={mes} onChange={setMes} />
        <button className="btn btn-ghost btn-sm" onClick={abrirSugestoes}>Sugerir tetos pelo histórico</button>
      </div>

      {painel && (
        <div className="card" style={{ padding: 16, overflow: 'visible' }}>
          <div style={{ fontWeight: 500, marginBottom: 4 }}>Sugestão de tetos pelo histórico</div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.6 }}>
            Base: média dos 3 meses anteriores a {mesLabel(mes)} + 10% de folga, arredondada para cima de 10 em 10. Você pode editar cada valor. Por padrão só vêm marcadas as categorias <b>sem teto e com gasto regular</b>;
            as de gasto irregular (aparecem em menos de 2 dos 3 meses) ficam desmarcadas para você decidir.
          </div>
          <div className="orc-sug">
            {painel.map((s) => (
              <div key={s.categoria} className={`orc-sug-item ${s.marcada ? 'marcada' : ''}`}>
                <label className="orc-sug-topo">
                  <input type="checkbox" checked={s.marcada} onChange={(e) => mudarSugestao(s.categoria, { marcada: e.target.checked })} aria-label={`Aplicar sugestão para ${s.categoria}`} />
                  <span className="orc-sug-nome">{s.categoria}</span>
                  <input type="number" min="0" step="10" value={s.valor} onChange={(e) => mudarSugestao(s.categoria, { valor: e.target.value })} className="orc-sug-valor" aria-label={`Teto sugerido para ${s.categoria}`} />
                </label>
                <div className="orc-sug-linha">
                  <span>Teto atual <b className="mono">{s.atual ? fmt(s.atual) : '—'}</b></span>
                  <span>Média 3 meses <b className="mono">{fmt(s.media3)}</b></span>
                  <span>Maior mês <b className="mono">{fmt(s.maximo)}</b></span>
                </div>
                {s.nota && <div className="orc-sug-nota" style={{ color: s.irregular ? 'var(--amber)' : 'var(--text3)' }}>{s.nota}</div>}
              </div>
            ))}
          </div>
          {(() => {
            const marcadas = painel.filter((s) => s.marcada && Number(s.valor) > 0)
            const novoTotal = totalTeto - marcadas.reduce((t, s) => t + s.atual, 0) + marcadas.reduce((t, s) => t + Number(s.valor), 0)
            return (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 12 }}>
                <button className="btn btn-primary" onClick={aplicarSugestoes} disabled={!marcadas.length}>Aplicar {marcadas.length} teto{marcadas.length === 1 ? '' : 's'}</button>
                <button className="btn btn-ghost" onClick={() => setPainel(null)}>Cancelar</button>
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  Soma dos tetos ficaria em <b className="mono">{fmt(novoTotal)}</b>{renda > 0 && <> ({Math.round((novoTotal / renda) * 100)}% da renda de {mesLabel(mes)}{novoTotal > renda ? ' — acima da renda!' : ''})</>}
                </span>
              </div>
            )
          })()}
        </div>
      )}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Total dos tetos</div>
          <div className="metric-val blue">{totalTeto > 0 ? fmtK(totalTeto) : '—'}</div>
          {renda > 0 && totalTeto > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{Math.round((totalTeto / renda) * 100)}% da renda do mês</div>
          )}
        </div>
        <div className="metric">
          <div className="metric-label">Gasto (com teto)</div>
          <div className="metric-val amber">{fmtK(gastoComTeto)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Ainda pode gastar</div>
          <div className={`metric-val ${totalTeto - gastoComTeto >= 0 ? 'green' : 'red'}`}>
            {totalTeto > 0 ? fmtK(totalTeto - gastoComTeto) : '—'}
          </div>
        </div>
        <div className="metric">
          <div className="metric-label">Gasto sem teto</div>
          <div className="metric-val">{fmtK(gastoSemTeto)}</div>
        </div>
      </div>

      {estouradas > 0 && (
        <div className="alert alert-red">
          {estouradas === 1 ? '1 categoria estourou' : `${estouradas} categorias estouraram`} o teto em {mesLabel(mes)}.
        </div>
      )}

      <div className="orc-grade">
        {[...linhas].sort((x, y) => ORDEM[x.status] - ORDEM[y.status] || y.gasto - x.gasto).map((l) => {
          const pct = l.teto > 0 ? Math.round((l.gasto / l.teto) * 100) : 0
          const st = STATUS[l.status]
          const valorInput = rascunho[l.categoria] ?? (l.teto > 0 ? String(l.teto) : '')
          const media = (() => { const h = (historico[l.categoria] || []).slice(-3); const m = h.reduce((t, v) => t + v, 0) / 3; return m >= 1 ? m : 0 })()
          return (
            <article key={l.categoria} className={`orc-card ${l.status}`}>
              <div className="orc-topo">
                <div className="orc-nome">{l.categoria}</div>
                <span className={`badge ${st.badge}`}>{st.texto}</span>
              </div>
              {l.teto > 0 && (
                <div className="orc-barra-linha">
                  <div className="prog-bar" style={{ flex: 1 }}><div className="prog-fill" style={{ width: Math.min(100, pct) + '%', background: st.cor }} /></div>
                  <span className="orc-pct">{pct}%</span>
                </div>
              )}
              <div className="orc-nums">
                <span>Gasto <b className="mono">{l.gasto ? fmt(l.gasto) : '—'}</b></span>
                {l.teto > 0 && <span style={{ color: st.cor }}>{l.restante >= 0 ? 'Restam' : 'Acima'} <b className="mono">{fmt(Math.abs(l.restante))}</b></span>}
                {media > 0 && <span style={{ color: 'var(--text3)' }}>Média 3 meses <b className="mono">{fmt(media)}</b></span>}
              </div>
              <label className="orc-teto">
                <span>Teto mensal</span>
                <input
                  type="number" min="0" step="10" placeholder="sem teto"
                  value={valorInput}
                  onChange={(e) => setRascunho((r) => ({ ...r, [l.categoria]: e.target.value }))}
                  onBlur={() => salvar(l.categoria)}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                  aria-label={`Teto mensal de ${l.categoria}`}
                />
              </label>
            </article>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
        O teto vale para todos os meses. O gasto soma as parcelas do mês e as contas fixas categorizadas (o mesmo cálculo do Dashboard).
        "Perto do teto" aparece a partir de 80%. Para tirar um teto, apague o valor e saia do campo.
      </div>
    </div>
  )
}
