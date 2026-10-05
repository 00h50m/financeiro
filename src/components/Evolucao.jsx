import { useMemo, useState } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths } from '../lib/utils'
import { serieMensal, comparativos, insights, evolucaoPorCategoria } from '../lib/evolucao'

const Var = ({ v, inverter }) => {
  if (v.referencia == null) return <span style={{ color: 'var(--text3)' }}>sem dados</span>
  const bom = inverter ? v.delta <= 0 : v.delta >= 0
  const cor = v.delta === 0 ? 'var(--text3)' : bom ? 'var(--green)' : 'var(--red)'
  return (
    <span style={{ color: cor }}>
      {v.delta > 0 ? '+' : v.delta < 0 ? '−' : ''}{fmt(Math.abs(v.delta))}{v.pct != null ? ` (${v.pct > 0 ? '+' : ''}${v.pct}%)` : ''}
    </span>
  )
}

const NIVEL = { atencao: 'badge-amber', bom: 'badge-green', info: 'badge-blue' }
const ROTULO = { atencao: 'Atenção', bom: 'Bom sinal', info: 'Info' }

export default function Evolucao({ store }) {
  const [mes, setMes] = useState(nowYM())
  const [campo, setCampo] = useState('despesas')
  const serie = useMemo(() => serieMensal(store, mes, 12), [store, mes])
  const comp = useMemo(() => comparativos(store, mes, campo), [store, mes, campo])
  const obs = useMemo(() => insights(store, mes), [store, mes])
  const cats = useMemo(() => evolucaoPorCategoria(store, mes), [store, mes])
  const maximo = Math.max(1, ...serie.map((l) => Math.max(l.renda, l.despesas)))

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))}>← Mês anterior</button>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{mesLabel(mes)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))}>Próximo mês →</button>
      </div>

      <div className="section-label">o que observamos · cada item mostra a conta</div>
      {obs.length === 0 ? (
        <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Ainda não há dados suficientes para observações neste mês.</div>
      ) : (
        <div className="card" style={{ padding: '4px 14px' }}>
          {obs.map((o) => (
            <div key={o.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`badge ${NIVEL[o.nivel]}`}>{ROTULO[o.nivel]}</span>
                <span style={{ fontSize: 13 }}>{o.texto}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>Por quê: {o.porque}</div>
            </div>
          ))}
        </div>
      )}

      <div className="section-label">comparação</div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {[['despesas', 'Despesas'], ['renda', 'Renda'], ['sobra', 'Sobra']].map(([k, n]) => (
            <button key={k} className={`btn btn-sm ${campo === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCampo(k)}>{n}</button>
          ))}
        </div>
        <div style={{ fontSize: 13, marginBottom: 8 }}>{mesLabel(mes)}: <strong className="mono">{fmt(comp.atual)}</strong></div>
        <table>
          <tbody>
            {comp.itens.map((i) => (
              <tr key={i.rotulo}>
                <td>{i.rotulo}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{i.referencia == null ? '—' : fmt(i.referencia)}</td>
                <td style={{ textAlign: 'right', fontSize: 13 }}><Var v={i} inverter={campo === 'despesas'} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>Percentual só aparece quando a referência é maior que zero. Meses sem dados ficam de fora das médias.</div>
      </div>

      <div className="section-label">últimos 12 meses</div>
      <div className="card" style={{ padding: 16 }}>
        <table>
          <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Renda</th><th style={{ textAlign: 'right' }}>Despesas</th><th style={{ textAlign: 'right' }}>Sobra</th><th style={{ textAlign: 'right' }}>% guardado</th><th>Origem</th></tr></thead>
          <tbody>
            {serie.map((l) => (
              <tr key={l.mes} style={{ opacity: l.temDados ? 1 : 0.45 }}>
                <td>{mesLabel(l.mes)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{l.temDados ? fmtK(l.renda) : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{l.temDados ? fmtK(l.despesas) : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: l.sobra < 0 ? 'var(--red)' : undefined }}>{l.temDados ? fmtK(l.sobra) : '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 13 }}>{l.taxaPoupanca != null ? l.taxaPoupanca + '%' : '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--text3)' }}>{l.temDados ? (l.fonte === 'fechado' ? 'fechado' : 'ao vivo') : 'sem dados'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 14 }}>
          {serie.filter((l) => l.temDados).map((l) => (
            <div key={l.mes} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 11, color: 'var(--text3)' }}>
              <span style={{ width: 52 }}>{mesLabel(l.mes).slice(0, 6)}</span>
              <div style={{ flex: 1 }}>
                <div style={{ height: 6, width: (l.renda / maximo) * 100 + '%', background: 'var(--green)', borderRadius: 3, marginBottom: 2 }} />
                <div style={{ height: 6, width: (l.despesas / maximo) * 100 + '%', background: 'var(--amber)', borderRadius: 3 }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Verde = renda · Âmbar = despesas</div>
        </div>
      </div>

      <div className="section-label">por categoria · {mesLabel(mes)} contra o mês anterior</div>
      <div className="card" style={{ padding: 16 }}>
        <table>
          <thead><tr><th>Categoria</th><th style={{ textAlign: 'right' }}>Este mês</th><th style={{ textAlign: 'right' }}>Anterior</th><th style={{ textAlign: 'right' }}>Variação</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.categoria}>
                <td>{c.categoria}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.atual)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.anterior)}</td>
                <td style={{ textAlign: 'right', fontSize: 13 }}><Var v={{ ...c, referencia: c.anterior }} inverter /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
