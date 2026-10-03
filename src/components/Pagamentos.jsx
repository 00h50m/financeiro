import { useState, useEffect } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths, totalRenda, tituloCompra, subtituloCompra, detalhePagamentos, sobraAnterior } from '../lib/utils'

export default function Pagamentos({ store }) {
  const {
    fixos, fixosPagamentos, cartoes, compras, faturas, rendas, saldoAjustes,
    marcarFixoPago, upsertFatura, updateCompra, definirAjusteSaldo,
  } = store
  const [mes, setMes] = useState(nowYM())
  const [usarSobra, setUsarSobra] = useState(() => {
    try { return localStorage.getItem('usar_sobra') !== '0' } catch { return true }
  })
  function alternarSobra(v) {
    setUsarSobra(v)
    try { localStorage.setItem('usar_sobra', v ? '1' : '0') } catch { /* segue sem lembrar */ }
  }

  const ajusteAtual = saldoAjustes.find((a) => a.mes === mes)?.ajuste || 0
  const [ajusteInput, setAjusteInput] = useState(String(ajusteAtual))
  useEffect(() => {
    setAjusteInput(String(saldoAjustes.find((a) => a.mes === mes)?.ajuste || 0))
  }, [mes, saldoAjustes])

  const dados = { fixos, fixosPagamentos, cartoes, compras, faturas, rendas, saldoAjustes }
  const {
    fixosLista: fixosAtivos, fixoPagamento, linhasCartao, outrasContas,
    comprometido, pago, totalDividas,
  } = detalhePagamentos(dados, mes)

  async function toggleOutraConta(c) {
    await updateCompra(c.id, {
      pago: !c.pago,
      data_pagamento: !c.pago ? new Date().toISOString().slice(0, 10) : null,
    })
  }

  const rendaMes = totalRenda(rendas.find((r) => r.mes === mes))
  const sobra = usarSobra ? sobraAnterior(dados, mes) : 0
  const baseCalculada = rendaMes + sobra - pago
  const dinheiroDisponivel = baseCalculada + ajusteAtual
  const saldo = dinheiroDisponivel - totalDividas

  async function toggleFixo(fixo) {
    const atual = fixoPagamento(fixo.id)?.pago || false
    await marcarFixoPago(fixo.id, mes, !atual)
  }

  async function toggleCartao(linha) {
    await upsertFatura({
      cartao_id: linha.cartao_id,
      mes,
      valor_real: linha.valor,
      pago: !linha.pago,
      data_pagamento: !linha.pago ? new Date().toISOString().slice(0, 10) : null,
    })
  }

  function dataFmt(d) {
    if (!d) return ''
    const [y, m, dd] = d.slice(0, 10).split('-')
    return `${dd}/${m}/${y.slice(2)}`
  }

  return (
    <div className="page">
      <div className="toolbar">
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))}>← Mês anterior</button>
        <span style={{ fontWeight: 500, fontSize: 14 }}>{mesLabel(mes)}</span>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))}>Próximo mês →</button>
        {mes !== nowYM() && (
          <button className="btn btn-ghost btn-sm" onClick={() => setMes(nowYM())} style={{ marginLeft: 'auto' }}>
            Voltar para hoje
          </button>
        )}
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Comprometido no mês</div>
          <div className="metric-val amber">{fmtK(comprometido)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Já pago</div>
          <div className="metric-val green">{fmtK(pago)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Total dívidas (a pagar)</div>
          <div className={`metric-val ${totalDividas <= 0.005 ? 'green' : 'red'}`}>{fmtK(totalDividas)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Dinheiro disponível</div>
          <div className={`metric-val ${dinheiroDisponivel >= 0 ? 'blue' : 'red'}`}>{fmtK(dinheiroDisponivel)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Saldo</div>
          <div className={`metric-val ${saldo >= 0 ? 'green' : 'red'}`}>{fmtK(saldo)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            Dinheiro disponível = renda do mês ({fmt(rendaMes)})
            {usarSobra && ` ${sobra < 0 ? '−' : '+'} sobra do mês anterior (${fmt(Math.abs(sobra))})`} − já pago ({fmt(pago)})
            {ajusteAtual !== 0 && ` ${ajusteAtual > 0 ? '+' : '−'} ajuste (${fmt(Math.abs(ajusteAtual))})`}.
            {' '}{usarSobra && sobra === 0 && 'Sem sobra do mês anterior: ele não tem renda cadastrada (ou fechou no zero). '}
            O ajuste serve para dinheiro fora da renda cadastrada (ex.: reserva que você já tinha).
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={usarSobra} onChange={(e) => alternarSobra(e.target.checked)} />
              Somar a sobra do mês anterior (o que sobraria depois de pagar tudo dele)
            </label>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <label style={{ fontSize: 12, color: 'var(--text2)' }}>Ajuste manual (R$)</label>
            <input
              type="number" step="0.01"
              value={ajusteInput}
              onChange={(e) => setAjusteInput(e.target.value)}
              style={{ width: 110 }}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => definirAjusteSaldo(mes, Number(ajusteInput) || 0)}
              disabled={Number(ajusteInput) === ajusteAtual}
            >
              Salvar ajuste
            </button>
          </div>
        </div>
      </div>

      <div className="section-label">contas fixas</div>
      {fixosAtivos.length === 0 ? (
        <div className="empty">Nenhuma conta fixa ativa em {mesLabel(mes)}.{'\n'}Cadastre em "Fixos" para acompanhar aqui.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Pago</th>
                <th>Nome</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'center' }}>Vence</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {fixosAtivos.map((f) => {
                const pg = fixoPagamento(f.id)
                return (
                  <tr key={f.id} style={{ opacity: pg?.pago ? 0.6 : 1 }}>
                    <td style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!pg?.pago} onChange={() => toggleFixo(f)} />
                    </td>
                    <td style={{ fontWeight: 500, textDecoration: pg?.pago ? 'line-through' : 'none' }}>{f.nome}</td>
                    <td style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {f.categoria ? (
                        <>
                          {f.categoria}<br />
                          <span style={{ color: 'var(--text3)' }}>{f.subcategoria}</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text3)' }}>
                      {f.dia_vencimento ? `dia ${f.dia_vencimento}` : '—'}
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(f.valor)}</td>
                    <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Mono' }}>{dataFmt(pg?.data_pagamento) || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="section-label">faturas dos cartões</div>
      {linhasCartao.length === 0 ? (
        <div className="empty">Nenhum cartão com movimento em {mesLabel(mes)}.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Pago</th>
                <th>Cartão</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th>Origem</th>
                <th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {linhasCartao.map((l) => (
                <tr key={l.cartao_id} style={{ opacity: l.pago ? 0.6 : 1 }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={l.pago} onChange={() => toggleCartao(l)} />
                  </td>
                  <td style={{ fontWeight: 500, textDecoration: l.pago ? 'line-through' : 'none' }}>{l.nome}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(l.valor)}</td>
                  <td>
                    {l.temFatura ? (
                      <span className="badge badge-green">valor real da fatura</span>
                    ) : (
                      <span className="badge badge-gray">estimado (lançado)</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Mono' }}>{dataFmt(l.dataPagamento) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhasCartao.some((l) => !l.temFatura) && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
              Valores marcados como "estimado" ainda não têm fatura cadastrada — o valor usado é a soma das parcelas
              lançadas no app. Cadastre o valor real na aba Faturas para maior precisão.
            </div>
          )}
        </div>
      )}

      <div className="section-label">outras contas (sem cartão)</div>
      {outrasContas.length === 0 ? (
        <div className="empty">Nenhuma conta sem cartão em {mesLabel(mes)}.{'\n'}Compras lançadas como "Sem cartão" aparecem aqui.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Pago</th>
                <th>Descrição</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th style={{ textAlign: 'center' }}>Parcela</th>
                <th>Pago em</th>
              </tr>
            </thead>
            <tbody>
              {outrasContas.map((c) => (
                <tr key={c.id} style={{ opacity: c.pago ? 0.6 : 1 }}>
                  <td style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!c.pago} onChange={() => toggleOutraConta(c)} />
                  </td>
                  <td style={{ fontWeight: 500, textDecoration: c.pago ? 'line-through' : 'none' }}>
                    {tituloCompra(c)}
                    {subtituloCompra(c) && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>no cartão: {subtituloCompra(c)}</div>}
                    {c.obs &&<div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.obs}</div>}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.valorParcela)}</td>
                  <td style={{ textAlign: 'center' }}>
                    {c.parcelaTotal > 1 ? (
                      <span className="badge badge-amber">{c.parcelaNum}/{c.parcelaTotal}</span>
                    ) : (
                      <span className="badge badge-gray">à vista</span>
                    )}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text3)', fontFamily: 'DM Mono' }}>{dataFmt(c.data_pagamento) || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {outrasContas.some((c) => c.parcelaTotal > 1) && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
              Compras parceladas sem cartão marcam a compra inteira como paga (não parcela a parcela) — use para casos
              simples; para acompanhar mês a mês, prefira lançar pelo cartão.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
