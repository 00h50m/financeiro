import { useMemo, useState } from 'react'
import { Pilulas } from '../NavMes'
import { fmt, fmtK, nowYM, addMonths, mesLabel, hojeSP } from '../../lib/utils'
import { textoDuracao } from '../../lib/aulas'
import { relatorioAtendimentos, csvAtendimentos } from '../../lib/atendimentosRelatorio'

const dir = { textAlign: 'right' }
const pct = (x) => `${Math.round(x * 100)}%`
const dataBr = (d) => d.split('-').reverse().join('/')

// Relatório: período livre e cinco visões (serviço, cliente, mês, produto, clientes que sumiram).
export default function RelatorioAtendimentos({ store, metaMensal = 0 }) {
  const { atendimentos, pacotes = [], vendasProdutos = [], clientes } = store
  const hoje = hojeSP()
  const mesAtual = nowYM()
  const [periodo, setPeriodo] = useState('3m')
  const [custom, setCustom] = useState({ de: addMonths(mesAtual, -5), ate: mesAtual })
  const [visao, setVisao] = useState('servico')
  const { de, ate } = useMemo(() => {
    if (periodo === 'mes') return { de: mesAtual, ate: mesAtual }
    if (periodo === '3m') return { de: addMonths(mesAtual, -2), ate: mesAtual }
    if (periodo === 'ano') return { de: `${mesAtual.slice(0, 4)}-01`, ate: `${mesAtual.slice(0, 4)}-12` }
    if (periodo === '12m') return { de: addMonths(mesAtual, -11), ate: mesAtual }
    return custom.de <= custom.ate ? custom : { de: custom.ate, ate: custom.de }
  }, [periodo, custom, mesAtual])
  const r = useMemo(() => relatorioAtendimentos({ atendimentos, pacotes, vendas: vendasProdutos, clientes, de, ate, hoje, metaMensal }), [atendimentos, pacotes, vendasProdutos, clientes, de, ate, hoje, metaMensal])

  function baixar() {
    const blob = new Blob(['﻿' + csvAtendimentos(r, visao)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `atendimentos-${visao}-${de}-a-${ate}.csv`; a.click()
    URL.revokeObjectURL(url)
  }
  const vazio = <div className="card"><div className="empty">Sem dados nesse período.</div></div>

  return (
    <div className="aulas-rel" style={{ marginTop: 12 }}>
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
        <div className="kpi"><div className="kpi-rotulo">Receita</div><div className="kpi-valor verde">{fmtK(r.total.receita)}</div><div className="kpi-sub">{r.total.atendimentos} atendimentos{r.total.receitaProd > 0 ? ` + ${fmtK(r.total.receitaProd)} em produtos` : ''}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Sobra</div><div className="kpi-valor">{fmtK(r.total.lucro)}</div><div className="kpi-sub">depois do material{r.total.receitaProd > 0 ? ' e do custo dos produtos' : ''}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Ticket médio</div><div className="kpi-valor">{r.total.ticket ? fmt(r.total.ticket) : '—'}</div><div className="kpi-sub">{r.total.clientes} {r.total.clientes === 1 ? 'cliente' : 'clientes'} · {textoDuracao(r.total.minutos)}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Por hora</div><div className="kpi-valor">{r.total.porHora == null ? '—' : fmt(r.total.porHora)}</div><div className="kpi-sub">receita ÷ horas de atendimento</div></div>
      </div>
      <div className="cad-sub" style={{ marginBottom: 10 }}>Sessões de pacote entram pelo valor proporcional do pacote (valor ÷ sessões).</div>

      <Pilulas rotulo="Visão" valor={visao} onChange={setVisao} opcoes={[['servico', 'Por serviço'], ['cliente', 'Por cliente'], ['mes', 'Por mês'], ['produto', 'Produtos'], ['sumidas', `Sumiram${r.sumidas.length ? ` (${r.sumidas.length})` : ''}`]]} />

      {visao === 'servico' && (r.porServico.length === 0 ? vazio : (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="tabela-compacta">
            <thead><tr><th>Serviço</th><th style={dir}>Qtd</th><th style={dir}>Receita</th><th className="col-opc" style={dir}>Material</th><th style={dir}>Sobra</th><th className="col-opc" style={dir}>Ticket</th><th className="col-opc" style={dir}>R$/hora</th><th className="col-opc" style={dir}>%</th></tr></thead>
            <tbody>{r.porServico.map((g) => (
              <tr key={g.chave}><td>{g.nome}</td><td className="mono" style={dir}>{g.qtd}</td><td className="mono" style={dir}>{fmt(g.receita)}</td><td className="mono col-opc" style={dir}>{g.material ? fmt(g.material) : '—'}</td><td className="mono" style={dir}>{fmt(g.sobra)}</td><td className="mono col-opc" style={dir}>{fmt(g.ticket)}</td><td className="mono col-opc" style={dir}>{g.porHora == null ? '—' : fmt(g.porHora)}</td><td className="mono col-opc" style={dir}>{pct(g.pct)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {visao === 'cliente' && (r.porCliente.length === 0 ? vazio : (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="tabela-compacta">
            <thead><tr><th>Cliente</th><th style={dir}>Atend.</th><th style={dir}>Receita</th><th className="col-opc" style={dir}>Ticket</th><th className="col-opc" style={dir}>Último</th><th className="col-opc" style={dir}>%</th></tr></thead>
            <tbody>{r.porCliente.map((g) => (
              <tr key={g.chave}><td>{g.nome}</td><td className="mono" style={dir}>{g.qtd}</td><td className="mono" style={dir}>{fmt(g.receita)}</td><td className="mono col-opc" style={dir}>{fmt(g.ticket)}</td><td className="mono col-opc" style={dir}>{g.ultimo ? dataBr(g.ultimo) : '—'}</td><td className="mono col-opc" style={dir}>{pct(g.pct)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ))}

      {visao === 'mes' && (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="tabela-compacta">
            <thead><tr><th>Mês</th><th style={dir}>Atend.</th><th style={dir}>Receita</th><th className="col-opc" style={dir} title="O que entrou no caixa do mês: atendimentos, venda de pacotes e produtos">Caixa</th><th className="col-opc" style={dir}>Material</th><th style={dir}>vs. mês ant.</th></tr></thead>
            <tbody>{r.meses.map((m) => (
              <tr key={m.mes} style={{ opacity: m.temDados ? 1 : 0.45 }}>
                <td>{mesLabel(m.mes)}{m.abaixoDaMeta && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>abaixo da meta</span>}</td>
                <td className="mono" style={dir}>{m.atendimentos || '—'}</td><td className="mono" style={dir}>{m.receita ? fmt(m.receita) : '—'}</td><td className="mono col-opc" style={dir}>{m.caixa ? fmt(m.caixa) : '—'}</td><td className="mono col-opc" style={dir}>{m.material ? fmt(m.material) : '—'}</td>
                <td className="mono" style={{ ...dir, color: m.variacao == null ? undefined : m.variacao < 0 ? 'var(--red)' : 'var(--green)' }}>{m.variacao == null ? '—' : `${m.variacao > 0 ? '+' : ''}${pct(m.variacao)}`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {visao === 'produto' && (r.produtos.length === 0 ? vazio : (
        <div className="card" style={{ marginTop: 12, overflowX: 'auto' }}>
          <table className="tabela-compacta">
            <thead><tr><th>Produto</th><th style={dir}>Vendidos</th><th style={dir}>Receita</th><th style={dir}>Lucro</th></tr></thead>
            <tbody>{r.produtos.map((g) => <tr key={g.chave}><td>{g.nome}</td><td className="mono" style={dir}>{g.qtd}</td><td className="mono" style={dir}>{fmt(g.receita)}</td><td className="mono" style={dir}>{fmt(g.lucro)}</td></tr>)}</tbody>
          </table>
        </div>
      ))}

      {visao === 'sumidas' && (r.sumidas.length === 0 ? <div className="card"><div className="empty">Nenhuma cliente ativa sumida há mais de 60 dias. 🎉</div></div> : (
        <>
          <div className="alert alert-amber" style={{ marginTop: 12 }}><b>{fmt(r.sumidasPorMes)}/mês</b> deixaram de entrar com as clientes que não voltam há mais de 60 dias (média de quando vinham). Vale chamar!</div>
          <div className="card" style={{ overflowX: 'auto' }}>
            <table className="tabela-compacta">
              <thead><tr><th>Cliente</th><th>Último</th><th style={dir}>Dias sem vir</th><th style={dir}>Deixava/mês</th></tr></thead>
              <tbody>{r.sumidas.map((s) => <tr key={s.cliente.id}><td>{s.cliente.nome}</td><td className="mono">{dataBr(s.ultimo)}</td><td className="mono" style={dir}>{s.desde}</td><td className="mono" style={dir}>{fmt(s.porMes)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      ))}
    </div>
  )
}
