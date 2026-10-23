import { useMemo, useState } from 'react'
import { fmt, fmtK, mesLabel, hojeSP, nowYM } from '../lib/utils'
import { perfilDeLinhas, projecaoRenda } from '../lib/rendaSazonal'
import { reservaVariavel, sobraReal, CHAVE_RESERVA_AJUSTES } from '../lib/gastoVariavel'
import { montarContextoExpert, snapshotDoPlano, contextoDaPergunta } from '../lib/expertPlano'
import { tetosDaSemana, acompanhamentoSemana } from '../lib/semanaPlano'
import { pedirExpertPlano } from '../lib/automacoes'

const SITUACAO = { vermelho: ['red', '🔴 No vermelho'], apertado: ['amber', '🟠 Apertado'], controlado: ['green', '🟢 Sob controle'] }
const TIPO = { adiar: 'adiar', cortar: 'cortar', renegociar: 'renegociar', aumentar_renda: 'mais renda', pagar: 'pagar', guardar: 'guardar', outro: 'ação' }
const COR_TIPO = { adiar: 'badge-amber', cortar: 'badge-red', renegociar: 'badge-blue', aumentar_renda: 'badge-green', pagar: 'badge-gray', guardar: 'badge-green', outro: 'badge-gray' }
const dataBr = (iso) => new Date(iso).toLocaleDateString('pt-BR')
const quando = (q) => (q && /^\d{4}-\d{2}$/.test(q) ? mesLabel(q) : q)

function PlanoView({ plano }) {
  const [cor, rotulo] = SITUACAO[plano.situacao] || SITUACAO.apertado
  return (
    <div>
      <div className={`alert alert-${cor}`} style={{ padding: 14 }}>
        <b>{rotulo}</b>
        <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>{plano.resumo}</div>
        {(plano.meta?.sobra_mensal_alvo != null || plano.meta?.mes_de_volta_ao_azul) && (
          <div style={{ fontSize: 13, marginTop: 8 }}>
            {plano.meta.mes_de_volta_ao_azul && <>Volta ao azul em <b>{mesLabel(plano.meta.mes_de_volta_ao_azul)}</b>. </>}
            {plano.meta.sobra_mensal_alvo != null && <>Meta de sobra: <b>{fmt(plano.meta.sobra_mensal_alvo)}</b> por mês.</>}
          </div>
        )}
      </div>

      {plano.diagnostico.length > 0 && (
        <>
          <div className="section-label">por que está no vermelho</div>
          <div className="card" style={{ padding: 14 }}>
            <ul style={{ margin: '0 0 0 16px', fontSize: 13, lineHeight: 1.8 }}>{plano.diagnostico.map((d, i) => <li key={i}>{d}</li>)}</ul>
          </div>
        </>
      )}

      <div className="section-label">o que fazer (em ordem)</div>
      <div className="card" style={{ padding: 14 }}>
        <ol style={{ margin: '0 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.7 }}>
          {plano.acoes.map((a, i) => (
            <li key={i} style={{ marginBottom: 8 }}>
              <span className={`badge ${COR_TIPO[a.tipo]}`} style={{ marginRight: 6, fontSize: 10 }}>{TIPO[a.tipo]}</span>
              <b>{a.acao}</b>{a.valor != null && <span className="mono"> · {fmt(a.valor)}</span>}{a.quando && <span className="cad-sub"> · {quando(a.quando)}</span>}
              <div className="cad-sub">{a.por_que}</div>
            </li>
          ))}
        </ol>
      </div>

      {plano.cronograma.length > 0 && (
        <>
          <div className="section-label">próximos meses</div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="tabela-compacta">
              <thead><tr><th>Mês</th><th>Objetivo</th><th style={{ textAlign: 'right' }}>Sobra prevista</th></tr></thead>
              <tbody>
                {plano.cronograma.map((c) => (
                  <tr key={c.mes}><td>{mesLabel(c.mes)}</td><td>{c.objetivo}</td><td className="mono" style={{ textAlign: 'right', color: c.sobra_prevista != null && c.sobra_prevista < 0 ? 'var(--red)' : undefined }}>{c.sobra_prevista == null ? '—' : fmt(c.sobra_prevista)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {plano.tetos_semanais.length > 0 && (
        <>
          <div className="section-label">teto por semana</div>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{plano.tetos_semanais.map((t) => <span key={t.categoria} className="badge badge-blue" style={{ fontSize: 12 }}>{t.categoria}: {fmt(t.valor)}</span>)}</div>
          </div>
        </>
      )}

      {plano.regras_do_dia_a_dia.length > 0 && (
        <>
          <div className="section-label">regras do dia a dia</div>
          <div className="card" style={{ padding: 14 }}>
            <ul style={{ margin: '0 0 0 16px', fontSize: 13, lineHeight: 1.8 }}>{plano.regras_do_dia_a_dia.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
        </>
      )}

      {plano.alertas.length > 0 && <div className="alert alert-amber" style={{ fontSize: 13 }}>{plano.alertas.map((a, i) => <div key={i}>⚠ {a}</div>)}</div>}
      <div className="cad-sub">Sugestão gerada por IA com base nos seus dados lançados: confira antes de agir. Não é aconselhamento financeiro profissional.</div>
    </div>
  )
}

const COR_STATUS = { ok: 'var(--green)', atencao: 'var(--amber)', estourou: 'var(--red)' }
const VEREDITO = { pode: ['badge-green', 'pode'], com_cuidado: ['badge-amber', 'com cuidado'], melhor_nao: ['badge-red', 'melhor não'], informacao: ['badge-gray', 'informação'] }
const dm = (iso) => iso.split('-').reverse().slice(0, 2).join('/')

function BarraTeto({ item }) {
  const largura = Math.min(100, Math.round(item.pct * 100))
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
        <span><b>{item.categoria}</b>{item.ritmo && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }} title="No ritmo de hoje, a semana fecharia acima do teto">no ritmo de estourar</span>}</span>
        <span className="mono">{fmt(item.gasto)} <span className="cad-sub">/ {fmt(item.teto)}</span></span>
      </div>
      <div className="prog-bar" style={{ height: 8 }}><div className="prog-fill" style={{ width: `${largura}%`, background: COR_STATUS[item.status] }} /></div>
      <div className="cad-sub">{item.restante >= 0 ? `restam ${fmt(item.restante)}` : <span style={{ color: 'var(--red)' }}>passou {fmt(-item.restante)}</span>}</div>
    </div>
  )
}

// Meu plano: o expert lê tudo que o app sabe e monta o plano para voltar a sobrar. Cada plano gerado fica no histórico.
export default function MeuPlano({ store }) {
  const { planosVida = [], planosVidaOk, salvarPlanoVida } = store
  const hoje = nowYM()
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [local, setLocal] = useState(null) // plano gerado sem a tabela de histórico
  const [vendo, setVendo] = useState(null) // id de um plano antigo
  const perfil = useMemo(() => perfilDeLinhas(store.rendaSazonal), [store.rendaSazonal])
  const projecao = useMemo(() => projecaoRenda(store, perfil, hoje, 24), [store, perfil, hoje])
  const ajustes = store.configOk && store.config?.[CHAVE_RESERVA_AJUSTES] && typeof store.config[CHAVE_RESERVA_AJUSTES] === 'object' ? store.config[CHAVE_RESERVA_AJUSTES] : {}
  const reserva = useMemo(() => reservaVariavel(store.compras, hoje, { ajustes }), [store.compras, hoje, ajustes])
  const real = useMemo(() => sobraReal(projecao, reserva, hoje), [projecao, reserva, hoje])
  const vermelho = real.slice(0, 12).filter((m) => m.sobraReal < -0.005)
  const media = real.slice(0, 12).reduce((t, m) => t + m.sobraReal, 0) / 12
  const atual = planosVida.find((p) => p.ativo) || planosVida[0] || null
  const planoAtual = atual?.plano || local?.plano || null
  const hojeISO = hojeSP()
  const acomp = useMemo(() => acompanhamentoSemana({ compras: store.compras, tetos: tetosDaSemana(planoAtual, reserva), hoje: hojeISO }), [store.compras, planoAtual, reserva, hojeISO])
  const [pergunta, setPergunta] = useState('')
  const [respostas, setRespostas] = useState([])
  const [perguntando, setPerguntando] = useState(false)
  const exibido = vendo ? planosVida.find((p) => p.id === vendo) : atual
  const plano = exibido?.plano || local?.plano
  const geradoEm = exibido?.criado_em || local?.quando

  async function gerar() {
    setCarregando(true); setErro('')
    const sobrasOrcamento = real.map((m) => Math.max(0, m.sobraReal))
    const r = await pedirExpertPlano(montarContextoExpert(store, { hoje: hojeSP(), real, reserva, sobrasOrcamento, planoAnterior: atual }))
    if (!r.ok) { setCarregando(false); setErro(r.erro); return }
    setVendo(null)
    if (planosVidaOk) await salvarPlanoVida({ objetivo: 'sair_do_vermelho', situacao: r.plano.situacao, resumo: r.plano.resumo, plano: r.plano, snapshot: snapshotDoPlano(store, { real, reserva }) })
    else setLocal({ plano: r.plano, quando: new Date().toISOString() })
    setCarregando(false)
  }

  async function perguntar(e) {
    e.preventDefault()
    const q = pergunta.trim()
    if (!q) return
    setPerguntando(true); setErro('')
    const base = montarContextoExpert(store, { hoje: hojeISO, real, reserva, sobrasOrcamento: real.map((m) => Math.max(0, m.sobraReal)), planoAnterior: null })
    const r = await pedirExpertPlano(contextoDaPergunta(base, { acompanhamento: acomp, plano: planoAtual }), q)
    setPerguntando(false)
    if (!r.ok) { setErro(r.erro); return }
    setRespostas((l) => [{ q, ...r }, ...l].slice(0, 6))
    setPergunta('')
  }

  return (
    <div className="page">
      <div className="kpi-faixa" aria-label="Seu momento">
        <div className="kpi"><div className="kpi-rotulo">Sobra real média</div><div className={`kpi-valor ${media < 0 ? 'vermelho' : 'verde'}`}>{fmtK(media)}</div><div className="kpi-sub">por mês, próximos 12 meses</div></div>
        <div className="kpi"><div className="kpi-rotulo">Meses no vermelho</div><div className={`kpi-valor ${vermelho.length ? 'vermelho' : 'verde'}`}>{vermelho.length}</div><div className="kpi-sub">{vermelho.length ? `a partir de ${mesLabel(vermelho[0].mes)}` : 'de 12 projetados'}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Dia a dia reservado</div><div className="kpi-valor ambar">{fmtK(reserva.total)}</div><div className="kpi-sub">por mês (média dos gastos)</div></div>
      </div>

      <div className="section-label">esta semana ({dm(acomp.semana.inicio)} a {dm(acomp.semana.fim)}) · {acomp.semana.diasRestantes} {acomp.semana.diasRestantes === 1 ? 'dia' : 'dias'} para o fim</div>
      <div className="card" style={{ padding: 14 }}>
        {acomp.itens.length === 0 ? (
          <div className="cad-sub">Ainda não há tetos por semana. Lance as compras do dia a dia (combustível, mercado…) ou gere o plano: o app acompanha o gasto de cada categoria contra o teto.</div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
              <span><b className="mono" style={{ fontSize: 18, color: COR_STATUS[acomp.total.status] }}>{fmt(acomp.total.gasto)}</b> <span className="cad-sub">de {fmt(acomp.total.teto)} no dia a dia</span></span>
              <span className="cad-sub">{acomp.total.restante >= 0 ? `restam ${fmt(acomp.total.restante)}` : `passou ${fmt(-acomp.total.restante)}`}</span>
            </div>
            {acomp.itens.map((i) => <BarraTeto key={i.categoria} item={i} />)}
            {acomp.semTeto.length > 0 && <div className="cad-sub">Sem teto: {acomp.semTeto.slice(0, 4).map((x) => `${x.categoria} ${fmt(x.gasto)}`).join(' · ')}</div>}
            <div className="cad-sub" style={{ marginTop: 6 }}>Tetos {acomp.itens[0].origem === 'plano' ? 'do seu plano' : 'pela média dos últimos 3 meses (gere o plano para ajustar)'}. Conta só compras à vista ou em 1x.</div>
            {acomp.total.teto > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                {acomp.anteriores.map((a) => <span key={a.inicio} className={`badge ${a.status === 'estourou' ? 'badge-red' : a.status === 'atencao' ? 'badge-amber' : 'badge-green'}`} style={{ fontSize: 11 }} title="Semana que começou nesse dia">{dm(a.inicio)}: {fmt(a.gasto)}</span>)}
              </div>
            )}
          </>
        )}
      </div>

      <form className="card" style={{ padding: 14 }} onSubmit={perguntar}>
        <div className="form-group" style={{ marginBottom: 6 }}><label>Pergunte antes de gastar</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="Posso gastar R$ 150 no mercado hoje?" maxLength={300} />
            <button className="btn btn-primary" type="submit" disabled={perguntando || !pergunta.trim()}>{perguntando ? '…' : 'Perguntar'}</button>
          </div>
        </div>
        {respostas.map((r, i) => (
          <div key={i} className="card" style={{ padding: 12, marginTop: 8 }}>
            <div className="cad-sub">Você: {r.q}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}><span className={`badge ${VEREDITO[r.veredito]?.[0] || 'badge-gray'}`} style={{ marginRight: 6, fontSize: 10 }}>{VEREDITO[r.veredito]?.[1] || 'informação'}</span>{r.resposta}</div>
            {r.impacto && <div className="cad-sub" style={{ marginTop: 4 }}>{r.impacto}</div>}
          </div>
        ))}
        {!respostas.length && <div className="cad-sub">O expert responde com a sua semana, os tetos e a sobra do mês. Dá para perguntar de qualquer gasto.</div>}
      </form>

      {!planosVidaOk && <div className="alert alert-blue"><strong>Quer guardar o histórico dos planos?</strong> Rode o arquivo <code>inbox/36_planos_vida.sql</code> no SQL Editor do Supabase e recarregue a página. Sem ele, o plano aparece mas não fica salvo.</div>}

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={gerar} disabled={carregando}>{carregando ? 'O expert está analisando…' : plano ? 'Revisar meu plano' : 'Montar meu plano'}</button>
          {geradoEm && <span className="cad-sub">plano de {dataBr(geradoEm)}{vendo ? ' (antigo)' : ''}</span>}
          {vendo && <button className="link-btn" onClick={() => setVendo(null)}>ver o plano atual</button>}
        </div>
        {!plano && !carregando && <div className="cad-sub" style={{ marginTop: 8 }}>O expert lê sua renda, contas fixas, parcelas, faturas, dívidas, reserva, aulas e gastos do dia a dia e monta um plano para voltar a sobrar mantendo seu padrão de vida o máximo possível. Os números vêm do app; a IA explica e prioriza. Quanto mais você lança os gastos do dia a dia, mais preciso fica.</div>}
        {erro && <div className="alert alert-amber" style={{ marginTop: 10, marginBottom: 0 }}>{erro}</div>}
      </div>

      {plano && <PlanoView plano={plano} />}

      {planosVida.length > 1 && (
        <>
          <div className="section-label">histórico de planos</div>
          <div className="card" style={{ padding: 0 }}>
            {planosVida.map((p) => (
              <div key={p.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                <div style={{ minWidth: 0 }}>
                  <b>{dataBr(p.criado_em)}</b>{p.ativo && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>atual</span>}
                  <div className="cad-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.resumo}</div>
                  {p.snapshot && <div className="cad-sub">sobra real média {fmt(p.snapshot.sobra_real_media_12m)} · {p.snapshot.meses_no_vermelho} {p.snapshot.meses_no_vermelho === 1 ? 'mês' : 'meses'} no vermelho</div>}
                </div>
                <button className="link-btn" onClick={() => setVendo(p.ativo ? null : p.id)}>ver</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
