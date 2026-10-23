import { useMemo, useState } from 'react'
import NavMes, { Pilulas } from './NavMes'
import ModalAtendimento from './atendimentos/ModalAtendimento'
import ModalCliente from './atendimentos/ModalCliente'
import ModalServico from './atendimentos/ModalServico'
import { fmt, fmtK, nowYM, hojeSP } from '../lib/utils'
import { textoDuracao } from '../lib/aulas'
import { STATUS, FORMAS, atendimentosDoMes, porData, resumoMes, resumoClientes, patchRealizar, patchReceber, patchDesfazer, patchEncerrar, lucro } from '../lib/atendimentos'

const COR_STATUS = { agendado: 'badge-blue', realizado: 'badge-green', cancelado: 'badge-gray', faltou: 'badge-red' }
const dataBr = (d) => d.split('-').reverse().join('/')
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const rotuloDia = (d, hoje) => `${d === hoje ? 'Hoje · ' : ''}${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${dataBr(d).slice(0, 5)}`
const zap = (t) => `https://wa.me/55${String(t || '').replace(/\D/g, '').replace(/^55/, '')}`

// "Recebeu agora?" ao marcar como realizado (ou ao marcar recebido depois).
function ModalRecebimento({ titulo, onConfirmar, onClose, permitirDepois = true }) {
  const [forma, setForma] = useState('Pix')
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-title">{titulo}</div>
        <div className="form-group"><label>Forma de pagamento</label><select value={forma} onChange={(e) => setForma(e.target.value)}>{FORMAS.map((f) => <option key={f}>{f}</option>)}</select></div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          {permitirDepois && <button className="btn btn-ghost" onClick={() => onConfirmar({ pago: false })}>Ainda não pagou</button>}
          <button className="btn btn-primary" onClick={() => onConfirmar({ pago: true, forma })}>Já recebi</button>
        </div>
      </div>
    </div>
  )
}

// Atendimentos (perfil esteticista): agenda do mês, clientes e serviços. O que se atende entra na renda do mês.
export default function Atendimentos({ store }) {
  const { clientes, servicos, atendimentos, atendimentosOk, salvarCliente, salvarServico, salvarAtendimento, removerCliente, removerServico, removerAtendimento } = store
  const hoje = hojeSP()
  const [mes, setMes] = useState(nowYM())
  const [visao, setVisao] = useState('agenda')
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null) // { tipo: 'atendimento'|'cliente'|'servico'|'recebimento', ... }

  const doMes = useMemo(() => atendimentosDoMes(atendimentos, mes, filtro || null).sort(porData), [atendimentos, mes, filtro])
  const r = useMemo(() => resumoMes(atendimentosDoMes(atendimentos, mes)), [atendimentos, mes])
  const porDia = useMemo(() => { const m = new Map(); for (const a of doMes) m.set(a.data, [...(m.get(a.data) || []), a]); return [...m.entries()] }, [doMes])
  const clienteDe = (id) => clientes.find((c) => c.id === id)
  const resumoCli = useMemo(() => resumoClientes(clientes, atendimentos), [clientes, atendimentos])
  const lista = resumoCli.filter(({ cliente: c }) => !busca.trim() || `${c.nome} ${c.telefone || ''}`.toLowerCase().includes(busca.trim().toLowerCase()))

  if (!atendimentosOk) {
    return <div className="page"><div className="alert alert-amber"><strong>Falta criar as tabelas dos atendimentos.</strong> Rode o arquivo <code>inbox/34_atendimentos.sql</code> no SQL Editor do Supabase e recarregue esta página.</div></div>
  }

  const salvarComPatch = (a, patch) => salvarAtendimento({ id: a.id, ...patch })
  async function confirmarRealizado(a, { pago, forma }) {
    const ok = await salvarComPatch(a, patchRealizar(a, { pago, forma, hoje }))
    if (ok) setModal(null)
  }
  async function confirmarReceber(a, { forma }) {
    const ok = await salvarComPatch(a, patchReceber(a, { forma, hoje }))
    if (ok) setModal(null)
  }
  const encerrar = (a, status) => window.confirm(status === 'faltou' ? `Marcar que ${clienteDe(a.cliente_id)?.nome || 'a cliente'} faltou? Não conta na receita.` : 'Cancelar este atendimento? Não conta na receita.') && salvarComPatch(a, patchEncerrar(status))
  const desfazer = (a) => window.confirm('Voltar este atendimento para "agendado"? O recebimento é desmarcado.') && salvarComPatch(a, patchDesfazer())

  const cartao = (a) => {
    const c = clienteDe(a.cliente_id)
    return (
      <div key={a.id} className="card" style={{ padding: '10px 14px', marginBottom: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <b>{a.horario ? `${a.horario} · ` : ''}{c?.nome || '—'}</b> <span className={`badge ${COR_STATUS[a.status]}`} style={{ fontSize: 10 }}>{STATUS[a.status]}</span>
            {a.status === 'realizado' && !a.pago && <span className="badge badge-amber" style={{ marginLeft: 4, fontSize: 10 }}>a receber</span>}
            <div className="cad-sub">{a.servico_nome} · {textoDuracao(a.duracao_min)}{a.observacao ? ` · ${a.observacao}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono"><b>{fmt(a.valor)}</b></div>
            {Number(a.custo_material) > 0 && <div className="cad-sub">sobra {fmt(lucro(a))}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          {a.status === 'agendado' && <button className="btn btn-primary btn-sm" onClick={() => setModal({ tipo: 'realizado', a })}>✓ Realizado</button>}
          {a.status === 'realizado' && !a.pago && <button className="btn btn-primary btn-sm" onClick={() => setModal({ tipo: 'receber', a })}>Marcar recebido</button>}
          {a.status === 'agendado' && <button className="link-btn" onClick={() => encerrar(a, 'cancelado')}>cancelar</button>}
          {a.status === 'agendado' && <button className="link-btn" onClick={() => encerrar(a, 'faltou')}>faltou</button>}
          {a.status !== 'agendado' && <button className="link-btn" onClick={() => desfazer(a)}>desfazer</button>}
          <button className="link-btn" onClick={() => setModal({ tipo: 'atendimento', atendimento: a })}>editar</button>
          {c?.telefone && <a className="link-btn" href={zap(c.telefone)} target="_blank" rel="noreferrer">WhatsApp</a>}
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      {modal?.tipo === 'atendimento' && (
        <ModalAtendimento atendimento={modal.atendimento} dataInicial={modal.data} clienteInicial={modal.clienteId} clientes={clientes} servicos={servicos} atendimentos={atendimentos}
          onSalvar={salvarAtendimento} onRemover={removerAtendimento} onNovaCliente={() => setModal({ tipo: 'cliente', voltar: modal })} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'cliente' && <ModalCliente cliente={modal.cliente} onSalvar={salvarCliente} onRemover={removerCliente} onClose={() => setModal(modal.voltar || null)} />}
      {modal?.tipo === 'servico' && <ModalServico servico={modal.servico} onSalvar={salvarServico} onRemover={removerServico} onClose={() => setModal(null)} />}
      {modal?.tipo === 'realizado' && <ModalRecebimento titulo="Atendimento realizado" onConfirmar={(x) => confirmarRealizado(modal.a, x)} onClose={() => setModal(null)} />}
      {modal?.tipo === 'receber' && <ModalRecebimento titulo="Marcar como recebido" permitirDepois={false} onConfirmar={(x) => confirmarReceber(modal.a, x)} onClose={() => setModal(null)} />}

      <div className="pag-topo">
        <NavMes mes={mes} onChange={setMes} />
        <div className="aulas-acoes">
          <button className="btn btn-primary" disabled={!clientes.length} onClick={() => setModal({ tipo: 'atendimento' })}>+ Atendimento</button>
          <button className="btn btn-ghost" onClick={() => setModal({ tipo: 'cliente' })}>+ Cliente</button>
        </div>
      </div>

      <div className="kpi-faixa" aria-label="Resumo do mês">
        <div className="kpi"><div className="kpi-rotulo">Faturado</div><div className="kpi-valor verde">{fmtK(r.faturado)}</div><div className="kpi-sub">{r.realizados} {r.realizados === 1 ? 'atendimento' : 'atendimentos'} · {textoDuracao(r.minutos)}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Previsto</div><div className="kpi-valor azul">{fmtK(r.previsto)}</div><div className="kpi-sub">{r.agendados} agendado{r.agendados === 1 ? '' : 's'}</div></div>
        <div className="kpi"><div className="kpi-rotulo">A receber</div><div className="kpi-valor ambar">{fmtK(r.aReceber)}</div><div className="kpi-sub">recebido {fmtK(r.recebido)}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Sobra (sem material)</div><div className="kpi-valor">{fmtK(r.lucro)}</div><div className="kpi-sub">{r.cancelados + r.faltas ? `${r.cancelados} cancelado${r.cancelados === 1 ? '' : 's'} · ${r.faltas} falta${r.faltas === 1 ? '' : 's'}` : `material ${fmtK(r.material)}`}</div></div>
      </div>

      <Pilulas rotulo="Visão" valor={visao} onChange={setVisao} opcoes={[['agenda', 'Agenda'], ['clientes', 'Clientes'], ['servicos', 'Serviços']]} />

      {visao === 'agenda' && (
        <div style={{ marginTop: 12 }}>
          {clientes.length > 0 && (
            <div className="aulas-acoes" style={{ marginBottom: 10 }}>
              <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por cliente"><option value="">Todas as clientes</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
            </div>
          )}
          {!clientes.length ? (
            <div className="card"><div className="empty">Comece cadastrando a primeira cliente e os serviços que você faz.{'\n'}Depois é só marcar os atendimentos na agenda.</div></div>
          ) : !servicos.length ? (
            <div className="alert alert-blue">Cadastre seus serviços (preço, duração e material) na aba <b>Serviços</b>: ao marcar um atendimento, o valor já vem preenchido.</div>
          ) : null}
          {porDia.length === 0 && clientes.length > 0 && <div className="card"><div className="empty">Nenhum atendimento neste mês.</div></div>}
          {porDia.map(([dia, itens]) => (
            <div key={dia}>
              <div className="section-label" style={{ textTransform: 'none' }}>{rotuloDia(dia, hoje)}</div>
              {itens.map(cartao)}
            </div>
          ))}
        </div>
      )}

      {visao === 'clientes' && (
        <div style={{ marginTop: 12 }}>
          <div className="form-group" style={{ maxWidth: 360 }}><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone" aria-label="Buscar cliente" /></div>
          {lista.length === 0 ? <div className="card"><div className="empty">{clientes.length ? 'Ninguém encontrado.' : 'Nenhuma cliente cadastrada ainda.'}</div></div> : (
            <div className="card" style={{ padding: 0 }}>
              {lista.map(({ cliente: c, total, gasto, ultimo, proximo, aReceber: devendo }) => (
                <div key={c.id} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', opacity: c.ativo === false ? 0.55 : 1 }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{c.nome}</b>{c.ativo === false && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>inativa</span>}{devendo > 0 && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>deve {fmt(devendo)}</span>}
                    <div className="cad-sub">{total} {total === 1 ? 'atendimento' : 'atendimentos'}{gasto > 0 ? ` · ${fmt(gasto)}` : ''}{ultimo ? ` · último ${dataBr(ultimo)}` : ''}{proximo ? ` · próximo ${dataBr(proximo)}` : ''}</div>
                    {c.observacoes && <div className="cad-sub">{c.observacoes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button className="link-btn" onClick={() => setModal({ tipo: 'atendimento', clienteId: c.id })}>marcar</button>
                    <button className="link-btn" onClick={() => setModal({ tipo: 'cliente', cliente: c })}>editar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {visao === 'servicos' && (
        <div style={{ marginTop: 12 }}>
          <div className="aulas-acoes" style={{ marginBottom: 10 }}><button className="btn btn-primary" onClick={() => setModal({ tipo: 'servico' })}>+ Serviço</button></div>
          {servicos.length === 0 ? <div className="card"><div className="empty">Nenhum serviço ainda. Cadastre o nome, o preço, quanto tempo leva e o material que gasta.</div></div> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="tabela-compacta">
                <thead><tr><th>Serviço</th><th style={{ textAlign: 'right' }}>Preço</th><th className="col-opc" style={{ textAlign: 'right' }}>Duração</th><th className="col-opc" style={{ textAlign: 'right' }}>Material</th><th style={{ textAlign: 'right' }}>Sobra</th><th /></tr></thead>
                <tbody>
                  {servicos.map((s) => (
                    <tr key={s.id} style={{ opacity: s.ativo === false ? 0.55 : 1 }}>
                      <td>{s.nome}{s.ativo === false && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>inativo</span>}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(s.preco)}</td>
                      <td className="mono col-opc" style={{ textAlign: 'right' }}>{textoDuracao(s.duracao_min)}</td>
                      <td className="mono col-opc" style={{ textAlign: 'right' }}>{Number(s.custo_material) ? fmt(s.custo_material) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(Number(s.preco) - Number(s.custo_material || 0))}</td>
                      <td><button className="link-btn" onClick={() => setModal({ tipo: 'servico', servico: s })}>editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
