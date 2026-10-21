import { useMemo, useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import { DIAS, centavosParaReais, reaisParaCentavos } from '../../lib/aulas'
import { agendaSemanal, cargaMinutos, receitaMensal, mediaHora, janelasLivres, simularNovoAluno, lerLimite, CHAVE_LIMITE_HORAS } from '../../lib/aulasSimulador'
import CampoHorario from './CampoHorario'
import SeletorDuracao from './SeletorDuracao'

const reais = (c) => fmt(centavosParaReais(c))
const horasTxt = (min) => `${(min / 60).toFixed(1).replace('.', ',')} h`
const COR = { compensa: 'green', apertado: 'amber', nao: 'red', incompleto: 'blue' }
const TITULO = { compensa: '✓ Compensa e cabe na sua agenda', apertado: '⚠ Cabe, mas com ressalvas', nao: '✕ Não encaixa do jeito que está', incompleto: 'Preencha o valor por hora e os dias da semana' }
const COR_PONTO = { bom: 'var(--green)', atencao: 'var(--amber)', ruim: 'var(--red)', aviso: 'var(--blue)' }
const linhaVazia = () => ({ dia: 2, horario: '', duracao: 60 })

// "Posso aceitar mais um aluno?": simula valor/hora + dias/horários e mostra ganho, encaixe na agenda, limite de horas e meta.
export default function SimuladorAluno({ store, metaCentavos = 0, onClose }) {
  const { alunos, aulasProg, config, definirConfig } = store
  const hoje = hojeSP()
  const slots = useMemo(() => agendaSemanal(alunos, aulasProg, hoje), [alunos, aulasProg, hoje])
  const limite = lerLimite(config)
  const media = mediaHora(slots)
  const [valor, setValor] = useState(media ? String(centavosParaReais(media)).replace('.', ',') : '')
  const [linhas, setLinhas] = useState([linhaVazia()])
  const setLinha = (i, patch) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const valorCent = reaisParaCentavos(valor)
  const r = useMemo(() => simularNovoAluno({ slots, novos: linhas, valorHora: valorCent || 0, limiteMin: limite, metaCentavos, hoje }), [slots, linhas, valorCent, limite, metaCentavos, hoje])
  const diasUsados = [...new Set(linhas.map((l) => Number(l.dia)))]

  function definirLimite() {
    const t = window.prompt('Quantas horas de aula por semana você aguenta dar? (ex.: 20; vazio tira o limite)', limite ? String(limite / 60).replace('.', ',') : '')
    if (t == null) return
    if (t.trim() === '') { definirConfig(CHAVE_LIMITE_HORAS, ''); return }
    const n = Number(t.replace(',', '.'))
    if (!(n > 0 && n <= 80)) { window.alert('Digite um número de horas entre 1 e 80.'); return }
    definirConfig(CHAVE_LIMITE_HORAS, String(n))
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-title">Posso aceitar mais um aluno?</div>

        <div className="kpi-faixa" style={{ marginBottom: 12 }}>
          <div className="kpi"><div className="kpi-rotulo">Agenda hoje</div><div className="kpi-valor">{horasTxt(cargaMinutos(slots))}</div><div className="kpi-sub">por semana{limite ? ` · limite ${horasTxt(limite)}` : ''}</div></div>
          <div className="kpi"><div className="kpi-rotulo">Rende por mês</div><div className="kpi-valor verde">{reais(receitaMensal(slots))}</div><div className="kpi-sub">{metaCentavos ? `meta ${reais(metaCentavos)}` : 'só pela agenda fixa'}</div></div>
          <div className="kpi"><div className="kpi-rotulo">Média por hora</div><div className="kpi-valor">{media ? reais(media) : '—'}</div></div>
        </div>
        <div className="cad-sub" style={{ marginBottom: 10 }}>
          {limite ? <>Limite de horas por semana: <b>{horasTxt(limite)}</b>. </> : 'Você ainda não definiu um limite de horas por semana. '}
          <button className="link-btn" onClick={definirLimite}>{limite ? 'Mudar' : 'Definir limite'}</button>
        </div>

        <div className="form-group"><label>Valor por hora do novo aluno (R$)</label><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 90" /></div>

        <div className="section-label" style={{ marginTop: 8 }}>dias e horários</div>
        <div className="aluno-prog">
          {linhas.map((l, i) => (
            <div key={i} className="aluno-prog-linha">
              <label className="prog-campo prog-dia">Dia
                <select aria-label="Dia da semana" value={l.dia} onChange={(e) => setLinha(i, { dia: Number(e.target.value) })}>
                  {DIAS.map((d, n) => <option key={n} value={n}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </label>
              <label className="prog-campo">Horário<CampoHorario valor={l.horario} onChange={(h) => setLinha(i, { horario: h })} /></label>
              <label className="prog-campo">Duração<SeletorDuracao valor={l.duracao} onChange={(m) => setLinha(i, { duracao: m })} /></label>
              {linhas.length > 1 && <button type="button" className="link-btn prog-remover" onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))}>Remover este dia</button>}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setLinhas((l) => [...l, linhaVazia()])}>+ Adicionar dia</button>
        </div>

        <div className="cad-sub" style={{ margin: '10px 0 4px' }}>Horários livres nos dias escolhidos (aulas sem horário não entram na conta):</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 12 }}>
          {diasUsados.map((d) => {
            const lv = janelasLivres(slots, d)
            return <div key={d}><b>{DIAS[d].charAt(0).toUpperCase() + DIAS[d].slice(1)}:</b> {lv.length ? lv.map((j) => `${j.de}–${j.ate}`).join(' · ') : 'sem janela livre'}</div>
          })}
        </div>

        <div className={`alert alert-${COR[r.veredito]}`} style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>{TITULO[r.veredito]}</div>
          {r.veredito !== 'incompleto' && (
            <div style={{ fontSize: 13, lineHeight: 1.7 }}>
              <div>Ganho: <b>{reais(r.ganhoMensal)}/mês</b> (~{reais(r.ganhoAnual)} por ano, contando 11 meses)</div>
              <div>Carga: {horasTxt(r.antesMin)} → <b>{horasTxt(r.depoisMin)}</b> por semana{r.limiteMin ? ` (${Math.round(r.pctLimiteDepois * 100)}% do limite)` : ''}</div>
              <div>Agenda fixa: {reais(r.receitaAntes)} → <b>{reais(r.receitaDepois)}</b> por mês{metaCentavos ? ` (meta ${reais(metaCentavos)})` : ''}</div>
              {r.receitaSemSaidas !== r.receitaDepois && <div>Se os alunos com saída prevista saírem: <b>{reais(r.receitaSemSaidas)}</b> por mês</div>}
            </div>
          )}
          {r.pontos.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
              <span style={{ color: COR_PONTO[p.tipo], flex: '0 0 auto' }}>●</span><span>{p.texto}</span>
            </div>
          ))}
          <div className="cad-sub" style={{ marginTop: 8 }}>Estimativa: usa 4,33 semanas por mês e a agenda fixa de hoje (sem avulsas, reposições ou férias).</div>
        </div>

        <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  )
}
