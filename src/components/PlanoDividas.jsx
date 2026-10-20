import { useMemo, useState } from 'react'
import { Pilulas } from './NavMes'
import ModalDivida, { TIPOS_DIVIDA } from './ModalDivida'
import { fmt, fmtK, mesLabel, nowYM } from '../lib/utils'
import { compararEstrategias, resumoDividas, ESTRATEGIAS } from '../lib/dividas'
import { perfilDeLinhas, projecaoRenda } from '../lib/rendaSazonal'
import { lerNum } from '../lib/adiamentoPref'
import { atrasadasDoApp } from '../lib/dividasApp'
import { terminandoLogo } from '../lib/parcelamentos'
import { tituloCompra } from '../lib/utils'

const MESES_PROJECAO = 24
const prazo = (idx) => (idx == null ? null : `${idx + 1} ${idx + 1 === 1 ? 'mês' : 'meses'}`)

// Plano de dívidas: o que se deve, quanto dá para pagar por mês e em que ordem pagar. Compara avalanche, bola de neve e só o mínimo.
export default function PlanoDividas({ store }) {
  const { dividas, dividasOk, salvarDivida, removerDivida } = store
  const hoje = nowYM()
  const [modal, setModal] = useState(null) // { divida? } ou { sugestao } (conta atrasada do app a importar)
  const [fonte, setFonte] = useState('projecao') // 'projecao' | 'fixo'
  const [fixo, setFixo] = useState('')
  const [estrategia, setEstrategia] = useState('avalanche')
  const perfil = useMemo(() => perfilDeLinhas(store.rendaSazonal), [store.rendaSazonal])
  const projecao = useMemo(() => projecaoRenda(store, perfil, hoje, MESES_PROJECAO), [store, perfil, hoje])
  const sobras = projecao.map((m) => Math.max(0, m.sobra))
  const media = sobras.slice(0, 12).reduce((t, v) => t + v, 0) / 12
  const resumo = useMemo(() => resumoDividas(dividas), [dividas])
  const orcamento = fonte === 'fixo' ? lerNum(fixo) : sobras
  const cmp = useMemo(() => compararEstrategias(dividas, { orcamento, inicio: hoje }), [dividas, orcamento, hoje])
  const plano = cmp[estrategia]
  const ativas = dividas.filter((d) => d.ativa !== false && Number(d.saldo) > 0)
  const prioridade = new Map(plano.ordemQuitacao.map((o, i) => [o.id, i]))
  const lista = [...ativas].sort((a, b) => (prioridade.get(a.id) ?? 99) - (prioridade.get(b.id) ?? 99) || Number(b.juros_mes) - Number(a.juros_mes))
  const atrasadasApp = useMemo(() => atrasadasDoApp(store, `${hoje}-01`, dividas), [store, hoje, dividas])
  const terminando = useMemo(() => terminandoLogo(store.compras, store.cartoes, hoje, 12).slice(0, 5), [store.compras, store.cartoes, hoje])
  const inicialTotal = dividas.filter((d) => d.ativa !== false).reduce((t, d) => t + (Number(d.saldo_inicial) || Number(d.saldo)), 0)
  const jaPago = Math.max(0, inicialTotal - resumo.total)
  const maior = Math.max(1, plano.inicial)
  async function paguei(d) {
    const t = window.prompt(`Quanto você pagou de "${d.nome}"? (R$)`, '')
    if (t == null || t.trim() === '') return
    const v = lerNum(t)
    if (!(v > 0)) { window.alert('Não entendi esse valor. Exemplo: 250 ou 250,50'); return }
    const novo = Math.max(0, Math.round((Number(d.saldo) - v) * 100) / 100)
    await salvarDivida(novo === 0 ? { id: d.id, saldo: 0, ativa: false, quitada_em: new Date().toISOString().slice(0, 10) } : { id: d.id, saldo: novo })
  }
  const melhor = ['avalanche', 'bola'].filter((e) => cmp[e].livreEm != null).sort((a, b) => cmp[a].jurosTotal - cmp[b].jurosTotal)[0]

  if (!dividasOk) {
    return <div className="page"><div className="alert alert-amber"><strong>Falta criar a tabela de dívidas.</strong> Rode o arquivo <code>inbox/27_dividas.sql</code> no SQL Editor do Supabase e recarregue esta página.</div></div>
  }

  return (
    <div className="page dividas-pg">
      {modal && <ModalDivida divida={modal.divida} sugestao={modal.sugestao} onSalvar={salvarDivida} onRemover={removerDivida} onClose={() => setModal(null)} />}

      <div className="aulas-acoes" style={{ marginBottom: 12 }}>
        <button className="btn btn-primary" onClick={() => setModal({})}>+ Dívida</button>
      </div>

      {ativas.length === 0 ? (
        <div className="card"><div className="empty">Nenhuma dívida cadastrada.{'\n'}Cadastre o cartão, os boletos atrasados, empréstimos e o que mais você deve. Só o nome e quanto deve já bastam; juros e parcela deixam a simulação mais exata.</div></div>
      ) : (
        <>
          <div className="kpi-faixa" aria-label="Resumo das dívidas">
            <div className="kpi"><div className="kpi-rotulo">Total devido</div><div className="kpi-valor vermelho">{fmtK(resumo.total)}</div><div className="kpi-sub">{resumo.qtd} {resumo.qtd === 1 ? 'dívida' : 'dívidas'}{resumo.atrasadas ? ` · ${resumo.atrasadas} atrasada${resumo.atrasadas > 1 ? 's' : ''}` : ''}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Mínimo por mês</div><div className="kpi-valor ambar">{fmtK(resumo.minimos)}</div><div className="kpi-sub">soma das parcelas informadas</div></div>
            <div className="kpi"><div className="kpi-rotulo">Juros por mês</div><div className="kpi-valor">{resumo.jurosMes ? fmtK(resumo.jurosMes) : '—'}</div><div className="kpi-sub">{resumo.jurosMes ? 'o que a dívida cresce sozinha' : 'informe os juros para estimar'}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Livre em</div><div className="kpi-valor verde">{plano.livreMes ? mesLabel(plano.livreMes) : '—'}</div><div className="kpi-sub">{plano.livreEm != null ? `em ${prazo(plano.livreEm)} · ${ESTRATEGIAS[estrategia].split(' (')[0]}` : 'não quita no prazo com esse valor'}</div></div>
          </div>

          {inicialTotal > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <div className="aulas-meta-barra" role="progressbar" aria-valuenow={Math.round((jaPago / inicialTotal) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Já pago do total">
                <span className="apur" style={{ width: `${Math.min(100, Math.round((jaPago / inicialTotal) * 100))}%` }} />
              </div>
              <div className="cad-sub">Já pagou <b>{fmt(jaPago)}</b> de {fmt(inicialTotal)} ({Math.round((jaPago / inicialTotal) * 100)}%). Quando pagar algo, toque em "Paguei" na dívida para atualizar.</div>
            </div>
          )}

          <div className="card" style={{ padding: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Quanto dá para pagar de dívida por mês?</div>
            <Pilulas rotulo="Fonte do valor" valor={fonte} onChange={setFonte} opcoes={[['projecao', 'Sobra projetada'], ['fixo', 'Valor fixo']]} />
            {fonte === 'fixo'
              ? <div className="form-group" style={{ marginTop: 10, maxWidth: 260 }}><label>Valor por mês (R$)</label><input inputMode="decimal" value={fixo} onChange={(e) => setFixo(e.target.value)} placeholder="Ex.: 800" /></div>
              : <div className="cad-sub" style={{ marginTop: 8 }}>Usa a sobra que o app projeta para cada mês (renda menos o que já está comprometido, com os meses fracos da renda). Média dos próximos 12 meses: <b>{fmt(media)}</b> por mês. Mês no vermelho conta como zero.</div>}
            {plano.faltas.length > 0 && <div className="alert alert-amber" style={{ marginTop: 10, marginBottom: 0 }}>⚠ Em {plano.faltas.slice(0, 3).map((x) => mesLabel(addMes(hoje, x.mes))).join(', ')}{plano.faltas.length > 3 ? ' e outros meses' : ''} o valor disponível não cobre nem os mínimos (faltam {fmt(plano.faltas[0].falta)} no primeiro). Renegociar ou adiar ajuda.</div>}
          </div>

          <div className="section-label">qual estratégia?</div>
          <div className="dividas-cmp">
            {['avalanche', 'bola', 'minimos'].map((e) => {
              const c = cmp[e]
              const escolhivel = e !== 'minimos'
              return (
                <button key={e} type="button" disabled={!escolhivel} className={`dividas-cmp-card ${estrategia === e ? 'ativo' : ''} ${melhor === e ? 'melhor' : ''}`} onClick={() => escolhivel && setEstrategia(e)}>
                  <b>{ESTRATEGIAS[e]}</b>
                  <span className="dividas-cmp-valor">{c.livreMes ? `Livre em ${mesLabel(c.livreMes)}` : e === 'minimos' ? 'Não quita só com o mínimo' : 'Não quita no prazo'}</span>
                  <span className="cad-sub">{c.livreEm != null ? `${prazo(c.livreEm)} · juros ${fmt(c.jurosTotal)}` : 'os juros crescem mais que o pagamento'}</span>
                  {c.economia != null && c.economia > 0.5 && <span className="dividas-eco">economiza {fmt(c.economia)} em juros</span>}
                  {melhor === e && <span className="badge badge-green">menos juros</span>}
                  {e === 'minimos' && <span className="cad-sub">referência: sem reforço</span>}
                </button>
              )
            })}
          </div>
          <div className="cad-sub" style={{ margin: '6px 2px 14px' }}>Avalanche paga primeiro as dívidas de juros mais altos (gasta menos no total). Bola de neve paga primeiro as de menor saldo (você quita rápido e libera parcela).</div>

          <div className="section-label">ordem de pagamento ({ESTRATEGIAS[estrategia].split(' (')[0]})</div>
          <div className="card" style={{ padding: 0 }}>
            {lista.map((d, i) => {
              const q = plano.ordemQuitacao.find((o) => o.id === d.id)
              const nao = plano.naoQuitam.find((o) => o.id === d.id)
              return (
                <div key={d.id} className="divida-linha">
                  <div className="divida-ordem">{i + 1}º</div>
                  <div className="divida-corpo">
                    <div><b>{d.nome}</b> <span className="badge badge-gray">{TIPOS_DIVIDA[d.tipo] || 'Outra'}</span>{d.atrasada && <span className="badge badge-red" style={{ marginLeft: 6 }}>atrasada</span>}</div>
                    <div className="cad-sub">
                      deve {fmt(Number(d.saldo))}{Number(d.parcela) ? ` · mínimo ${fmt(Number(d.parcela))}` : ''}{Number(d.juros_mes) ? ` · juros ${String(d.juros_mes).replace('.', ',')}% ao mês` : ''}{d.vencimento_dia ? ` · vence dia ${d.vencimento_dia}` : ''}
                    </div>
                    <div className="divida-quita">{q ? <>Quita em <b>{mesLabel(q.mes)}</b> ({prazo(q.idx)}){q.jurosPagos > 0.5 ? ` · juros ${fmt(q.jurosPagos)}` : ''}</> : nao ? <span style={{ color: 'var(--red)' }}>Não quita no prazo: os juros comem o pagamento. Renegocie ou aumente o valor.</span> : null}</div>
                  </div>
                  <div className="divida-acoes">
                    <button className="btn btn-ghost btn-sm" onClick={() => paguei(d)}>Paguei</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal({ divida: d })}>Editar</button>
                  </div>
                </div>
              )
            })}
          </div>

          {atrasadasApp.length > 0 && (
            <>
              <div className="section-label">contas atrasadas no app (ainda sem pagar)</div>
              <div className="card" style={{ padding: 0 }}>
                {atrasadasApp.slice(0, 12).map((a) => (
                  <div key={a.origem} className="divida-linha">
                    <div className="divida-corpo"><b>{a.nome}</b><div className="cad-sub">{mesLabel(a.mes)} · {fmt(a.valor)}</div></div>
                    <button className="btn btn-ghost btn-sm" onClick={() => setModal({ sugestao: a })}>Adicionar ao plano</button>
                  </div>
                ))}
              </div>
              <div className="cad-sub" style={{ margin: '6px 2px 14px' }}>Contas de meses passados que continuam sem o "pago". Se já pagou, marque em Pagamentos. Se não, adicione ao plano para somar na estratégia.</div>
            </>
          )}

          {terminando.length > 0 && (
            <>
              <div className="section-label">parcelamentos do app que terminam (liberam dinheiro)</div>
              <div className="card" style={{ padding: 0 }}>
                {terminando.map((t) => (
                  <div key={t.compra.id} className="divida-linha">
                    <div className="divida-corpo"><b>{tituloCompra(t.compra)}</b><div className="cad-sub">última parcela em {mesLabel(t.termino)} · {t.parcelasRestantes} {t.parcelasRestantes === 1 ? 'parcela restante' : 'parcelas restantes'}</div></div>
                    <span className="mono" style={{ color: 'var(--green)' }}>libera {fmt(t.libera)}/mês</span>
                  </div>
                ))}
              </div>
              <div className="cad-sub" style={{ margin: '6px 2px 14px' }}>Esses já estão na sua sobra projetada: quando terminam, a sobra sobe e o plano acelera sozinho.</div>
            </>
          )}

          <div className="section-label">saldo total ao longo do tempo</div>
          <div className="card" style={{ padding: 14 }}>
            <div className="aulas-rel-barras" aria-label="Saldo devedor por mês">
              {plano.linha.slice(0, 12).map((m) => (
                <div key={m.idx} className="aulas-rel-col" title={`${mesLabel(m.mes)}: ${fmt(m.saldo)}`}>
                  <div className="aulas-rel-barra" style={{ height: `${Math.round((m.saldo / maior) * 100)}%`, background: 'var(--red)' }} />
                  <span>{mesLabel(m.mes).slice(0, 3)}</span>
                </div>
              ))}
            </div>
            <div className="cad-sub" style={{ marginTop: 8 }}>Primeiros 12 meses. Os juros contam todo mês sobre o que ainda falta; sem informar o juro, o app assume zero e o plano fica otimista. Confira os valores nos seus extratos.</div>
          </div>
        </>
      )}
    </div>
  )
}

function addMes(m, n) { const t = Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7)) - 1 + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}` }
