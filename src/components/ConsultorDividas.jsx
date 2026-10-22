import { useState } from 'react'
import { fmt, mesLabel } from '../lib/utils'
import { pedirConsultorDividas } from '../lib/automacoes'

const CHAVE = 'consultor_dividas_ultimo'
const ler = () => { try { return JSON.parse(localStorage.getItem(CHAVE) || 'null') } catch { return null } }
const gravar = (v) => { try { localStorage.setItem(CHAVE, JSON.stringify(v)) } catch { /* sem armazenamento: não lembra */ } }
const SITUACAO = { vermelho: ['red', '🔴 No vermelho'], apertado: ['amber', '🟠 Apertado'], controlado: ['green', '🟢 Sob controle'] }
const dataBr = (iso) => new Date(iso).toLocaleDateString('pt-BR')

function Passos({ fase, numeracao }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>{numeracao}. {fase.titulo}</div>
      <ol style={{ margin: '0 0 0 18px', padding: 0, fontSize: 13, lineHeight: 1.7 }}>
        {fase.passos.map((p, i) => (
          <li key={i} style={{ marginBottom: 6 }}>
            <b>{p.acao}</b>{p.valor != null && <span className="mono"> · {fmt(p.valor)}</span>}{p.quando && <span className="cad-sub"> · {/^\d{4}-\d{2}$/.test(p.quando) ? mesLabel(p.quando) : p.quando}</span>}
            <div className="cad-sub">{p.por_que}</div>
          </li>
        ))}
      </ol>
    </div>
  )
}

// Consultor com IA: plano em duas fases (estabilizar o mês, depois quitar) e perguntas de "e se...". Os números vêm do app; a IA explica e prioriza.
export default function ConsultorDividas({ montarContexto }) {
  const [salvo, setSalvo] = useState(ler)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [pergunta, setPergunta] = useState('')
  const [respostas, setRespostas] = useState([])
  const [perguntando, setPerguntando] = useState(false)

  async function gerar() {
    setCarregando(true); setErro('')
    const r = await pedirConsultorDividas(montarContexto())
    setCarregando(false)
    if (!r.ok) { setErro(r.erro); return }
    const novo = { quando: new Date().toISOString(), plano: r.plano }
    gravar(novo); setSalvo(novo); setRespostas([])
  }
  async function perguntar(e) {
    e.preventDefault()
    const q = pergunta.trim()
    if (!q) return
    setPerguntando(true); setErro('')
    const r = await pedirConsultorDividas(montarContexto(), q)
    setPerguntando(false)
    if (!r.ok) { setErro(r.erro); return }
    setRespostas((l) => [{ q, resposta: r.resposta, impacto: r.impacto }, ...l])
    setPergunta('')
  }
  const plano = salvo?.plano
  const [cor, rotulo] = SITUACAO[plano?.situacao] || SITUACAO.apertado

  return (
    <>
      <div className="section-label">consultor com IA</div>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={gerar} disabled={carregando}>{carregando ? 'Montando seu plano…' : plano ? 'Gerar de novo' : 'Gerar meu plano'}</button>
          {plano && <span className="cad-sub">gerado em {dataBr(salvo.quando)}</span>}
        </div>
        {!plano && !carregando && <div className="cad-sub" style={{ marginTop: 8 }}>A IA lê suas dívidas, a sobra real e os gastos do dia a dia e monta um plano em duas fases: primeiro estabilizar o mês, depois quitar. Os números vêm do app; ela só explica e prioriza.</div>}
        {erro && <div className="alert alert-amber" style={{ marginTop: 10, marginBottom: 0 }}>{erro}</div>}

        {plano && (
          <div style={{ marginTop: 14 }}>
            <div className={`alert alert-${cor}`} style={{ padding: 12 }}>
              <b>{rotulo}</b>
              <div style={{ fontSize: 13, marginTop: 4 }}>{plano.resumo}</div>
            </div>
            {plano.fase1.passos.length > 0 && <Passos fase={plano.fase1} numeracao="1" />}
            {plano.fase2.passos.length > 0 && <Passos fase={plano.fase2} numeracao="2" />}
            {plano.tetos_semanais.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Teto por semana</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {plano.tetos_semanais.map((t) => <span key={t.categoria} className="badge badge-blue" style={{ fontSize: 12 }}>{t.categoria}: {fmt(t.valor)}</span>)}
                </div>
              </div>
            )}
            {plano.alertas.length > 0 && (
              <div className="alert alert-amber" style={{ fontSize: 13 }}>
                {plano.alertas.map((a, i) => <div key={i}>⚠ {a}</div>)}
              </div>
            )}
            <div className="cad-sub">Sugestão gerada por IA com base nos seus dados: confira antes de agir. Não é aconselhamento financeiro profissional.</div>
          </div>
        )}

        {plano && (
          <form onSubmit={perguntar} style={{ marginTop: 14 }}>
            <div className="form-group"><label>Pergunte um “e se…”</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={pergunta} onChange={(e) => setPergunta(e.target.value)} placeholder="E se eu cortar R$ 300 de lazer?" maxLength={300} />
                <button className="btn btn-ghost" type="submit" disabled={perguntando || !pergunta.trim()}>{perguntando ? '…' : 'Perguntar'}</button>
              </div>
            </div>
            {respostas.map((r, i) => (
              <div key={i} className="card" style={{ padding: 12, marginBottom: 8 }}>
                <div className="cad-sub">Você: {r.q}</div>
                <div style={{ fontSize: 13, marginTop: 4 }}>{r.resposta}</div>
                {r.impacto && <div className="cad-sub" style={{ marginTop: 4 }}>Impacto: {r.impacto}</div>}
              </div>
            ))}
          </form>
        )}
      </div>
    </>
  )
}
