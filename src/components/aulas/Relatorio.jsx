import { useMemo, useState } from 'react'
import { fmt, fmtK, nowYM } from '../../lib/utils'
import { centavosParaReais, textoDuracao } from '../../lib/aulas'
import { anosComAulas, csvRelatorio, relatorioAnual } from '../../lib/aulasRelatorio'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const reais = (c) => fmt(centavosParaReais(c))

// Relatório do ano: mês a mês (valor, horas, cancelamentos, recebimentos) e por aluno; destaca os meses fracos.
export default function Relatorio({ alunos, aulas, aulasFech, alunoId, metaCentavos = 0 }) {
  const anoAtual = Number(nowYM().slice(0, 4))
  const [ano, setAno] = useState(anoAtual)
  const anos = useMemo(() => anosComAulas(aulas, anoAtual), [aulas, anoAtual])
  const r = useMemo(() => relatorioAnual(alunos, aulas, aulasFech, ano, alunoId || null), [alunos, aulas, aulasFech, ano, alunoId])
  const maior = Math.max(1, ...r.meses.map((m) => m.valor))

  function baixar() {
    const blob = new Blob(['﻿' + csvRelatorio(r)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `aulas-${ano}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="aulas-rel">
      <div className="aulas-barra">
        <div className="aulas-visao" role="group" aria-label="Ano">
          {anos.map((a) => <button key={a} className={a === ano ? 'ativo' : ''} onClick={() => setAno(a)}>{a}</button>)}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={baixar}>Baixar CSV</button>
      </div>

      <div className="kpi-faixa">
        <div className="kpi"><div className="kpi-rotulo">Valor no ano</div><div className="kpi-valor verde">{fmtK(centavosParaReais(r.total.valor))}</div><div className="kpi-sub">média {fmtK(centavosParaReais(r.media))}/mês · realizadas + previstas</div></div>
        <div className="kpi"><div className="kpi-rotulo">Aulas realizadas</div><div className="kpi-valor">{r.total.realizadas}</div><div className="kpi-sub">{textoDuracao(r.total.minutos)}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Sem cobrança</div><div className="kpi-valor">{r.total.canceladas}</div><div className="kpi-sub">canceladas e não realizadas</div></div>
        <div className="kpi"><div className="kpi-rotulo">Recebido</div><div className="kpi-valor">{fmtK(centavosParaReais(r.total.recebido))}</div><div className="kpi-sub">{r.total.aReceber > 0 ? `${fmtK(centavosParaReais(r.total.aReceber))} a receber` : 'nada a receber'}</div></div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div className="aulas-rel-barras" aria-label="Valor por mês">
          {r.meses.map((m, i) => (
            <div key={m.mes} className={`aulas-rel-col ${m.fraco ? 'fraco' : ''}`} title={`${MESES[i]}: ${reais(m.valor)}`}>
              <div className="aulas-rel-barra" style={{ height: `${Math.round((m.valor / maior) * 100)}%` }} />
              <span>{MESES[i]}</span>
            </div>
          ))}
        </div>
        {metaCentavos > 0 && !alunoId && (() => {
          const abaixo = r.meses.filter((m) => m.temAulas && m.valor < metaCentavos)
          return <div className="cad-sub" style={{ marginTop: 8 }}>Meta de {reais(metaCentavos)} por mês: {abaixo.length ? `abaixo em ${abaixo.map((m) => MESES[Number(m.mes.slice(5)) - 1]).join(', ')}.` : 'atingida em todos os meses com aulas.'}</div>
        })()}
        {r.fracos.length > 0 && <div className="cad-sub" style={{ marginTop: 8 }}>Meses fracos (abaixo de 60% da média): {r.fracos.map((m) => MESES[Number(m.slice(5)) - 1]).join(', ')}.</div>}
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <table className="tabela-compacta">
          <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Aulas</th><th className="col-opc" style={{ textAlign: 'right' }}>Horas</th><th className="col-opc" style={{ textAlign: 'right' }}>Sem cobr.</th><th style={{ textAlign: 'right' }}>Valor</th><th className="col-opc" style={{ textAlign: 'right' }}>Recebido</th></tr></thead>
          <tbody>
            {r.meses.map((m, i) => (
              <tr key={m.mes} style={{ opacity: m.temAulas ? 1 : 0.45 }}>
                <td>{MESES[i]}{m.fechado && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>fechado</span>}{m.fraco && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>fraco</span>}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{m.realizadas || '—'}</td>
                <td className="mono col-opc" style={{ textAlign: 'right' }}>{m.minutos ? textoDuracao(m.minutos) : '—'}</td>
                <td className="mono col-opc" style={{ textAlign: 'right' }}>{m.canceladas || '—'}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{m.valor ? reais(m.valor) : '—'}</td>
                <td className="mono col-opc" style={{ textAlign: 'right' }}>{m.recebido ? reais(m.recebido) : '—'}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 600 }}>
              <td>Total</td><td className="mono" style={{ textAlign: 'right' }}>{r.total.realizadas}</td><td className="mono col-opc" style={{ textAlign: 'right' }}>{textoDuracao(r.total.minutos)}</td>
              <td className="mono col-opc" style={{ textAlign: 'right' }}>{r.total.canceladas}</td><td className="mono" style={{ textAlign: 'right' }}>{reais(r.total.valor)}</td><td className="mono col-opc" style={{ textAlign: 'right' }}>{reais(r.total.recebido)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {!alunoId && r.porAluno.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <table className="tabela-compacta">
            <thead><tr><th>Aluno</th><th style={{ textAlign: 'right' }}>Aulas</th><th className="col-opc" style={{ textAlign: 'right' }}>Horas</th><th className="col-opc" style={{ textAlign: 'right' }}>Sem cobr.</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
            <tbody>
              {r.porAluno.map((p) => (
                <tr key={p.alunoId}><td>{p.nome}</td><td className="mono" style={{ textAlign: 'right' }}>{p.realizadas}</td><td className="mono col-opc" style={{ textAlign: 'right' }}>{textoDuracao(p.minutos)}</td><td className="mono col-opc" style={{ textAlign: 'right' }}>{p.canceladas}</td><td className="mono" style={{ textAlign: 'right' }}>{reais(p.valor)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
