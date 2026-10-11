import { useMemo, useState } from 'react'
import { RENDA_CAMPOS, fmt, fmtK, mesLabel, nowYM, totalRenda } from '../lib/utils'
import { perfilDeLinhas, fatorDe, proximoFator, projecaoRenda, planoDeReserva, temPerfil } from '../lib/rendaSazonal'
import { saldoMeta } from '../lib/metas'
import Secao from './Secao'

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const rotuloFator = (f) => (f === 0 ? '0' : `${Math.round(f * 100)}%`)
const classeFator = (f) => (f >= 0.995 ? 'normal' : f === 0 ? 'zero' : f <= 0.5 ? 'fraco' : 'menos')

// Reserva atual: saldo da meta de reserva ativa (tela Reserva), se existir.
export function reservaAtualDe(store) {
  const meta = (store.metas || []).find((m) => m.tipo === 'reserva' && m.ativa !== false)
  return meta ? Math.max(0, saldoMeta(store.metasMovimentos || [], meta.id)) : 0
}

// Dados da projeção, compartilhados com o aviso do Início.
export function useProjecaoSazonal(store, n = 12) {
  const perfil = useMemo(() => perfilDeLinhas(store.rendaSazonal), [store.rendaSazonal])
  const meses = useMemo(() => projecaoRenda(store, perfil, nowYM(), n), [store, perfil, n])
  const plano = useMemo(() => planoDeReserva(meses, reservaAtualDe(store)), [meses, store])
  return { perfil, meses, plano, ativo: temPerfil(perfil) }
}

export default function RendaSazonal({ store }) {
  const { rendas, rendaSazonalOk, definirFatorSazonal } = store
  const { perfil, meses, plano } = useProjecaoSazonal(store)
  const [abertas, setAbertas] = useState({ perfil: true, proj: true, plano: true })
  const alt = (k) => () => setAbertas((a) => ({ ...a, [k]: !a[k] }))
  const campos = RENDA_CAMPOS.filter(([k]) => rendas.some((r) => Number(r[k]) > 0))
  const maior = Math.max(1, ...meses.map((m) => Math.max(m.renda, m.comprometido)))
  const hoje = nowYM()

  return (
    <div className="rs">
      <Secao titulo="Como a renda muda ao longo do ano" info="toque no mês para alternar" aberto={abertas.perfil} onToggle={alt('perfil')}>
        <div className="rs-corpo">
          {!rendaSazonalOk && (
            <div className="alert alert-amber">Para guardar os meses fracos, rode o arquivo <code>inbox/22_renda_sazonal.sql</code> no Supabase e recarregue a página.</div>
          )}
          <p className="rs-ajuda">Cada toque muda o mês: <b>100%</b> (normal) → <b>70%</b> → <b>40%</b> (fraco) → <b>0</b> (não recebe). A projeção usa isso nos meses em que você ainda não cadastrou a renda.</p>
          {campos.length === 0 && <div className="empty">Cadastre a renda de algum mês primeiro; depois você marca aqui os meses fracos de cada fonte.</div>}
          {campos.map(([campo, rotulo]) => (
            <div key={campo} className="rs-fonte">
              <div className="rs-fonte-nome">{rotulo}</div>
              <div className="rs-chips">
                {MESES_CURTOS.map((nome, i) => {
                  const f = fatorDe(perfil, campo, `2026-${String(i + 1).padStart(2, '0')}`)
                  return (
                    <button
                      key={nome}
                      className={`rs-chip ${classeFator(f)}`}
                      disabled={!rendaSazonalOk}
                      onClick={() => definirFatorSazonal(campo, i + 1, proximoFator(f))}
                      aria-label={`${rotulo}, ${nome}: ${f === 0 ? 'não recebe' : rotuloFator(f)}. Toque para alterar`}
                    >
                      <span>{nome}</span><b>{rotuloFator(f)}</b>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Secao>

      <Secao titulo="Projeção dos próximos 12 meses" info="renda × comprometido" aberto={abertas.proj} onToggle={alt('proj')}>
        <div className="rs-corpo">
          <div className="rs-barras" role="img" aria-label="Renda prevista e comprometido em cada um dos próximos 12 meses">
            {meses.map((m) => (
              <div key={m.mes} className={`rs-mes ${m.sobra < -0.005 ? 'neg' : ''}`} title={`${mesLabel(m.mes)}: renda ${fmt(m.renda)}${m.estimada ? ' (prevista)' : ''} · comprometido ${fmt(m.comprometido)} · ${m.sobra < 0 ? 'falta' : 'sobra'} ${fmt(Math.abs(m.sobra))}`}>
                <div className="rs-par">
                  <div className="rs-b renda" style={{ height: `${(m.renda / maior) * 100}%` }} />
                  <div className="rs-b comp" style={{ height: `${(m.comprometido / maior) * 100}%` }} />
                </div>
                <div className="rs-mes-nome">{mesLabel(m.mes).slice(0, 3)}</div>
              </div>
            ))}
          </div>
          <div className="lp-leg"><span><i className="rs-lg renda" />renda</span><span><i className="rs-lg comp" />comprometido</span><span><i className="rs-lg neg" />mês no vermelho</span></div>
          <table className="tabela-compacta lp-tabela">
            <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Renda</th><th style={{ textAlign: 'right' }} className="col-opc">Comprometido</th><th style={{ textAlign: 'right' }}>Sobra / falta</th></tr></thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes}>
                  <td>{mesLabel(m.mes)}{m.mes === hoje && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>atual</span>}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{fmtK(m.renda)}{m.estimada && totalRenda(rendas.find((r) => r.mes === m.mes)) === 0 && <span className="rs-prev" title="Renda prevista pelos meses fracos que você marcou"> prev.</span>}</td>
                  <td className="mono col-opc" style={{ textAlign: 'right' }}>{fmtK(m.comprometido)}</td>
                  <td className="mono" style={{ textAlign: 'right', color: m.sobra < -0.005 ? 'var(--red)' : 'var(--green)' }}>{m.sobra < 0 ? '−' : '+'}{fmtK(Math.abs(m.sobra))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lp-nota">Meses futuros usam as parcelas já lançadas e as contas fixas ativas; compras novas e valores variáveis ainda não entram. Mês com renda cadastrada vale o cadastrado.</div>
        </div>
      </Secao>

      <Secao titulo="Plano de reserva" info={plano.tem ? 'tem mês no vermelho' : 'tudo coberto'} destaque={plano.tem && plano.precisa > 0 ? `guardar ${fmt(plano.precisa)}` : null} aberto={abertas.plano} onToggle={alt('plano')}>
        <div className="rs-corpo rs-plano">
          {!plano.tem ? (
            <p>✓ Nos próximos 12 meses nenhum mês fica no vermelho com a renda prevista.</p>
          ) : (
            <>
              <p>Nos próximos 12 meses faltam <b className="mono">{fmt(plano.buraco)}</b> no total{plano.reservaAtual > 0 ? <>. Você já tem <b className="mono">{fmt(plano.reservaAtual)}</b> na reserva{plano.precisa === 0 ? ', o que cobre tudo' : `; ainda precisa juntar ${fmt(plano.precisa)}`}</> : ''}.</p>
              {plano.janelas.map((w) => (
                <div key={w.primeiroMes} className="rs-janela">
                  <div className="rs-janela-tit">{w.meses.length === 1 ? mesLabel(w.meses[0]) : `${mesLabel(w.meses[0])} a ${mesLabel(w.meses[w.meses.length - 1])}`} <span className="mono">· faltam {fmt(w.buraco)}</span></div>
                  {w.precisa === 0 && <p>✓ A reserva cobre esse período.</p>}
                  {w.precisa > 0 && w.mesesAntes > 0 && (
                    <>
                      <p className="rs-destaque">Guarde <b className="mono">{fmt(w.porMes)}</b> por mês durante {w.mesesAntes} {w.mesesAntes === 1 ? 'mês' : 'meses'} ({mesLabel(w.inicioGuardar)}{w.inicioGuardar !== w.fimGuardar ? ` a ${mesLabel(w.fimGuardar)}` : ''}).</p>
                      <p className={w.cobreComSobras ? '' : 'rs-aviso'}>
                        {w.cobreComSobras
                          ? <>A sobra prevista nesses meses é de {fmt(w.sobraAntes)}, o que cobre, desde que você guarde mesmo.</>
                          : <>A sobra prevista nesses meses é de apenas {fmt(w.sobraAntes)}, menos do que o necessário. Vale reduzir gastos ou aumentar a renda.</>}
                      </p>
                    </>
                  )}
                  {w.precisa > 0 && w.mesesAntes === 0 && (
                    <p className="rs-destaque ruim">Esse período já começa no vermelho, então não dá para juntar antes. Vale usar a reserva, cortar gastos ou antecipar renda.</p>
                  )}
                </div>
              ))}
              <button className="link-btn" onClick={() => store.irPara?.('reserva')}>Abrir a tela Reserva</button>
            </>
          )}
        </div>
      </Secao>
    </div>
  )
}
