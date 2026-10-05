import { useMemo, useState } from 'react'
import { fmt, mesLabel, nowYM, addMonths, hojeSP } from '../lib/utils'
import { eventosDoMes, porDia, diasNoMes } from '../lib/calendario'

const ROTULO = { fixo: 'Conta fixa', fatura: 'Fatura', parcela: 'Parcela' }
const COR = { fixo: 'badge-blue', fatura: 'badge-amber', parcela: 'badge-gray' }

export default function Calendario({ store, irPara }) {
  const [mes, setMes] = useState(nowYM())
  const { eventos, semDia } = useMemo(() => eventosDoMes(store, mes), [store, mes])
  const dias = porDia(eventos)
  const hoje = hojeSP()
  const diaHoje = hoje.slice(0, 7) === mes ? Number(hoje.slice(8, 10)) : null
  const total = eventos.reduce((s, e) => s + e.valor, 0)
  const aberto = eventos.filter((e) => !e.pago).reduce((s, e) => s + e.valor, 0)
  const diasComEvento = Object.keys(dias).map(Number).sort((a, b) => a - b)

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))}>← Mês anterior</button>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{mesLabel(mes)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))}>Próximo mês →</button>
      </div>
      <div className="metric-grid">
        <div className="metric"><div className="metric-label">Vencimentos no mês</div><div className="metric-val amber">{fmt(total)}</div></div>
        <div className="metric"><div className="metric-label">Ainda em aberto</div><div className="metric-val red">{fmt(aberto)}</div></div>
      </div>

      {diasComEvento.length === 0 && <div className="card" style={{ padding: 16, fontSize: 13, color: 'var(--text3)' }}>Nada vence em {mesLabel(mes)}.</div>}
      {diasComEvento.map((dia) => (
        <div key={dia} className="card" style={{ padding: '10px 14px', marginBottom: 8, borderLeft: diaHoje === dia ? '3px solid var(--brand)' : undefined }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>
            Dia {dia}{diaHoje === dia ? ' · hoje' : ''}{diaHoje && dia < diaHoje && dias[dia].some((e) => !e.pago) ? ' · atrasado' : ''}
          </div>
          {dias[dia].map((e) => (
            <div key={e.chave} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 13 }}>
              <span className={`badge ${COR[e.tipo]}`}>{ROTULO[e.tipo]}</span>
              <span style={{ flex: 1 }}>{e.titulo}{e.estimada ? ' (estimada)' : ''}</span>
              <span className="mono">{fmt(e.valor)}</span>
              <span className={`badge ${e.pago ? 'badge-green' : 'badge-red'}`}>{e.pago ? 'paga' : 'em aberto'}</span>
              {irPara && <button className="btn btn-ghost btn-sm" onClick={() => irPara(e.aba)} aria-label={`Abrir ${e.titulo}`}>Abrir</button>}
            </div>
          ))}
        </div>
      ))}
      {semDia.length > 0 && (
        <>
          <div className="section-label">contas fixas sem dia de vencimento</div>
          <div className="card" style={{ padding: '8px 14px' }}>
            {semDia.map((e) => <div key={e.chave} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0' }}><span>{e.titulo}</span><span className="mono">{fmt(e.valor)}</span></div>)}
          </div>
        </>
      )}
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
        Dias respeitam o tamanho do mês (dia 31 em mês de {diasNoMes(mes)} dias vira dia {diasNoMes(mes)}). Parcela sem cartão vence no dia da compra.
      </div>
    </div>
  )
}
