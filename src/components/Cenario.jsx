import { useMemo, useState } from 'react'
import NavMes from './NavMes'
import { fmt, fmtK, mesLabel, nowYM, addMonths, tituloCompra } from '../lib/utils'
import { detalhePagamentos, acrescimoAdiamento } from '../lib/financeiro'
import { gravarPrefAdiar, lerPct, lerPrefAdiar } from '../lib/adiamentoPref'
import { perfilDeLinhas, projecaoRenda } from '../lib/rendaSazonal'

const MESES_VISTOS = 7

// "E se eu adiar?": escolhe contas sem cartão (boleto, Pix, conta fixa) de um mês, simula passar para outro mês e compara a sobra
// de cada mês antes e depois. NADA é gravado até apertar "Aplicar".
export default function Cenario({ store }) {
  const { adiamentosOk, adiarVarias } = store
  const [mes, setMes] = useState(nowYM())
  const [mover, setMover] = useState({}) // chave "tipo|id" -> mês de destino
  const [aplicando, setAplicando] = useState(false)
  const pref = useMemo(() => lerPrefAdiar(), [])
  const [multa, setMulta] = useState(String(pref.multa).replace('.', ','))
  const [juros, setJuros] = useState(String(pref.juros).replace('.', ','))
  const [semAcrescimo, setSemAcrescimo] = useState(false)
  const perfil = useMemo(() => perfilDeLinhas(store.rendaSazonal), [store.rendaSazonal])

  const candidatas = useMemo(() => {
    const det = detalhePagamentos(store, mes)
    const fixos = det.fixosLista.filter((f) => !f.adiadoDe && !det.fixoPagamento(f)?.pago).map((f) => ({ chave: `fixo|${f.id}`, tipo: 'fixo', id: f.id, titulo: f.nome, valor: Number(f.valor), dia: f.dia_vencimento }))
    const parcelas = det.outrasContas.filter((c) => !c.adiadoDe && !c.pago).map((c) => ({ chave: `compra|${c.id}`, tipo: 'compra', id: c.id, titulo: `${tituloCompra(c)}${c.parcelaTotal > 1 ? ` (${c.parcelaNum}/${c.parcelaTotal})` : ''}`, valor: Number(c.valorParcela) }))
    return [...fixos, ...parcelas]
  }, [store, mes])

  const simulados = candidatas.filter((c) => mover[c.chave]).map((c) => ({ id: `sim-${c.chave}`, tipo: c.tipo, ref_id: c.id, mes_origem: mes, mes_destino: mover[c.chave], acrescimo: semAcrescimo ? 0 : acrescimoAdiamento(c.valor, mes, mover[c.chave], lerPct(multa), lerPct(juros)) }))
  const antes = useMemo(() => projecaoRenda(store, perfil, mes, MESES_VISTOS), [store, perfil, mes])
  const depois = useMemo(() => projecaoRenda({ ...store, adiamentos: [...(store.adiamentos || []), ...simulados] }, perfil, mes, MESES_VISTOS), [store, perfil, mes, simulados])
  const acum = (lista) => { let a = 0; return lista.map((m) => (a += m.sobra)) }
  const acumAntes = acum(antes)
  const acumDepois = acum(depois)
  const custoExtra = simulados.reduce((t, s) => t + s.acrescimo, 0)
  const movido = candidatas.filter((c) => mover[c.chave]).reduce((t, c) => t + c.valor, 0)
  const ficouVermelho = depois.filter((m, i) => m.sobra < -0.005 && antes[i].sobra >= -0.005).map((m) => mesLabel(m.mes))
  const saiuVermelho = depois.filter((m, i) => m.sobra >= -0.005 && antes[i].sobra < -0.005).map((m) => mesLabel(m.mes))
  const opcoes = Array.from({ length: 6 }, (_, i) => addMonths(mes, i + 1))

  async function aplicar() {
    if (!simulados.length) return
    if (!window.confirm(`Adiar ${simulados.length} ${simulados.length === 1 ? 'conta' : 'contas'} de verdade? Elas saem de ${mesLabel(mes)} e entram nos meses escolhidos. Você pode voltar cada uma depois, em Pagamentos.`)) return
    setAplicando(true)
    const ok = (gravarPrefAdiar(lerPct(multa), lerPct(juros)), await adiarVarias(simulados.map((s) => ({ tipo: s.tipo, refId: s.ref_id, mesOrigem: s.mes_origem, mesDestino: s.mes_destino, acrescimo: s.acrescimo }))))
    setAplicando(false)
    if (ok) setMover({})
  }

  if (!adiamentosOk) {
    return <div className="page"><div className="alert alert-amber"><strong>Falta criar a tabela de contas adiadas.</strong> Rode o arquivo <code>inbox/26_adiamentos.sql</code> no SQL Editor do Supabase e recarregue esta página.</div></div>
  }

  return (
    <div className="page">
      <div className="pag-topo"><NavMes mes={mes} onChange={(m) => { setMes(m); setMover({}) }} /></div>
      <div className="alert alert-blue">Simulação: escolha as contas que você não consegue pagar em <b>{mesLabel(mes)}</b> e para qual mês iriam. A tabela mostra como ficam os próximos meses. Nada é salvo até você apertar <b>Aplicar</b>.</div>

      <div className="card" style={{ padding: 14 }}>
        <div className="form-row cols2">
          <div className="form-group"><label>Multa por atraso (%)</label><input inputMode="decimal" value={multa} onChange={(e) => setMulta(e.target.value)} disabled={semAcrescimo} /></div>
          <div className="form-group"><label>Juros ao mês (%)</label><input inputMode="decimal" value={juros} onChange={(e) => setJuros(e.target.value)} disabled={semAcrescimo} /></div>
        </div>
        <label className="check-linha" style={{ marginBottom: 0 }}><input type="checkbox" checked={semAcrescimo} onChange={(e) => setSemAcrescimo(e.target.checked)} /> Simular sem multa nem juros</label>
        <div className="cad-sub" style={{ marginTop: 6 }}>Padrão comum de boleto: 2% de multa + 1% ao mês. Confira no seu boleto. Os juros contam por mês de atraso, até o mês escolhido.</div>
      </div>

      <div className="card">
        {candidatas.length === 0 ? (
          <div className="empty">Nenhuma conta sem cartão em aberto em {mesLabel(mes)}.{'\n'}Aqui entram boletos, Pix e contas fixas pagas à parte, ainda não pagas.</div>
        ) : (
          <table className="tabela-compacta">
            <thead><tr><th>Conta</th><th style={{ textAlign: 'right' }}>Valor</th><th>Mover para</th></tr></thead>
            <tbody>
              {candidatas.map((c) => (
                <tr key={c.chave}>
                  <td className="nome-cel" style={{ fontWeight: 500 }}>{c.titulo}{c.dia ? <div className="cad-sub">vence dia {c.dia}</div> : null}</td>
                  <td className="valor-cel" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.valor)}</td>
                  <td>
                    <select aria-label={`Mover ${c.titulo} para`} value={mover[c.chave] || ''} onChange={(e) => setMover((m) => ({ ...m, [c.chave]: e.target.value }))}>
                      <option value="">Não mover</option>
                      {opcoes.map((o) => <option key={o} value={o}>{mesLabel(o)}</option>)}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <table className="tabela-compacta">
          <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Sobra hoje</th><th style={{ textAlign: 'right' }}>Sobra simulada</th><th className="col-opc" style={{ textAlign: 'right' }}>Acumulada simulada</th></tr></thead>
          <tbody>
            {antes.map((a, i) => {
              const d = depois[i]
              const mudou = Math.abs(d.sobra - a.sobra) > 0.005
              const cor = (v) => (v < -0.005 ? 'var(--red)' : 'var(--green)')
              return (
                <tr key={a.mes} style={mudou ? { background: 'rgba(245,158,11,0.06)' } : undefined}>
                  <td>{mesLabel(a.mes)}{a.estimada && <span style={{ fontSize: 10, color: 'var(--text3)' }}> prev.</span>}</td>
                  <td className="mono" style={{ textAlign: 'right', color: cor(a.sobra) }}>{a.sobra < 0 ? '−' : '+'}{fmtK(Math.abs(a.sobra))}</td>
                  <td className="mono" style={{ textAlign: 'right', color: cor(d.sobra), fontWeight: mudou ? 600 : 400 }}>{d.sobra < 0 ? '−' : '+'}{fmtK(Math.abs(d.sobra))}</td>
                  <td className="mono col-opc" style={{ textAlign: 'right', color: cor(acumDepois[i]) }}>{acumDepois[i] < 0 ? '−' : '+'}{fmtK(Math.abs(acumDepois[i]))}{Math.abs(acumDepois[i] - acumAntes[i]) > 0.005 ? <span style={{ color: 'var(--text3)', fontSize: 10 }}> (era {fmtK(acumAntes[i])})</span> : null}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="cad-sub" style={{ padding: '8px 14px 12px' }}>
          Sobra = renda (cadastrada ou prevista) menos o que está comprometido no mês. Adiar empurra o peso de um mês para outro e, com multa e juros, custa a mais: a soma de todos os meses sobe pelo acréscimo.
        </div>
      </div>

      {simulados.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ marginBottom: 8 }}>
            Movendo <b>{simulados.length}</b> {simulados.length === 1 ? 'conta' : 'contas'} (<b>{fmt(movido)}</b>) de {mesLabel(mes)}.{custoExtra > 0 && <> Custo de multa e juros: <b style={{ color: 'var(--red)' }}>+{fmt(custoExtra)}</b>.</>}
            {ficouVermelho.length > 0 && <div style={{ color: 'var(--red)', marginTop: 4 }}>⚠ Passa a faltar dinheiro em {ficouVermelho.join(', ')}.</div>}
            {saiuVermelho.length > 0 && <div style={{ color: 'var(--green)', marginTop: 4 }}>✓ Deixa de faltar dinheiro em {saiuVermelho.join(', ')}.</div>}
            {ficouVermelho.length === 0 && saiuVermelho.length === 0 && <div className="cad-sub" style={{ marginTop: 4 }}>Nenhum mês muda de situação (no vermelho ou no verde).</div>}
          </div>
          <div className="modal-footer" style={{ justifyContent: 'flex-start', marginTop: 4, paddingTop: 10 }}>
            <button className="btn btn-primary" disabled={aplicando} onClick={aplicar}>Aplicar de verdade</button>
            <button className="btn btn-ghost" onClick={() => setMover({})}>Limpar simulação</button>
          </div>
        </div>
      )}
    </div>
  )
}
