import { useState } from 'react'
import { fmt, fmtK, nowYM, hojeSP } from '../lib/utils'
import { detalhePagamentos, rendaDoMes } from '../lib/financeiro'
import { saldoMeta, deltaParaSaldo } from '../lib/metas'

const METAS = [3, 6, 9, 12]
const BASES = {
  total: 'Contas fixas + parcelas do mês',
  fixos: 'Só contas fixas',
}

export default function Reserva({ store }) {
  const { fixos, fixosPagamentos, cartoes, compras, faturas, rendas, comprasPagamentos, comprasPagamentosOk, config, configOk, definirConfig, metas, metasMovimentos, metasOk, updateMeta, registrarMovimentoMeta } = store
  const mes = nowYM()

  // Com a migration 16, a Reserva é uma meta (saldo = soma dos movimentos). Sem ela, segue na tabela config.
  const metaReserva = metasOk ? metas.find((m) => m.tipo === 'reserva') : null
  const guardado = metaReserva ? saldoMeta(metasMovimentos, metaReserva.id) : Number(config.reserva_valor) || 0
  const metaMeses = Number((metaReserva ? metaReserva.meta_meses : config.reserva_meta_meses)) || 6
  const base = (metaReserva ? metaReserva.base_custo : config.reserva_base) === 'fixos' ? 'fixos' : 'total'
  const ultimoMov = metaReserva ? metasMovimentos.filter((m) => m.meta_id === metaReserva.id).map((m) => String(m.data).slice(0, 10)).sort().pop() : ''
  const atualizadaEm = metaReserva ? ultimoMov || '' : config.reserva_atualizada || ''

  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)

  if (!configOk && !metaReserva) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          <strong>Falta criar a tabela de configurações no banco.</strong> Rode o SQL do arquivo <code>config.sql</code> do projeto
          no SQL Editor do Supabase e recarregue esta página.
        </div>
      </div>
    )
  }

  const det = detalhePagamentos({ fixos, fixosPagamentos, cartoes, compras, faturas, comprasPagamentos, comprasPagamentosOk }, mes)
  const custoFixos = det.totalFixos
  const custoTotal = det.comprometido
  const custoBase = base === 'fixos' ? custoFixos : custoTotal

  const mesesFixos = custoFixos > 0 ? guardado / custoFixos : 0
  const mesesTotal = custoTotal > 0 ? guardado / custoTotal : 0
  const mesesBase = base === 'fixos' ? mesesFixos : mesesTotal

  const meta = metaMeses * custoBase
  const falta = Math.max(0, meta - guardado)
  const pct = meta > 0 ? Math.min(100, Math.round((guardado / meta) * 100)) : 0

  // Ritmo: o que sobra por mês (renda do mês, ou a última cadastrada, menos o comprometido).
  const rendaRef = rendaDoMes(rendas, mes, { estimar: true }).valor
  const sobraMensal = rendaRef - custoTotal
  const mesesParaMeta = falta > 0 && sobraMensal > 0 ? Math.ceil(falta / sobraMensal) : 0

  let status = { badge: 'badge-gray', texto: 'Sem reserva informada' }
  if (guardado > 0) {
    if (meta > 0 && guardado >= meta) status = { badge: 'badge-green', texto: 'Meta atingida' }
    else if (mesesBase < 1) status = { badge: 'badge-red', texto: 'Menos de 1 mês coberto' }
    else if (mesesBase < 3) status = { badge: 'badge-amber', texto: 'Começando' }
    else status = { badge: 'badge-blue', texto: 'A caminho da meta' }
  }

  async function atualizarValor() {
    const v = Number(valor)
    if (valor === '' || Number.isNaN(v) || v < 0) return
    setSalvando(true)
    if (metaReserva) {
      const delta = deltaParaSaldo(guardado, v)
      const ok = delta === 0 || (await registrarMovimentoMeta({ meta_id: metaReserva.id, data: hojeSP(), tipo: 'ajuste', valor: delta, observacao: 'Ajuste pela tela Reserva' }))
      if (ok) setValor('')
      setSalvando(false)
      return
    }
    // A data só é gravada se o valor foi: senão a tela diria "atualizada hoje" com o valor antigo.
    const ok = (await definirConfig('reserva_valor', v)) && (await definirConfig('reserva_atualizada', hojeSP()))
    if (ok) setValor('')
    setSalvando(false)
  }

  const dataFmt = (d) => (d ? d.split('-').reverse().join('/') : '')

  return (
    <div className="page">
      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Guardado na reserva</div>
          <div className="metric-val blue">{guardado > 0 ? fmtK(guardado) : '—'}</div>
          {atualizadaEm && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>atualizado em {dataFmt(atualizadaEm)}</div>}
        </div>
        <div className="metric">
          <div className="metric-label">Cobre das contas fixas</div>
          <div className="metric-val green">{guardado > 0 && custoFixos > 0 ? mesesFixos.toFixed(1).replace('.', ',') + ' meses' : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>fixos: {fmtK(custoFixos)}/mês</div>
        </div>
        <div className="metric">
          <div className="metric-label">Cobre do compromisso total</div>
          <div className="metric-val green">{guardado > 0 && custoTotal > 0 ? mesesTotal.toFixed(1).replace('.', ',') + ' meses' : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>total: {fmtK(custoTotal)}/mês</div>
        </div>
        <div className="metric">
          <div className="metric-label">Meta ({metaMeses} meses)</div>
          <div className="metric-val amber">{meta > 0 ? fmtK(meta) : '—'}</div>
        </div>
      </div>

      <div className="section-label">progresso até a meta</div>
      <div className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <span className={`badge ${status.badge}`}>{status.texto}</span>
          <span className="mono" style={{ fontSize: 13, color: 'var(--text2)' }}>{fmt(guardado)} de {fmt(meta)} · {pct}%</span>
        </div>
        <div className="prog-bar" style={{ height: 10 }}>
          <div className="prog-fill" style={{ width: pct + '%', background: pct >= 100 ? 'var(--green)' : 'var(--brand)' }} />
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7, marginTop: 14 }}>
          {meta <= 0 && 'Cadastre contas fixas e compras para o app calcular quanto custa um mês da sua vida.'}
          {meta > 0 && guardado >= meta && `Parabéns! Sua reserva já cobre ${metaMeses} meses (${BASES[base].toLowerCase()}). 🎉`}
          {meta > 0 && guardado < meta && (
            <>
              Faltam <strong>{fmt(falta)}</strong> para cobrir {metaMeses} meses ({BASES[base].toLowerCase()}).
              {sobraMensal > 0
                ? <> Com a sobra de <strong>{fmtK(sobraMensal)}</strong> por mês (renda − compromisso), você chega lá em cerca de <strong>{mesesParaMeta} {mesesParaMeta === 1 ? 'mês' : 'meses'}</strong> se guardar toda a sobra.</>
                : ' Neste momento não há sobra mensal para guardar — revise o orçamento para abrir espaço.'}
            </>
          )}
        </div>
      </div>

      <div className="section-label">atualizar</div>
      <div className="card" style={{ padding: 18 }}>
        <div className="form-row cols3" style={{ marginBottom: 0 }}>
          <div className="form-group">
            <label>Quanto você tem guardado hoje (R$)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="number" min="0" step="0.01" placeholder={guardado > 0 ? String(guardado) : '0,00'}
                value={valor} onChange={(e) => setValor(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') atualizarValor() }}
              />
              <button className="btn btn-primary" onClick={atualizarValor} disabled={valor === '' || salvando}>
                {salvando ? '...' : 'Salvar'}
              </button>
            </div>
          </div>
          <div className="form-group">
            <label>Meta de cobertura</label>
            <select value={metaMeses} onChange={(e) => (metaReserva ? updateMeta(metaReserva.id, { meta_meses: Number(e.target.value) }) : definirConfig('reserva_meta_meses', Number(e.target.value)))}>
              {METAS.map((m) => <option key={m} value={m}>{m} meses</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Custo mensal considerado na meta</label>
            <select value={base} onChange={(e) => (metaReserva ? updateMeta(metaReserva.id, { base_custo: e.target.value }) : definirConfig('reserva_base', e.target.value))}>
              {Object.entries(BASES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginTop: 12 }}>
          Atualize o valor sempre que guardar ou usar a reserva. Uma reserva de emergência costuma ser de 3 a 6 meses do seu custo
          de vida; quanto menos estável a renda, mais meses vale ter. O custo mensal é o de {mes.split('-').reverse().join('/')} (contas fixas ativas e parcelas do mês).
        </div>
      </div>
    </div>
  )
}
