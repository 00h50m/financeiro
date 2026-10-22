import { useMemo, useState } from 'react'
import { fmt, hojeSP, mesLabel } from '../../lib/utils'
import { centavosParaReais, reaisParaCentavos, textoDuracao } from '../../lib/aulas'
import { planoReposicao } from '../../lib/aulasReposicao'
import { mediaHora, agendaSemanal } from '../../lib/aulasSimulador'
import { nomeSerieCurto } from '../../lib/alunosCiclo'

const reais = (c) => fmt(centavosParaReais(c))
const dataBr = (d) => d.split('-').reverse().join('/')
const HORAS = [['60', '1 h'], ['90', '1h30'], ['120', '2 h'], ['180', '3 h'], ['240', '4 h']]

// "E quando os alunos do fim do ciclo saírem?": perda de receita ao longo dos meses e quantos alunos novos repõem.
export default function ReposicaoSaidas({ store, onClose, onSimular }) {
  const { alunos, aulasProg } = store
  const hoje = hojeSP()
  const media = useMemo(() => mediaHora(agendaSemanal(alunos, aulasProg, hoje)), [alunos, aulasProg, hoje])
  const [valor, setValor] = useState(media ? String(centavosParaReais(media)).replace('.', ',') : '')
  const [duracao, setDuracao] = useState('120')
  const [antecedencia, setAntecedencia] = useState('2')
  const valorCent = reaisParaCentavos(valor) || 0
  const p = useMemo(() => planoReposicao({ alunos, programacoes: aulasProg, hoje, valorHora: valorCent, horasPorAluno: Number(duracao), antecedenciaMeses: Number(antecedencia) }), [alunos, aulasProg, hoje, valorCent, duracao, antecedencia])
  const mudancas = p.linhas.filter((l, i) => i === 0 || l.receita !== p.linhas[i - 1].receita)

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 640 }}>
        <div className="modal-title">Reposição de saídas</div>

        {p.semSaidas ? (
          <div className="empty" style={{ padding: 14 }}>
            Nenhum aluno com saída prevista. Informe a <b>série</b> (3º ano do médio e cursinho contam como saída em dezembro) ou a <b>saída prevista</b> no cadastro dos alunos para o app calcular a reposição.
          </div>
        ) : (
          <>
            <div className="kpi-faixa" style={{ marginBottom: 12 }}>
              <div className="kpi"><div className="kpi-rotulo">Agenda hoje</div><div className="kpi-valor">{reais(p.receitaHoje)}</div><div className="kpi-sub">por mês</div></div>
              <div className="kpi"><div className="kpi-rotulo">Depois das saídas</div><div className="kpi-valor ambar">{reais(p.receitaDepois)}</div><div className="kpi-sub">por mês</div></div>
              <div className="kpi"><div className="kpi-rotulo">Você perde</div><div className="kpi-valor vermelho">{reais(p.perdaTotal)}</div><div className="kpi-sub">{Math.round(p.pctPerda * 100)}% · {textoDuracao(p.minutosVagos)} por semana vagas</div></div>
            </div>

            <div className="section-label">quem sai e quando</div>
            <div className="card" style={{ marginBottom: 12, overflowX: 'auto' }}>
              <table className="tabela-compacta">
                <thead><tr><th>Aluno</th><th>Sai em</th><th style={{ textAlign: 'right' }}>Rendia/mês</th><th style={{ textAlign: 'right' }}>Captar até</th></tr></thead>
                <tbody>
                  {p.saidas.map((x) => (
                    <tr key={x.alunoId}>
                      <td>{x.nome}{x.estimada && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }} title="Sem data cadastrada: estimei dezembro pela série">estimada</span>}
                        <div className="cad-sub">{x.serie ? `${nomeSerieCurto(x.serie)} · ` : ''}libera {x.slots.map((s) => `${s.nomeDia.slice(0, 3)}${s.horario ? ` ${s.horario}` : ''} (${textoDuracao(s.duracao)})`).join(', ')}</div></td>
                      <td className="mono">{dataBr(x.saida)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{reais(x.receitaMensal)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{mesLabel(x.captarAte)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="section-label">receita da agenda mês a mês</div>
            <div className="card" style={{ marginBottom: 12, overflowX: 'auto' }}>
              <table className="tabela-compacta">
                <thead><tr><th>A partir de</th><th style={{ textAlign: 'right' }}>Receita/mês</th><th style={{ textAlign: 'right' }}>vs. hoje</th><th className="col-opc" style={{ textAlign: 'right' }}>Horas/sem.</th></tr></thead>
                <tbody>
                  {mudancas.map((l) => (
                    <tr key={l.mes}>
                      <td>{l.mes === mudancas[0].mes ? `${mesLabel(l.mes)} (hoje)` : mesLabel(l.mes)}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{reais(l.receita)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: l.perda > 0 ? 'var(--red)' : undefined }}>{l.perda > 0 ? `−${reais(l.perda)}` : '—'}</td>
                      <td className="mono col-opc" style={{ textAlign: 'right' }}>{textoDuracao(l.minutos)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="section-label">quantos alunos novos para repor</div>
            <div className="form-row cols2">
              <div className="form-group"><label>Valor por hora do aluno novo (R$)</label><input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Ex.: 90" /></div>
              <div className="form-group"><label>Horas por semana de cada um</label>
                <select value={duracao} onChange={(e) => setDuracao(e.target.value)}>{HORAS.map(([v, r]) => <option key={v} value={v}>{r}</option>)}</select>
              </div>
            </div>
            <div className="form-group"><label>Começar a captar com quantos meses de antecedência?</label>
              <select value={antecedencia} onChange={(e) => setAntecedencia(e.target.value)}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'mês' : 'meses'}</option>)}</select>
            </div>
            {valorCent > 0 ? (
              <div className="alert alert-blue" style={{ padding: 14 }}>
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Para manter {reais(p.receitaHoje)}/mês: {p.alunosNecessarios} {p.alunosNecessarios === 1 ? 'aluno novo' : 'alunos novos'}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                  Cada aluno de {textoDuracao(Number(duracao))}/semana a {reais(valorCent)}/h rende cerca de <b>{reais(p.ganhoPorAluno)}</b> por mês.
                  {' '}Isso ocupa {textoDuracao(p.alunosNecessarios * Number(duracao))} dos {textoDuracao(p.minutosVagos)} que vão vagar por semana.
                </div>
                <ul style={{ margin: '8px 0 0 16px', fontSize: 13, lineHeight: 1.7 }}>
                  {p.saidas.map((x) => <li key={x.alunoId}>Para repor {x.nome} ({dataBr(x.saida)}): {x.alunosParaRepor} {x.alunosParaRepor === 1 ? 'aluno' : 'alunos'} — comece a captar em <b>{mesLabel(x.captarAte)}</b></li>)}
                </ul>
                {onSimular && <button className="link-btn" style={{ marginTop: 8 }} onClick={onSimular}>Simular um desses alunos novos →</button>}
              </div>
            ) : <div className="cad-sub">Informe o valor por hora do aluno novo para ver quantos alunos precisa captar.</div>}
            {p.semDataOuSerie > 0 && <div className="cad-sub" style={{ marginTop: 8 }}>{p.semDataOuSerie} aluno{p.semDataOuSerie > 1 ? 's' : ''} ativo{p.semDataOuSerie > 1 ? 's' : ''} sem série nem saída prevista: não entram na conta. Preencha no cadastro para ficar completo.</div>}
            <div className="cad-sub" style={{ marginTop: 8 }}>Estimativa pela agenda fixa de hoje (4,33 semanas por mês), sem avulsas, reposições ou férias. A receita cai no mês seguinte à saída.</div>
          </>
        )}
        <div className="modal-footer"><button className="btn btn-ghost" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  )
}
