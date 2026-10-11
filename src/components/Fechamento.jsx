import { useEffect, useMemo, useState } from 'react'
import Secao from './Secao'
import NavMes from './NavMes'
import { fmt, fmtK, mesLabel, nowYM, addMonths, hojeSP } from '../lib/utils'
import { fechamentoDe, montarFoto, validarFechamento } from '../lib/fechamento'
import { sugerirDestinoSobra } from '../lib/metas'
import { detalhePagamentos } from '../lib/financeiro'

const dataHora = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

const ROTULO_ACAO = {
  fechar: 'Fechou',
  reabrir: 'Reabriu',
}

function Linha({ rotulo, valor, destaque, sub }) {
  return (
    <div className="extrato-linha">
      <div>
        {rotulo}
        {sub && <div className="extrato-sub">{sub}</div>}
      </div>
      <div className="mono" style={{ fontWeight: destaque ? 600 : 400, color: destaque ? (valor < 0 ? 'var(--red)' : 'var(--green)') : undefined }}>{fmt(valor)}</div>
    </div>
  )
}

function Tabela({ titulo, mapa, abertoInicial = false }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const itens = Object.entries(mapa || {}).sort((a, b) => b[1] - a[1])
  if (!itens.length) return null
  const total = itens.reduce((t, [, v]) => t + Number(v), 0)
  return (
    <Secao titulo={titulo} info={`${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`} destaque={fmt(total)} aberto={aberto} onToggle={() => setAberto((v) => !v)}>
      <table style={{ borderTop: '1px solid var(--border)' }}>
        <tbody>
          {itens.map(([nome, v]) => (
            <tr key={nome}>
              <td>{nome}</td>
              <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Secao>
  )
}

export default function Fechamento({ store }) {
  const { fechamentos, fechamentosOk, fecharMes, reabrirMes, listarAuditoria } = store
  const [mes, setMes] = useState(() => addMonths(nowYM(), -1))
  const [reserva, setReserva] = useState('')
  const [confirmou, setConfirmou] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [historico, setHistorico] = useState([])
  const [sec, setSec] = useState({ saldo: true, faturas: false, hist: false })
  const alt = (k) => () => setSec((m) => ({ ...m, [k]: !m[k] }))

  const atual = fechamentoDe(fechamentos, mes)
  const fechado = atual?.status === 'fechado'

  useEffect(() => { setConfirmou(false); setReserva('') }, [mes])
  useEffect(() => {
    let vivo = true
    if (fechamentosOk) listarAuditoria('fechamento', mes).then((l) => { if (vivo) setHistorico(l) })
    return () => { vivo = false }
  }, [mes, fechamentosOk, fechamentos, listarAuditoria])

  const validacao = useMemo(() => (fechamentosOk ? validarFechamento(store, mes) : null), [store, mes, fechamentosOk])
  const reservaNum = Math.max(0, Number(String(reserva).replace(',', '.')) || 0)
  const foto = useMemo(
    () => (fechamentosOk && !fechado ? montarFoto(store, mes, { reservaDestinada: reservaNum }) : null),
    [store, mes, fechamentosOk, fechado, reservaNum]
  )

  const sugestao = useMemo(() => {
    if (!fechamentosOk || fechado || !store.metasOk || !foto) return null
    const det = detalhePagamentos(store, nowYM())
    return sugerirDestinoSobra(foto.saldo_final, store.metas, store.metasMovimentos, { custoFixos: det.totalFixos, custoTotal: det.comprometido }, hojeSP())
  }, [store, fechamentosOk, fechado, foto])

  if (!fechamentosOk) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          <strong>Falta criar as tabelas do fechamento no banco.</strong> Rode o arquivo <code>inbox/15_fechamentos_auditoria.sql</code> no
          SQL Editor do Supabase e recarregue esta página.
        </div>
      </div>
    )
  }

  const bloqueado = (validacao?.bloqueantes.length || 0) > 0
  const temAlertas = (validacao?.alertas.length || 0) > 0
  const podeFechar = !fechado && !bloqueado && (!temAlertas || confirmou) && !ocupado

  async function fechar() {
    if (!podeFechar) return
    setOcupado(true)
    const f = montarFoto(store, mes, { reservaDestinada: reservaNum, alertasAceitos: validacao.alertas })
    await fecharMes(mes, f)
    setOcupado(false)
  }

  async function reabrir() {
    const motivo = window.prompt(`Reabrir ${mesLabel(mes)}? É uma ação excepcional e fica registrada.\n\nEscreva o motivo:`)
    if (!motivo || motivo.trim().length < 3) return
    setOcupado(true)
    await reabrirMes(mes, motivo.trim())
    setOcupado(false)
  }

  const f = fechado ? atual : foto

  return (
    <div className="page">
      <div className="pag-topo">
        <NavMes mes={mes} onChange={setMes} />
        <span className={`badge ${fechado ? 'badge-green' : atual ? 'badge-amber' : 'badge-gray'}`}>
          {fechado ? 'Fechado' : atual ? 'Reaberto' : 'Aberto'}
        </span>
      </div>

      {fechado && (
        <div className="alert alert-green" style={{ marginBottom: 16 }}>
          <strong>{mesLabel(mes)} fechado</strong> em {dataHora(atual.fechado_em)}{atual.fechado_por ? ` por ${atual.fechado_por}` : ''}.
          Estes números são a foto do dia do fechamento: não mudam se as regras mudarem.
        </div>
      )}

      {!fechado && validacao && (
        <>
          {bloqueado && (
            <div className="alert alert-red" style={{ marginBottom: 12 }}>
              <strong>Não dá para fechar ainda:</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>{validacao.bloqueantes.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {temAlertas && (
            <div className="alert alert-amber" style={{ marginBottom: 12 }}>
              <strong>{bloqueado ? 'Alertas (não bloqueiam)' : 'Confira antes de fechar'}:</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>{validacao.alertas.map((t) => <li key={t}>{t}</li>)}</ul>
            </div>
          )}
          {!bloqueado && !temAlertas && <div className="alert alert-green" style={{ marginBottom: 12 }}>Tudo certo para fechar {mesLabel(mes)}.</div>}
        </>
      )}

      {f && (
        <>
          <div className="metric-grid">
            <div className="metric"><div className="metric-label">Receita realizada</div><div className="metric-val green">{fmtK(f.renda)}</div></div>
            <div className="metric"><div className="metric-label">Despesas realizadas</div><div className="metric-val amber">{fmtK(f.despesas)}</div></div>
            <div className="metric"><div className="metric-label">Sobra real do mês</div><div className={`metric-val ${f.sobra >= 0 ? 'green' : 'red'}`}>{fmtK(f.sobra)}</div></div>
            <div className="metric"><div className="metric-label">Saldo transportado</div><div className={`metric-val ${Number(f.saldo_transportado) >= 0 ? 'blue' : 'red'}`}>{fmtK(f.saldo_transportado)}</div></div>
          </div>

          <Secao titulo="Como chegamos ao saldo" info={mesLabel(mes)} destaque={fmt(Number(f.saldo_transportado))} aberto={sec.saldo} onToggle={alt('saldo')}>
          <div className="extrato">
            <Linha rotulo="Receita realizada" valor={Number(f.renda)} />
            <Linha rotulo="Despesas realizadas" valor={-Number(f.despesas)} sub={`${fmt(f.pago)} pago · ${fmt(f.pendente)} pendente`} />
            <Linha rotulo="Saldo que veio do mês anterior" valor={Number(f.saldo_anterior)} />
            <Linha rotulo="Ajuste com o saldo da conta" valor={Number(f.ajuste)} />
            <Linha rotulo="Saldo final do mês" valor={Number(f.saldo_final)} destaque />
            <div className="extrato-linha">
              <div>
                Destinado à reserva / metas
                <div className="extrato-sub">Só planejamento: o app não movimenta dinheiro.</div>
              </div>
              {fechado ? (
                <div className="mono">− {fmt(f.reserva_destinada)}</div>
              ) : (
                <input type="number" min="0" step="0.01" placeholder="0,00" value={reserva} onChange={(e) => setReserva(e.target.value)} style={{ maxWidth: 140, textAlign: 'right' }} aria-label="Valor destinado à reserva" />
              )}
            </div>
            <Linha rotulo={`Saldo transportado para ${mesLabel(addMonths(mes, 1))}`} valor={Number(f.saldo_transportado)} destaque />
          </div>
          </Secao>

          {sugestao && sugestao.linhas.length > 0 && (
            <div className="alert alert-blue" style={{ marginTop: 12 }}>
              <strong>Sugestão para a sobra ({fmt(foto.saldo_final)}):</strong>
              <ul style={{ margin: '6px 0 0 18px' }}>
                {sugestao.linhas.map((l) => <li key={l.meta_id}>{fmt(l.valor)} para {l.nome} <span style={{ color: 'var(--text3)' }}>({l.motivo})</span></li>)}
                <li>{fmt(sugestao.livre)} livre</li>
              </ul>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setReserva(String(sugestao.destinado))}>Usar {fmt(sugestao.destinado)} como valor destinado</button>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>Regra: metas por prioridade, cada uma até o que falta (ou o ritmo do prazo). É só uma sugestão: depois de fechar, registre o aporte na tela Metas quando guardar de verdade.</div>
            </div>
          )}

          {!fechado && (
            <div style={{ marginTop: 16 }}>
              {temAlertas && !bloqueado && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} />
                  Li os alertas e quero fechar {mesLabel(mes)} mesmo assim
                </label>
              )}
              <button className="btn btn-primary" disabled={!podeFechar} onClick={fechar}>
                {ocupado ? 'Fechando...' : `Fechar ${mesLabel(mes)}`}
              </button>
            </div>
          )}

          <Tabela titulo="Despesas por categoria" mapa={f.por_categoria} abertoInicial />
          <Tabela titulo="Despesas por pessoa" mapa={f.por_pessoa} />

          {fechado && (f.detalhes?.faturas?.length > 0) && (
            <Secao titulo="Faturas no fechamento" info={`${f.detalhes.faturas.length} ${f.detalhes.faturas.length === 1 ? 'fatura' : 'faturas'}`} aberto={sec.faturas} onToggle={alt('faturas')}>
                <table style={{ borderTop: '1px solid var(--border)' }}>
                  <thead><tr><th>Cartão</th><th style={{ textAlign: 'right' }}>Valor</th><th>Situação</th></tr></thead>
                  <tbody>
                    {f.detalhes.faturas.map((l) => (
                      <tr key={l.cartao_id}>
                        <td>{l.nome}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(l.valor)}</td>
                        <td>{l.real ? 'valor real' : 'estimado'} · {l.pago ? 'paga' : 'não paga'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
            </Secao>
          )}

          {fechado && (
            <div style={{ marginTop: 16 }}>
              <button className="btn btn-danger" disabled={ocupado} onClick={reabrir}>Reabrir {mesLabel(mes)}</button>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>
                Reabrir exige um motivo e guarda o fechamento atual no histórico. Depois você pode fechar de novo.
              </div>
            </div>
          )}
        </>
      )}

      {historico.length > 0 && (
        <Secao titulo="Histórico" info={mesLabel(mes)} aberto={sec.hist} onToggle={alt('hist')}>
            <table style={{ borderTop: '1px solid var(--border)' }}>
              <tbody>
                {historico.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{dataHora(h.quando)}</td>
                    <td>{ROTULO_ACAO[h.acao] || h.acao}{h.usuario ? ` · ${h.usuario}` : ''}{h.motivo ? <div style={{ fontSize: 12, color: 'var(--text2)' }}>Motivo: {h.motivo}</div> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </Secao>
      )}
    </div>
  )
}
