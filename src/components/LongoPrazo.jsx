import { useMemo, useState } from 'react'
import { compromissosFuturos, mesesAte } from '../lib/longoPrazo'
import { fmt, fmtK, mesLabel, nowYM } from '../lib/utils'
import Secao from './Secao'

// Quanto já está assumido pela frente (parcelas) e como o comprometido do mês evolui nos próximos 12 meses.
export default function LongoPrazo({ store, irPara, compacto = false }) {
  const mes = nowYM()
  const d = useMemo(() => compromissosFuturos(store, mes, 12), [store, mes])
  const [aberto, setAberto] = useState(true)
  const [detalhe, setDetalhe] = useState(false)
  const maior = Math.max(1, ...d.meses.map((m) => m.comprometido))
  const faltam = d.ultimoMes ? mesesAte(mes, d.ultimoMes) : 0

  const resumo = d.qtdCompras === 0
    ? <>Nenhuma compra parcelada em andamento. O que está comprometido pela frente são só as contas fixas.</>
    : <>Já assumido em parcelas: <b className="mono">{fmt(d.parcelasRestantes)}</b> em {d.qtdCompras} {d.qtdCompras === 1 ? 'compra' : 'compras'}, até <b>{mesLabel(d.ultimoMes)}</b>{faltam > 0 ? ` (daqui a ${faltam} ${faltam === 1 ? 'mês' : 'meses'})` : ''}.</>

  const corpo = (
    <div className="lp">
      <div className="lp-resumo">{resumo}</div>
      <div className="lp-barras" role="img" aria-label="Comprometido por mês nos próximos 12 meses">
        {d.meses.map((m) => (
          <div key={m.mes} className="lp-col" title={`${mesLabel(m.mes)}: comprometido ${fmt(m.comprometido)} · parcelas ${fmt(m.parcelas)} · contas fixas ${fmt(m.fixos)}`}>
            <div className="lp-pilha" style={{ height: `${Math.max(3, (m.comprometido / maior) * 100)}%` }}>
              <div className="lp-resto" style={{ flex: Math.max(0, m.comprometido - m.parcelas) }} />
              <div className="lp-parc" style={{ flex: m.parcelas }} />
            </div>
            <div className="lp-mes">{mesLabel(m.mes).slice(0, 3)}</div>
          </div>
        ))}
      </div>
      <div className="lp-leg"><span><i className="parc" />parcelas</span><span><i className="resto" />contas fixas e outros</span></div>

      {!compacto && (
        <>
          {d.porCartao.length > 0 && (
            <div className="lp-cartoes">
              {d.porCartao.map((c) => (
                <span key={c.cartao_id} className="badge badge-gray">{c.nome}: {fmt(c.valor)} <span style={{ opacity: .7 }}>({c.qtd})</span></span>
              ))}
            </div>
          )}
          <button className="link-btn lp-ver" onClick={() => setDetalhe((v) => !v)} aria-expanded={detalhe}>{detalhe ? 'Esconder o mês a mês' : 'Ver mês a mês'}</button>
          {detalhe && <><table className="tabela-compacta lp-tabela">
            <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Comprometido</th><th style={{ textAlign: 'right' }} className="col-opc">Parcelas</th><th className="col-opc">Termina</th></tr></thead>
            <tbody>
              {d.meses.map((m) => (
                <tr key={m.mes}>
                  <td>{mesLabel(m.mes)}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmtK(m.comprometido)}</td>
                  <td className="mono col-opc" style={{ textAlign: 'right' }}>{fmtK(m.parcelas)}</td>
                  <td className="col-opc" style={{ fontSize: 12, color: 'var(--text2)' }}>{m.terminam.map((c) => c.identificacao || c.descricao).join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lp-nota">Meses futuros usam o que já está lançado (parcelas) e as contas fixas ativas. Compras novas e valores variáveis ainda não entram.</div></>}
        </>
      )}
      {compacto && irPara && <button className="ini-link" onClick={() => irPara('faturas')}>Ver mês a mês →</button>}
    </div>
  )

  if (compacto) return <section className="ini-card"><div className="ini-card-topo"><h2>Compromissos a longo prazo</h2></div>{corpo}</section>
  return <Secao titulo="Compromissos a longo prazo" info="próximos 12 meses" destaque={d.qtdCompras ? fmt(d.parcelasRestantes) : null} aberto={aberto} onToggle={() => setAberto((v) => !v)}>{corpo}</Secao>
}
