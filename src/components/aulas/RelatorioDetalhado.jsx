import { useMemo, useState } from 'react'
import { fmt, fmtK, nowYM, addMonths, mesLabel, hojeSP } from '../../lib/utils'
import { centavosParaReais, textoDuracao } from '../../lib/aulas'
import { relatorioDetalhado, csvDetalhado } from '../../lib/aulasRelatorioDetalhado'
import { nomeSerie, nomeSerieCurto } from '../../lib/alunosCiclo'
import { Pilulas } from '../NavMes'

const reais = (c) => fmt(centavosParaReais(c))
const pct = (x) => `${Math.round(x * 100)}%`
const dir = { textAlign: 'right' }
const dataBr = (d) => d.split('-').reverse().join('/')

// Relatório detalhado: período livre e quatro visões (por aluno, por mês, por série, risco de perda).
export default function RelatorioDetalhado({ store, metaCentavos = 0 }) {
  const { alunos, aulas, aulasFech, aulasPausas = [] } = store
  const hoje = hojeSP()
  const mesAtual = nowYM()
  const [periodo, setPeriodo] = useState('ano')
  const [custom, setCustom] = useState({ de: addMonths(mesAtual, -5), ate: mesAtual })
  const [visao, setVisao] = useState('aluno')

  const { de, ate } = useMemo(() => {
    if (periodo === 'mes') return { de: mesAtual, ate: mesAtual }
    if (periodo === '3m') return { de: addMonths(mesAtual, -2), ate: mesAtual }
    if (periodo === '12m') return { de: addMonths(mesAtual, -11), ate: mesAtual }
    if (periodo === 'custom') return custom.de <= custom.ate ? custom : { de: custom.ate, ate: custom.de }
    return { de: `${mesAtual.slice(0, 4)}-01`, ate: `${mesAtual.slice(0, 4)}-12` }
  }, [periodo, custom, mesAtual])

  const r = useMemo(() => relatorioDetalhado({ alunos, aulas, fechamentos: aulasFech, pausas: aulasPausas, de, ate, hoje, metaCentavos }), [alunos, aulas, aulasFech, aulasPausas, de, ate, hoje, metaCentavos])

  function baixar() {
    const blob = new Blob(['﻿' + csvDetalhado(r, visao)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `aulas-${visao}-${de}-a-${ate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const situacao = (p) => (!p.ativo ? <span className="badge badge-gray">encerrado</span> : p.pausado ? <span className="badge badge-amber">pausado</span> : null)

  return (
    <div className="aulas-rel">
      <div className="aulas-barra">
        <Pilulas rotulo="Período" valor={periodo} onChange={setPeriodo} opcoes={[['mes', 'Este mês'], ['3m', '3 meses'], ['ano', 'Este ano'], ['12m', '12 meses'], ['custom', 'Escolher']]} />
        <button className="btn btn-ghost btn-sm" onClick={baixar}>Baixar CSV</button>
      </div>
      {periodo === 'custom' && (
        <div className="form-row cols2" style={{ marginBottom: 10 }}>
          <div className="form-group"><label>De</label><input type="month" value={custom.de} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, de: e.target.value }))} /></div>
          <div className="form-group"><label>Até</label><input type="month" value={custom.ate} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, ate: e.target.value }))} /></div>
        </div>
      )}
      <div className="cad-sub" style={{ marginBottom: 8 }}>{mesLabel(de)}{de !== ate ? ` a ${mesLabel(ate)}` : ''}</div>

      <div className="kpi-faixa">
        <div className="kpi"><div className="kpi-rotulo">Receita</div><div className="kpi-valor verde">{fmtK(centavosParaReais(r.total.valor))}</div><div className="kpi-sub">{r.total.alunos} {r.total.alunos === 1 ? 'aluno' : 'alunos'}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Horas dadas</div><div className="kpi-valor">{textoDuracao(r.total.minutos)}</div><div className="kpi-sub">{r.total.realizadas} aulas</div></div>
        <div className="kpi"><div className="kpi-rotulo">Média por hora</div><div className="kpi-valor">{r.total.porHora == null ? '—' : reais(r.total.porHora)}</div><div className="kpi-sub">receita ÷ horas realizadas</div></div>
        <div className="kpi"><div className="kpi-rotulo">Receita em risco</div><div className="kpi-valor" style={{ color: r.risco.lista.length ? 'var(--amber)' : undefined }}>{fmtK(centavosParaReais(r.risco.valorMensal))}</div><div className="kpi-sub">por mês · {pct(r.risco.pct)} da receita</div></div>
      </div>

      <Pilulas rotulo="Visão" valor={visao} onChange={setVisao} opcoes={[['aluno', 'Por aluno'], ['mes', 'Por mês'], ['serie', 'Por série'], ['risco', 'Risco de perda']]} />

      {visao === 'aluno' && (
        r.porAluno.length === 0 ? <div className="empty">Sem aulas nesse período.</div> : (
          <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
            <table className="tabela-compacta">
              <thead><tr><th>Aluno</th><th style={dir}>Aulas</th><th className="col-opc" style={dir}>Horas</th><th style={dir}>Valor</th><th className="col-opc" style={dir}>R$/hora</th><th className="col-opc" style={dir}>% receita</th><th className="col-opc" style={dir}>Cancel.</th><th className="col-opc" style={dir}>Remarc.</th><th className="col-opc" style={dir}>Casa</th></tr></thead>
              <tbody>
                {r.porAluno.map((p) => (
                  <tr key={p.alunoId}>
                    <td>{p.nome} {situacao(p)}<div className="cad-sub">{p.serie ? nomeSerieCurto(p.serie) : 'sem série'}{p.avulsas ? ` · ${p.avulsas} avulsa${p.avulsas > 1 ? 's' : ''}` : ''}</div></td>
                    <td className="mono" style={dir}>{p.realizadas}</td>
                    <td className="mono col-opc" style={dir}>{p.minutos ? textoDuracao(p.minutos) : '—'}</td>
                    <td className="mono" style={dir}>{reais(p.valor)}</td>
                    <td className="mono col-opc" style={dir}>{p.porHora == null ? '—' : reais(p.porHora)}</td>
                    <td className="mono col-opc" style={dir}>{pct(p.pctReceita)}</td>
                    <td className="mono col-opc" style={{ ...dir, color: p.taxaCancel >= 0.25 ? 'var(--amber)' : undefined }}>{p.canceladas ? `${p.canceladas} (${pct(p.taxaCancel)})` : '—'}</td>
                    <td className="mono col-opc" style={dir}>{p.remarcacoes || '—'}</td>
                    <td className="mono col-opc" style={dir}>{p.mesesDeCasa < 1 ? '<1 mês' : `${p.mesesDeCasa} m`}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 600 }}><td>Total</td><td className="mono" style={dir}>{r.total.realizadas}</td><td className="mono col-opc" style={dir}>{textoDuracao(r.total.minutos)}</td><td className="mono" style={dir}>{reais(r.total.valor)}</td><td className="col-opc" /><td className="col-opc" /><td className="mono col-opc" style={dir}>{r.total.canceladas}</td><td className="col-opc" /><td className="col-opc" /></tr>
              </tbody>
            </table>
          </div>
        )
      )}

      {visao === 'mes' && (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="tabela-compacta">
            <thead><tr><th>Mês</th><th className="col-opc" style={dir}>Alunos</th><th style={dir}>Aulas</th><th className="col-opc" style={dir}>Horas</th><th style={dir}>Valor</th><th className="col-opc" style={dir}>R$/hora</th><th style={dir}>vs. mês ant.</th><th className="col-opc" style={dir}>A receber</th></tr></thead>
            <tbody>
              {r.meses.map((m) => (
                <tr key={m.mes} style={{ opacity: m.temAulas ? 1 : 0.45 }}>
                  <td>{mesLabel(m.mes)}{m.abaixoDaMeta && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>abaixo da meta</span>}</td>
                  <td className="mono col-opc" style={dir}>{m.alunos || '—'}</td>
                  <td className="mono" style={dir}>{m.realizadas || '—'}</td>
                  <td className="mono col-opc" style={dir}>{m.minutos ? textoDuracao(m.minutos) : '—'}</td>
                  <td className="mono" style={dir}>{m.valor ? reais(m.valor) : '—'}</td>
                  <td className="mono col-opc" style={dir}>{m.porHora == null ? '—' : reais(m.porHora)}</td>
                  <td className="mono" style={{ ...dir, color: m.variacao == null ? undefined : m.variacao < 0 ? 'var(--red)' : 'var(--green)' }}>{m.variacao == null ? '—' : `${m.variacao > 0 ? '+' : ''}${pct(m.variacao)}`}</td>
                  <td className="mono col-opc" style={dir}>{m.aReceber > 0 ? reais(m.aReceber) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {visao === 'serie' && (
        r.porSerie.length === 0 ? <div className="empty">Sem aulas nesse período.</div> : (
          <>
            <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
              <table className="tabela-compacta">
                <thead><tr><th>Série</th><th style={dir}>Alunos</th><th style={dir}>Valor</th><th className="col-opc" style={dir}>Horas</th><th className="col-opc" style={dir}>R$/hora</th><th style={dir}>% receita</th></tr></thead>
                <tbody>
                  {r.porSerie.map((g) => (
                    <tr key={g.serie || 'sem'}>
                      <td>{g.nome}</td><td className="mono" style={dir}>{g.alunos}</td><td className="mono" style={dir}>{reais(g.valor)}</td>
                      <td className="mono col-opc" style={dir}>{g.minutos ? textoDuracao(g.minutos) : '—'}</td>
                      <td className="mono col-opc" style={dir}>{g.porHora == null ? '—' : reais(g.porHora)}</td>
                      <td className="mono" style={dir}>{pct(g.pctReceita)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.porSerie.some((g) => !g.serie) && <div className="cad-sub" style={{ marginTop: 8 }}>Alunos "sem série informada": preencha a série no cadastro do aluno para o relatório ficar completo.</div>}
          </>
        )
      )}

      {visao === 'risco' && (
        r.risco.lista.length === 0 ? <div className="empty">Nenhum aluno com saída prevista ou pausa agora. Informe a série e a saída prevista no cadastro dos alunos para o app avisar.</div> : (
          <>
            <div className="alert alert-amber" style={{ marginTop: 12 }}>
              <b>{fmt(centavosParaReais(r.risco.valorMensal))}/mês</b> ({pct(r.risco.pct)} da receita mensal de {fmt(centavosParaReais(r.risco.receitaMensalTotal))}) dependem de alunos que devem sair ou estão pausados.
              <div className="cad-sub">Média dos últimos 3 meses de cada aluno.</div>
            </div>
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="tabela-compacta">
                <thead><tr><th>Aluno</th><th>Saída</th><th style={dir}>Média/mês</th></tr></thead>
                <tbody>
                  {r.risco.lista.map((x) => (
                    <tr key={x.alunoId}>
                      <td>{x.nome} <span className={`badge badge-${x.nivel === 'alto' ? 'red' : 'amber'}`}>{x.nivel === 'alto' ? 'saída próxima' : 'atenção'}</span>
                        <div className="cad-sub">{x.serie ? `${nomeSerie(x.serie)} · ` : ''}{x.motivos.join(' · ')}</div></td>
                      <td className="mono">{x.saida ? dataBr(x.saida) : '—'}</td>
                      <td className="mono" style={dir}>{reais(x.mediaMensal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      )}
    </div>
  )
}
