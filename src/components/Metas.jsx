import { useState } from 'react'
import Secao from './Secao'
import Selo from './ui/Selo'
import Indicador from './ui/Indicador'
import EstadoVazio from './ui/EstadoVazio'
import { useProjecaoSazonal } from './RendaSazonal'
import { mesesParaJuntar } from '../lib/rendaSazonal'
import { fmt, fmtK, hojeSP, mesLabel } from '../lib/utils'
import { detalhePagamentos } from '../lib/financeiro'
import { situacaoDaMeta, saldoMeta, movimentosDaMeta, valorComSinal, deltaParaSaldo, mesesParaAlvo } from '../lib/metas'
import { confirmar } from '../lib/dialogos'
import CampoDinheiro from './ui/CampoDinheiro'

const ROTULO = { aporte: 'Aporte', retirada: 'Retirada', ajuste: 'Ajuste' }
const dataFmt = (d) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '')

function Movimento({ meta, store, onFechar }) {
  const { metasMovimentos, registrarMovimentoMeta } = store
  const [tipo, setTipo] = useState('aporte')
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const saldoAtual = saldoMeta(metasMovimentos, meta.id)

  async function salvar() {
    const v = Number(String(valor).replace(',', '.'))
    if (valor === '' || Number.isNaN(v) || (tipo !== 'ajuste' && v <= 0) || v < 0) return
    if (tipo === 'retirada' && v > saldoAtual && !await confirmar(`A retirada (${fmt(v)}) é maior que o saldo (${fmt(saldoAtual)}). Registrar mesmo assim?`)) return
    // Ajuste: a pessoa informa o saldo certo; o app grava só a diferença.
    const gravado = tipo === 'ajuste' ? deltaParaSaldo(saldoAtual, v) : valorComSinal(tipo, v)
    if (gravado === 0) { onFechar(); return }
    setSalvando(true)
    const ok = await registrarMovimentoMeta({ meta_id: meta.id, data: hojeSP(), tipo, valor: gravado, observacao: obs.trim() || null })
    setSalvando(false)
    if (ok) onFechar()
  }

  return (
    <div className="card" style={{ padding: 14, marginTop: 10, background: 'var(--surface2, transparent)' }}>
      <div className="form-row cols3" style={{ marginBottom: 8 }}>
        <div className="form-group">
          <label>O que aconteceu</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option value="aporte">Guardei dinheiro (aporte)</option>
            <option value="retirada">Usei dinheiro (retirada)</option>
            <option value="ajuste">Corrigir o saldo (ajuste)</option>
          </select>
        </div>
        <div className="form-group">
          <label>{tipo === 'ajuste' ? 'Saldo correto (R$)' : 'Valor (R$)'}</label>
          <CampoDinheiro value={valor} onChange={setValor} placeholder={tipo === 'ajuste' ? String(saldoAtual).replace('.', ',') : '0,00'} />
        </div>
        <div className="form-group">
          <label>Observação (opcional)</label>
          <input value={obs} onChange={(e) => setObs(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-sm" onClick={salvar} disabled={valor === '' || salvando}>{salvando ? '...' : 'Registrar'}</button>
        <button className="btn btn-ghost btn-sm" onClick={onFechar}>Cancelar</button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>O app só anota. Ele não move dinheiro de verdade.</div>
    </div>
  )
}

function CartaoMeta({ meta, store, custos, sobraMensal, sazonal }) {
  const { metasMovimentos, updateMeta, delMovimentoMeta } = store
  const [abrir, setAbrir] = useState(false)
  const [historico, setHistorico] = useState(false)
  const hoje = hojeSP()
  const s = situacaoDaMeta(meta, metasMovimentos, custos, hoje)
  const movs = movimentosDaMeta(metasMovimentos, meta.id)
  const meses = sazonal?.ativo ? mesesParaJuntar(sazonal.meses, s.falta) : mesesParaAlvo(s.falta, sobraMensal)

  return (
    <div className="card" style={{ padding: 16, marginBottom: 0, opacity: meta.ativa === false ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <strong>{meta.nome}</strong>{' '}
          <Selo tom="neutro">{meta.tipo === 'reserva' ? 'Reserva' : 'Objetivo'}</Selo>{' '}
          {s.atingida && <Selo tom="ok">Atingida</Selo>}{' '}
          {meta.ativa === false && <Selo tom="neutro">Arquivada</Selo>}
        </div>
        <span className="mono" style={{ fontSize: 13, color: 'var(--text2)' }}>{fmt(s.saldo)} de {s.alvo > 0 ? fmt(s.alvo) : '—'}{s.alvo > 0 ? ` · ${s.pct}%` : ''}</span>
      </div>
      <div className="prog-bar" style={{ height: 8, margin: '10px 0' }}>
        <div className="prog-fill" style={{ width: s.pct + '%', background: s.atingida ? 'var(--green)' : 'var(--brand)' }} />
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
        {s.alvo <= 0 && 'Sem alvo definido ainda.'}
        {s.alvo > 0 && !s.atingida && <>Faltam <strong>{fmt(s.falta)}</strong>.</>}
        {meta.prazo && !s.atingida && !s.prazoVencido && s.porMesNecessario != null && <> Para chegar até {dataFmt(meta.prazo)}, guarde cerca de <strong>{fmt(s.porMesNecessario)}</strong> por mês.</>}
        {s.prazoVencido && <> O prazo ({dataFmt(meta.prazo)}) já passou.</>}
        {!meta.prazo && s.falta > 0 && meses != null && <> {sazonal?.ativo ? <>Guardando toda a sobra, considerando os meses fracos da renda, chega em cerca de {meses} {meses === 1 ? 'mês' : 'meses'}.</> : <>Guardando toda a sobra mensal ({fmtK(sobraMensal)}), chega em cerca de {meses} {meses === 1 ? 'mês' : 'meses'}.</>}</>}
        {s.atingida && ' Meta batida. 🎉'}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn btn-primary btn-sm" onClick={() => setAbrir(!abrir)}>Aporte, retirada ou ajuste</button>
        <button className="btn btn-ghost btn-sm" onClick={() => setHistorico(!historico)}>{historico ? 'Esconder histórico' : `Histórico (${movs.length})`}</button>
        {meta.tipo !== 'reserva' && (
          <button className="btn btn-ghost btn-sm" onClick={() => updateMeta(meta.id, { ativa: meta.ativa === false })}>{meta.ativa === false ? 'Reativar' : 'Arquivar'}</button>
        )}
      </div>
      {abrir && <Movimento meta={meta} store={store} onFechar={() => setAbrir(false)} />}
      {historico && (
        <div style={{ marginTop: 12 }}>
          {movs.length === 0 ? <EstadoVazio titulo="Nenhum movimento ainda" texto="Registre um aporte para começar a acompanhar." /> : (
            <ul className="meta-movs">
              {movs.map((m) => (
                <li key={m.id}>
                  <span className="meta-mov-data">{dataFmt(m.data)}</span>
                  <span className="meta-mov-tipo">{ROTULO[m.tipo] || m.tipo}{m.observacao ? <small>{m.observacao}</small> : null}</span>
                  <span className={`mono meta-mov-valor ${Number(m.valor) < 0 ? 'neg' : 'pos'}`}>{Number(m.valor) > 0 ? '+' : ''}{fmt(m.valor)}</span>
                  <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirmar('Apagar este movimento? O saldo da meta muda e isso fica na auditoria.')) delMovimentoMeta(m) }} aria-label={`Apagar movimento de ${dataFmt(m.data)}`}>×</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

export default function Metas({ store }) {
  const { metas, metasOk, addMeta, compras, cartoes, fixos, fixosPagamentos, faturas, rendas, comprasPagamentos, comprasPagamentosOk } = store
  const [nome, setNome] = useState('')
  const [alvo, setAlvo] = useState('')
  const [prazo, setPrazo] = useState('')
  const [prio, setPrio] = useState(2)
  const [criando, setCriando] = useState(false)
  const [novaAberta, setNovaAberta] = useState(false)
  const sazonal = useProjecaoSazonal(store, 36)

  if (!metasOk) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          <strong>Falta criar as tabelas das metas no banco.</strong> Rode o arquivo <code>inbox/16_metas.sql</code> no SQL Editor do
          Supabase e recarregue esta página. Sua Reserva atual será trazida para cá automaticamente.
        </div>
      </div>
    )
  }

  const mes = hojeSP().slice(0, 7)
  const det = detalhePagamentos({ fixos, fixosPagamentos, cartoes, compras, faturas, comprasPagamentos, comprasPagamentosOk }, mes)
  const custos = { custoFixos: det.totalFixos, custoTotal: det.comprometido }
  const ultimaRenda = [...rendas].filter((r) => r.mes <= mes).sort((a, b) => b.mes.localeCompare(a.mes))[0]
  const rendaRef = ultimaRenda ? ['giovanna', 'sabrina', 'extra_sabrina', 'mesada', 'outros'].reduce((t, k) => t + (Number(ultimaRenda[k]) || 0), 0) : 0
  const sobraMensal = Math.max(0, rendaRef - det.comprometido)

  async function criar() {
    const v = Number(String(alvo).replace(',', '.'))
    if (!nome.trim() || !(v > 0)) return
    setCriando(true)
    const ok = await addMeta({ nome: nome.trim(), tipo: 'objetivo', valor_alvo: v, prazo: prazo || null, prioridade: Number(prio) || 2 })
    setCriando(false)
    if (ok) { setNome(''); setAlvo(''); setPrazo('') }
  }

  const ativas = metas.filter((m) => m.ativa !== false)
  const totalGuardado = ativas.reduce((t, m) => t + saldoMeta(store.metasMovimentos, m.id), 0)
  const totalAlvo = ativas.reduce((t, m) => t + (situacaoDaMeta(m, store.metasMovimentos, custos, hojeSP()).alvo || 0), 0)
  const ordenadas = [...metas].sort((a, b) => (a.ativa === false) - (b.ativa === false) || (a.prioridade || 99) - (b.prioridade || 99))

  return (
    <div className="page">
      <div className="cad-topo">
        <div className="cad-resumo"><span>Custos de {mesLabel(mes)}</span></div>
        <button className="btn btn-primary tb-primario" onClick={() => setNovaAberta(true)}>+ Nova meta</button>
      </div>
      {ativas.length > 0 && (
        <div className="indicadores">
          <Indicador rotulo={ativas.length === 1 ? 'Meta ativa' : 'Metas ativas'} valor={ativas.length} />
          <Indicador rotulo="Guardado" valor={fmtK(totalGuardado)} tom="ok" ajuda="Soma do saldo de todas as metas ativas" />
          <Indicador rotulo="Alvo total" valor={totalAlvo > 0 ? fmtK(totalAlvo) : '—'} />
          <Indicador rotulo="Falta juntar" valor={totalAlvo > 0 ? fmtK(Math.max(0, totalAlvo - totalGuardado)) : '—'} tom="aviso" />
        </div>
      )}
      {ordenadas.length === 0 && <EstadoVazio titulo="Nenhuma meta ainda" texto="Crie uma meta (viagem, notebook, reserva) para acompanhar quanto já guardou." acao="+ Nova meta" aoClicar={() => setNovaAberta(true)} />}
      <div className="metas-grade">
        {ordenadas.map((m) => <CartaoMeta key={m.id} meta={m} store={store} custos={custos} sobraMensal={sobraMensal} sazonal={sazonal} />)}
      </div>

      <Secao titulo="Nova meta" aberto={novaAberta} onToggle={() => setNovaAberta((v) => !v)}>
      <div style={{ padding: '4px 16px 16px', borderTop: '1px solid var(--border)' }}>
        <div className="form-row cols3" style={{ marginBottom: 8 }}>
          <div className="form-group"><label>Nome</label><input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Viagem, Notebook" /></div>
          <div className="form-group"><label>Quanto quer juntar (R$)</label><CampoDinheiro value={alvo} onChange={setAlvo} /></div>
          <div className="form-group"><label>Prazo (opcional)</label><input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
        </div>
        <div className="form-row cols3" style={{ marginBottom: 8 }}>
          <div className="form-group">
            <label>Prioridade</label>
            <select value={prio} onChange={(e) => setPrio(e.target.value)}>
              <option value={1}>1 · mais importante</option>
              <option value={2}>2 · normal</option>
              <option value={3}>3 · quando sobrar</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={criar} disabled={criando || !nome.trim() || !alvo}>{criando ? '...' : 'Criar meta'}</button>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10, lineHeight: 1.6 }}>
          A prioridade decide a ordem da sugestão de destino da sobra no Fechamento. A reserva é sempre prioridade 1.
        </div>
      </div>
      </Secao>
    </div>
  )
}
