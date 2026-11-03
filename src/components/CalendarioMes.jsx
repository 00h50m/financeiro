import { useMemo, useState } from 'react'
import { fmt, mesLabel, hojeSP } from '../lib/utils'
import { eventosDoMes, grade, diasNoMes } from '../lib/calendario'
import Selo from './ui/Selo'

const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const SEMANA_LONGA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const TIPO = { fixo: 'Conta fixa', fatura: 'Fatura', parcela: 'Compra' }
const ESTADO_ROTULO = { atrasada: 'atrasada', aberta: 'a pagar', paga: 'paga' }

// Calendário do mês: um quadrado por dia, com o estado do que vence nele; tocar abre o dia embaixo.
export default function CalendarioMes({ store, mes, irPara }) {
  const hoje = hojeSP()
  const { eventos, semDia } = useMemo(() => eventosDoMes(store, mes), [store, mes])
  const semanas = useMemo(() => grade(mes, eventos, hoje), [mes, eventos, hoje])
  const inicial = hoje.slice(0, 7) === mes ? Number(hoje.slice(8, 10)) : (semanas.flat().find((c) => c?.eventos.length)?.dia ?? 1)
  const [escolhido, setEscolhido] = useState(null)
  const dia = escolhido && escolhido <= diasNoMes(mes) ? escolhido : inicial
  const doDia = semanas.flat().find((c) => c?.dia === dia)
  const total = eventos.reduce((t, e) => t + e.valor, 0)
  const aberto = eventos.filter((e) => !e.pago).reduce((t, e) => t + e.valor, 0)
  return (
    <div className="cal-mes">
      <div className="cal-resumo cad-sub">{eventos.length === 0 ? `Nada vence em ${mesLabel(mes)}.` : <><b className="mono">{fmt(total)}</b> vencem em {mesLabel(mes)} · <b className="mono">{fmt(aberto)}</b> ainda em aberto</>}</div>
      <div className="cal-grade" role="grid" aria-label={`Calendário de ${mesLabel(mes)}`}>
        <div className="cal-semana cal-cab" role="row">{SEMANA.map((d, i) => <span key={i} role="columnheader" aria-label={SEMANA_LONGA[i]}>{d}</span>)}</div>
        {semanas.map((sem, i) => (
          <div key={i} className="cal-semana" role="row">
            {sem.map((c, j) => c ? (
              <button key={j} type="button" role="gridcell" className={`cal-dia ${c.estado || ''} ${c.hoje ? 'hoje' : ''} ${dia === c.dia ? 'sel' : ''}`} aria-pressed={dia === c.dia}
                onClick={() => setEscolhido(c.dia)}
                aria-label={`Dia ${c.dia}${c.hoje ? ', hoje' : ''}: ${c.eventos.length ? `${c.eventos.length} ${c.eventos.length === 1 ? 'conta' : 'contas'}, ${fmt(c.total)}, ${ESTADO_ROTULO[c.estado]}` : 'nada vence'}`}>
                <span className="cal-num">{c.dia}</span>
                {c.eventos.length > 0 && <span className="cal-marca" aria-hidden="true">{c.eventos.length > 1 ? c.eventos.length : ''}</span>}
              </button>
            ) : <span key={j} role="gridcell" className="cal-vazio" aria-hidden="true" />)}
          </div>
        ))}
      </div>
      <div className="cal-legenda cad-sub" aria-hidden="true"><span><i className="atrasada" /> atrasada</span><span><i className="aberta" /> a pagar</span><span><i className="paga" /> paga</span></div>
      <section className="card cal-dia-detalhe" aria-label={`Dia ${dia}`} aria-live="polite">
        <h3 className="cal-dia-titulo">Dia {dia}{doDia?.hoje ? ' · hoje' : ''}{doDia?.estado === 'atrasada' ? ' · atrasado' : ''}</h3>
        {!doDia || doDia.eventos.length === 0 ? <div className="cad-sub">Nada vence neste dia.</div> : doDia.eventos.map((e) => (
          <div key={e.chave} className="cal-ev">
            <div className="cal-ev-texto"><div>{e.titulo}{e.estimada ? ' (estimada)' : ''}</div><div className="cad-sub"><Selo tom={e.pago ? 'ok' : 'neutro'}>{e.pago ? 'Paga' : 'Em aberto'}</Selo> {TIPO[e.tipo]}</div></div>
            <span className="mono">{fmt(e.valor)}</span>
            {irPara && <button type="button" className="btn btn-ghost btn-sm" onClick={() => irPara(e.aba)} aria-label={`Abrir ${e.titulo}`}>Abrir</button>}
          </div>
        ))}
      </section>
      {semDia.length > 0 && (
        <details className="card fat-secundaria"><summary>Contas fixas sem dia de vencimento ({semDia.length})</summary>
          <ul className="fat-hist-lista">{semDia.map((e) => <li key={e.chave}><span>{e.titulo}</span><span className="mono">{fmt(e.valor)}</span></li>)}</ul>
        </details>
      )}
    </div>
  )
}
