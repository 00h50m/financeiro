import { useState } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths, totalRenda, gastosPorCategoria, statusTeto } from '../lib/utils'

const STATUS = {
  sem: { badge: 'badge-gray', texto: 'Sem teto', cor: 'var(--text3)' },
  ok: { badge: 'badge-green', texto: 'Dentro', cor: 'var(--green)' },
  perto: { badge: 'badge-amber', texto: 'Perto do teto', cor: 'var(--amber)' },
  estourou: { badge: 'badge-red', texto: 'Estourou', cor: 'var(--red)' },
}

const arredondar10 = (v) => Math.ceil(v / 10) * 10

export default function Orcamento({ store }) {
  const { compras, cartoes, fixos, categorias, rendas, orcamentos, orcamentosOk, definirOrcamento, definirOrcamentos } = store
  const [mes, setMes] = useState(nowYM())
  const [rascunho, setRascunho] = useState({}) // categoria -> texto digitado, enquanto não salvou

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
  const gastos = gastosPorCategoria(compras, cartoes, fixos, mes)

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

  // Média dos 3 meses anteriores (só o que já aconteceu), arredondada para cima de 10 em 10.
  function sugerirTetos() {
    const anteriores = [1, 2, 3].map((n) => gastosPorCategoria(compras, cartoes, fixos, addMonths(mes, -n)))
    const sugestoes = nomes
      .filter((c) => !tetoDe(c))
      .map((categoria) => {
        const media = anteriores.reduce((s, g) => s + (g[categoria]?.total || 0), 0) / 3
        return { categoria, valor: arredondar10(media) }
      })
      .filter((s) => s.valor > 0)
    if (!sugestoes.length) {
      alert('Não há histórico suficiente nos 3 meses anteriores a ' + mesLabel(mes) + ' para sugerir tetos.')
      return
    }
    const resumo = sugestoes.map((s) => `${s.categoria}: ${fmtK(s.valor)}`).join('\n')
    if (confirm(`Definir estes tetos mensais (média dos 3 meses anteriores)? Categorias que já têm teto não mudam.\n\n${resumo}`)) {
      definirOrcamentos(sugestoes)
    }
  }

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))}>← Mês anterior</button>
        <strong style={{ minWidth: 70, textAlign: 'center' }}>{mesLabel(mes)}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))}>Próximo mês →</button>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={sugerirTetos}>
          Sugerir tetos pela média
        </button>
      </div>

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

      <div className="card sim-tabela">
        <table>
          <thead>
            <tr>
              <th>Categoria</th>
              <th style={{ width: 140 }}>Teto mensal (R$)</th>
              <th style={{ textAlign: 'right' }}>Gasto</th>
              <th style={{ textAlign: 'right' }}>Restante</th>
              <th style={{ width: 150 }}>Uso do teto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const pct = l.teto > 0 ? Math.round((l.gasto / l.teto) * 100) : 0
              const st = STATUS[l.status]
              const valorInput = rascunho[l.categoria] ?? (l.teto > 0 ? String(l.teto) : '')
              return (
                <tr key={l.categoria}>
                  <td style={{ fontWeight: 500 }}>{l.categoria}</td>
                  <td>
                    <input
                      type="number" min="0" step="10" placeholder="sem teto"
                      value={valorInput}
                      onChange={(e) => setRascunho((r) => ({ ...r, [l.categoria]: e.target.value }))}
                      onBlur={() => salvar(l.categoria)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
                      style={{ width: 120 }}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: l.gasto ? 'var(--text)' : 'var(--text3)' }}>
                    {l.gasto ? fmt(l.gasto) : '—'}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: l.teto ? st.cor : 'var(--text3)' }}>
                    {l.teto ? fmt(l.restante) : '—'}
                  </td>
                  <td>
                    {l.teto > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="prog-bar" style={{ flex: 1 }}>
                          <div className="prog-fill" style={{ width: Math.min(100, pct) + '%', background: st.cor }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 36 }}>{pct}%</span>
                      </div>
                    )}
                  </td>
                  <td><span className={`badge ${st.badge}`}>{st.texto}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
        O teto vale para todos os meses. O gasto soma as parcelas do mês e as contas fixas categorizadas (o mesmo cálculo do Dashboard).
        "Perto do teto" aparece a partir de 80%. Para tirar um teto, apague o valor e saia do campo.
      </div>
    </div>
  )
}
