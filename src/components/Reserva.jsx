import { useState } from 'react'
import Secao from './Secao'
import { useProjecaoSazonal } from './RendaSazonal'
import { mesesParaJuntar } from '../lib/rendaSazonal'
import { fmt, fmtK, nowYM, hojeSP } from '../lib/utils'
import { detalhePagamentos, rendaDoMes } from '../lib/financeiro'
import { saldoMeta, deltaParaSaldo } from '../lib/metas'
import { reaisParaCentavos } from '../lib/aulas'
import { LIQUIDEZ_CURTA, totalReserva, totalPorLiquidez, aplicarFonte } from '../lib/reserva'
import ModalFonteReserva from './ModalFonteReserva'

const METAS = [3, 6, 9, 12]
const BASES = {
  total: 'Contas fixas + parcelas do mês',
  fixos: 'Só contas fixas',
}

export default function Reserva({ store }) {
  const { fixos, fixosPagamentos, cartoes, compras, faturas, rendas, comprasPagamentos, comprasPagamentosOk, config, configOk, definirConfig, metas, metasMovimentos, metasOk, updateMeta, registrarMovimentoMeta, reservaFontes = [], reservaFontesOk = false, salvarFonteReserva, removerFonteReserva } = store
  const mes = nowYM()

  // Com a migration 16, a Reserva é uma meta (saldo = soma dos movimentos). Sem ela, segue na tabela config.
  const metaReserva = metasOk ? metas.find((m) => m.tipo === 'reserva') : null
  const guardadoLegado = metaReserva ? saldoMeta(metasMovimentos, metaReserva.id) : Number(config.reserva_valor) || 0
  const usaFontes = reservaFontesOk && reservaFontes.length > 0
  const guardado = usaFontes ? totalReserva(reservaFontes) : guardadoLegado
  const liquidez = totalPorLiquidez(reservaFontes)
  const planoAtivo = config.reserva_plano_ativo === true || config.reserva_plano_ativo === 'true' || config.reserva_plano_ativo === 1
  const metaMeses = Number((metaReserva ? metaReserva.meta_meses : config.reserva_meta_meses)) || 6
  const base = (metaReserva ? metaReserva.base_custo : config.reserva_base) === 'fixos' ? 'fixos' : 'total'
  const ultimoMov = metaReserva ? metasMovimentos.filter((m) => m.meta_id === metaReserva.id).map((m) => String(m.data).slice(0, 10)).sort().pop() : ''
  const atualizadaEm = metaReserva ? ultimoMov || '' : config.reserva_atualizada || ''

  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [modal, setModal] = useState(null) // { fonte? }
  const [sec, setSec] = useState({ fontes: true, prog: true, atual: true })
  const alt = (k) => () => setSec((m) => ({ ...m, [k]: !m[k] }))
  const sazonal = useProjecaoSazonal(store, 36) // antes do return antecipado (regra dos hooks)

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
  // Com meses fracos marcados na Renda, o ritmo real muda ao longo do ano: junta mês a mês, e o mês no vermelho conta como retirada.
  const mesesSazonal = sazonal.ativo && falta > 0 ? mesesParaJuntar(sazonal.meses, falta) : null

  let status = { badge: 'badge-gray', texto: 'Sem reserva informada' }
  if (guardado > 0) {
    if (meta > 0 && guardado >= meta) status = { badge: 'badge-green', texto: 'Meta atingida' }
    else if (mesesBase < 1) status = { badge: 'badge-red', texto: 'Menos de 1 mês coberto' }
    else if (mesesBase < 3) status = { badge: 'badge-amber', texto: 'Começando' }
    else status = { badge: 'badge-blue', texto: 'A caminho da meta' }
  }

  async function atualizarValor() {
    const c = reaisParaCentavos(valor)
    if (valor === '' || c == null) { window.alert('Não entendi esse valor. Exemplo: 2.540 ou 2.540,50'); return }
    const v = c / 100
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

  // O total das fontes é espelhado no saldo da meta da reserva (ou em config), para o resto do app (empréstimo, Início) enxergar o mesmo valor.
  async function espelhar(novoTotal) {
    if (metaReserva) {
      const delta = deltaParaSaldo(guardadoLegado, novoTotal)
      return delta === 0 || (await registrarMovimentoMeta({ meta_id: metaReserva.id, data: hojeSP(), tipo: 'ajuste', valor: delta, observacao: 'Soma de onde está o dinheiro da reserva' }))
    }
    return (await definirConfig('reserva_valor', novoTotal)) && (await definirConfig('reserva_atualizada', hojeSP()))
  }
  async function salvarFonte(fonte) {
    const ok = await salvarFonteReserva(fonte)
    if (ok) await espelhar(totalReserva(aplicarFonte(reservaFontes, fonte)))
    return ok
  }
  async function removerFonte(fonte) {
    const ok = await removerFonteReserva(fonte.id)
    if (ok) await espelhar(totalReserva(reservaFontes.filter((f) => f.id !== fonte.id)))
    return ok
  }
  const ligarPlano = (ligar) => definirConfig('reserva_plano_ativo', ligar)

  const dataFmt = (d) => (d ? d.split('-').reverse().join('/') : '')

  return (
    <div className="page">
      {modal && <ModalFonteReserva fonte={modal.fonte} onSalvar={salvarFonte} onRemover={removerFonte} onClose={() => setModal(null)} />}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Para emergência</div>
          <div className="metric-val blue">{guardado > 0 ? fmtK(guardado) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{usaFontes ? `${reservaFontes.length} ${reservaFontes.length === 1 ? 'lugar' : 'lugares'}` : atualizadaEm ? `atualizado em ${dataFmt(atualizadaEm)}` : 'ainda sem valor'}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Disponível na hora</div>
          <div className="metric-val green">{usaFontes ? fmtK(liquidez.na_hora) : '—'}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{usaFontes ? (liquidez.poucos_dias + liquidez.travado > 0 ? `+ ${fmtK(liquidez.poucos_dias + liquidez.travado)} com prazo para sacar` : 'tudo pode ser sacado já') : 'cadastre onde está o dinheiro'}</div>
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
      </div>

      {reservaFontesOk ? (
        <Secao titulo="Onde está o dinheiro" info={usaFontes ? `${fmt(guardado)} no total` : 'nada cadastrado'} aberto={sec.fontes} onToggle={alt('fontes')}>
          <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border)' }}>
            {usaFontes ? (
              <table className="tabela-compacta">
                <thead><tr><th>Lugar</th><th>Saque</th><th style={{ textAlign: 'right' }}>Valor</th><th /></tr></thead>
                <tbody>
                  {reservaFontes.map((f) => (
                    <tr key={f.id}>
                      <td>{f.nome}{f.observacao && <div className="cad-sub">{f.observacao}</div>}</td>
                      <td><span className={`badge ${f.liquidez === 'na_hora' ? 'badge-green' : f.liquidez === 'poucos_dias' ? 'badge-amber' : 'badge-gray'}`}>{LIQUIDEZ_CURTA[f.liquidez]}</span></td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(f.valor)}</td>
                      <td><button className="link-btn" onClick={() => setModal({ fonte: f })}>editar</button></td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 600 }}><td>Total</td><td /><td className="mono" style={{ textAlign: 'right' }}>{fmt(guardado)}</td><td /></tr>
                </tbody>
              </table>
            ) : (
              <div className="cad-sub" style={{ margin: '10px 0' }}>
                {guardadoLegado > 0
                  ? <>Hoje a reserva está como um valor só ({fmt(guardadoLegado)}). Cadastre cada lugar onde o dinheiro está para saber quanto dá para usar na hora. <button className="link-btn" onClick={() => setModal({ fonte: { nome: 'Reserva', valor: guardadoLegado, liquidez: 'na_hora' } })}>Usar esse valor como primeiro lugar</button></>
                  : 'Cadastre cada lugar onde está o dinheiro de emergência (poupança, CDB, conta, dinheiro guardado, FGTS…) e se dá para sacar na hora.'}
              </div>
            )}
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => setModal({})}>+ Adicionar lugar</button>
          </div>
        </Secao>
      ) : (
        <>
          <div className="alert alert-blue"><strong>Quer separar o dinheiro por lugar (poupança, CDB, FGTS…)?</strong> Rode o arquivo <code>inbox/31_reserva_fontes.sql</code> no SQL Editor do Supabase e recarregue a página. Por enquanto, informe o total abaixo.</div>
          <Secao titulo="Atualizar" info="valor guardado" aberto={sec.atual} onToggle={alt('atual')}>
            <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border)' }}>
              <div className="form-group" style={{ maxWidth: 360 }}>
                <label>Quanto você tem guardado hoje (R$)</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input inputMode="decimal" placeholder={guardadoLegado > 0 ? String(guardadoLegado).replace('.', ',') : '0,00'} value={valor} onChange={(e) => setValor(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') atualizarValor() }} />
                  <button className="btn btn-primary" onClick={atualizarValor} disabled={valor === '' || salvando}>{salvando ? '...' : 'Salvar'}</button>
                </div>
                <div className="cad-sub" style={{ marginTop: 6 }}>Pode digitar 2.540 ou 2.540,50.</div>
              </div>
            </div>
          </Secao>
        </>
      )}

      {!planoAtivo ? (
        <Secao titulo="Plano para cobrir X meses" info="opcional · desligado" aberto={sec.prog} onToggle={alt('prog')}>
          <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border)' }}>
            <div className="cad-sub" style={{ margin: '10px 0' }}>
              Com o que você tem hoje, a reserva cobre <b>{guardado > 0 && custoFixos > 0 ? mesesFixos.toFixed(1).replace('.', ',') : '0'} meses</b> das contas fixas e <b>{guardado > 0 && custoTotal > 0 ? mesesTotal.toFixed(1).replace('.', ',') : '0'}</b> do compromisso total.
              Quando quiser, crie um plano: você escolhe quantos meses quer cobrir e o app mostra quanto falta e em quanto tempo chega lá.
            </div>
            <button className="btn btn-ghost" onClick={() => ligarPlano(true)}>Criar plano de cobertura</button>
          </div>
        </Secao>
      ) : (
        <>
          <Secao titulo={`Plano: cobrir ${metaMeses} meses`} info={status.texto} destaque={`${pct}%`} aberto={sec.prog} onToggle={alt('prog')}>
            <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border)' }}>
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
                    {sazonal.ativo && mesesSazonal != null
                      ? <> Guardando toda a sobra e <strong>considerando os meses fracos da renda</strong>, você chega lá em cerca de <strong>{mesesSazonal} {mesesSazonal === 1 ? 'mês' : 'meses'}</strong>. Mês no vermelho conta como retirada.</>
                      : sazonal.ativo
                        ? <> Considerando os meses fracos da renda, só guardando a sobra não dá para chegar lá nos próximos 3 anos — vale rever gastos ou aumentar a renda.</>
                        : sobraMensal > 0
                          ? <> Com a sobra de <strong>{fmtK(sobraMensal)}</strong> por mês (renda − compromisso), você chega lá em cerca de <strong>{mesesParaMeta} {mesesParaMeta === 1 ? 'mês' : 'meses'}</strong> se guardar toda a sobra.</>
                          : ' Neste momento não há sobra mensal para guardar — revise o orçamento para abrir espaço.'}
                  </>
                )}
              </div>
            </div>
          </Secao>

          <Secao titulo="Ajustar o plano" info="meta e custo considerado" aberto={sec.atual} onToggle={alt('atual')}>
            <div style={{ padding: '4px 18px 18px', borderTop: '1px solid var(--border)' }}>
              <div className="form-row cols2" style={{ marginBottom: 0 }}>
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
                Uma reserva de emergência costuma ser de 3 a 6 meses do seu custo de vida; quanto menos estável a renda, mais meses vale ter. O custo mensal é o de {mes.split('-').reverse().join('/')} (contas fixas ativas e parcelas do mês).
              </div>
              <button className="link-btn" style={{ marginTop: 10 }} onClick={() => ligarPlano(false)}>Desligar o plano (fica só o valor guardado)</button>
            </div>
          </Secao>
        </>
      )}
    </div>
  )
}
