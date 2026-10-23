import { useMemo, useState } from 'react'
import NavMes, { Pilulas } from './NavMes'
import ModalAtendimento from './atendimentos/ModalAtendimento'
import ModalCliente from './atendimentos/ModalCliente'
import ModalServico from './atendimentos/ModalServico'
import ModalPacote from './atendimentos/ModalPacote'
import ModalProduto from './atendimentos/ModalProduto'
import ModalVenda from './atendimentos/ModalVenda'
import RelatorioAtendimentos from './atendimentos/RelatorioAtendimentos'
import { fmt, fmtK, nowYM, hojeSP } from '../lib/utils'
import { textoDuracao } from '../lib/aulas'
import { saldoPacote, situacaoPacote, valorVenda, retornosPendentes, aniversariantes, mensagemRetorno, mensagemAniversario } from '../lib/atendimentosExtra'
import { STATUS, FORMAS, atendimentosDoMes, porData, resumoMes, resumoClientes, patchRealizar, patchReceber, patchDesfazer, patchEncerrar, lucro } from '../lib/atendimentos'

const COR_STATUS = { agendado: 'badge-blue', realizado: 'badge-green', cancelado: 'badge-gray', faltou: 'badge-red' }
const dataBr = (d) => d.split('-').reverse().join('/')
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const rotuloDia = (d, hoje) => `${d === hoje ? 'Hoje · ' : ''}${DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()]}, ${dataBr(d).slice(0, 5)}`
const zap = (t, msg = '') => `https://wa.me/55${String(t || '').replace(/\D/g, '').replace(/^55/, '')}${msg ? `?text=${encodeURIComponent(msg)}` : ''}`
const somarDias = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10)
const SITUACAO_PACOTE = { ativo: ['badge-green', 'em andamento'], esgotado: ['badge-gray', 'esgotado'], vencido: ['badge-red', 'vencido'], inativo: ['badge-gray', 'inativo'] }

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
export default function Atendimentos({ store, visaoInicial = 'agenda' }) {
  const { clientes, servicos, atendimentos, atendimentosOk, pacotes = [], produtos = [], vendasProdutos = [], pacotesOk = false, salvarCliente, salvarServico, salvarAtendimento, removerCliente, removerServico, removerAtendimento, salvarPacote, removerPacote, salvarProduto, removerProduto, registrarVendaProduto, removerVendaProduto } = store
  const hoje = hojeSP()
  const [mes, setMes] = useState(nowYM())
  const [visao, setVisao] = useState(visaoInicial)
  const [filtro, setFiltro] = useState('')
  const [busca, setBusca] = useState('')
  const [modal, setModal] = useState(null) // { tipo: 'atendimento'|'cliente'|'servico'|'recebimento', ... }

  const doMes = useMemo(() => atendimentosDoMes(atendimentos, mes, filtro || null).sort(porData), [atendimentos, mes, filtro])
  const r = useMemo(() => resumoMes(atendimentosDoMes(atendimentos, mes)), [atendimentos, mes])
  const porDia = useMemo(() => { const m = new Map(); for (const a of doMes) m.set(a.data, [...(m.get(a.data) || []), a]); return [...m.entries()] }, [doMes])
  const clienteDe = (id) => clientes.find((c) => c.id === id)
  const resumoCli = useMemo(() => resumoClientes(clientes, atendimentos), [clientes, atendimentos])
  const lista = resumoCli.filter(({ cliente: c }) => !busca.trim() || `${c.nome} ${c.telefone || ''}`.toLowerCase().includes(busca.trim().toLowerCase()))

  const retornos = useMemo(() => (pacotesOk ? retornosPendentes({ clientes, atendimentos, servicos, hoje }) : []), [pacotesOk, clientes, atendimentos, servicos, hoje])
  const aniv = useMemo(() => aniversariantes(clientes, hoje, 14), [clientes, hoje])
  // Pacotes vendidos e produtos vendidos no mês também entram no faturado e no a receber.
  const extra = useMemo(() => {
    const pac = pacotes.filter((p) => p.ativo !== false && String(p.data_venda).slice(0, 7) === mes)
    const ven = vendasProdutos.filter((v) => String(v.data).slice(0, 7) === mes)
    const soma = (l, f) => Math.round(l.reduce((t, x) => t + f(x), 0) * 100) / 100
    return { pacotes: soma(pac, (p) => Number(p.valor)), produtos: soma(ven, valorVenda), aReceber: soma(pac.filter((p) => !p.pago), (p) => Number(p.valor)) + soma(ven.filter((v) => !v.pago), valorVenda), lucroProdutos: soma(ven, (v) => (Number(v.quantidade) || 0) * ((Number(v.valor_unit) || 0) - (Number(v.custo_unit) || 0))) }
  }, [pacotes, vendasProdutos, mes])

  if (!atendimentosOk) {
    return <div className="page"><div className="alert alert-amber"><strong>Falta criar as tabelas dos atendimentos.</strong> Rode o arquivo <code>inbox/34_atendimentos.sql</code> no SQL Editor do Supabase e recarregue esta página.</div></div>
  }

  const salvarVendaPaga = async (v) => { await store.salvarVendaProduto({ id: v.id, pago: true, data_pagamento: hoje, forma_pagamento: v.forma_pagamento || 'Pix' }) }
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
            <div className="cad-sub">{a.servico_nome} · {textoDuracao(a.duracao_min)}{a.pacote_id ? ' · sessão de pacote' : ''}{a.observacao ? ` · ${a.observacao}` : ''}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="mono"><b>{fmt(a.valor)}</b></div>
            {Number(a.custo_material) > 0 && <div className="cad-sub">sobra {fmt(lucro(a))}</div>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
          {a.status === 'agendado' && <button className="btn btn-primary btn-sm" onClick={() => (a.pacote_id ? salvarComPatch(a, patchRealizar(a, { pago: true, hoje })) : setModal({ tipo: 'realizado', a }))}>✓ Realizado</button>}
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
        <ModalAtendimento atendimento={modal.atendimento} dataInicial={modal.data} clienteInicial={modal.clienteId} pacoteInicial={modal.pacoteId} pacotes={pacotes} pacotesOk={pacotesOk} clientes={clientes} servicos={servicos} atendimentos={atendimentos}
          onSalvar={salvarAtendimento} onRemover={removerAtendimento} onNovaCliente={() => setModal({ tipo: 'cliente', voltar: modal })} onClose={() => setModal(null)} />
      )}
      {modal?.tipo === 'cliente' && <ModalCliente cliente={modal.cliente} onSalvar={salvarCliente} onRemover={removerCliente} onClose={() => setModal(modal.voltar || null)} />}
      {modal?.tipo === 'pacote' && <ModalPacote pacote={modal.pacote} clienteInicial={modal.clienteId} clientes={clientes} servicos={servicos} onSalvar={salvarPacote} onRemover={removerPacote} onClose={() => setModal(null)} />}
      {modal?.tipo === 'produto' && <ModalProduto produto={modal.produto} onSalvar={salvarProduto} onRemover={removerProduto} onClose={() => setModal(null)} />}
      {modal?.tipo === 'venda' && <ModalVenda produtoInicial={modal.produtoId} produtos={produtos} clientes={clientes} onSalvar={registrarVendaProduto} onClose={() => setModal(null)} />}
      {modal?.tipo === 'servico' && <ModalServico servico={modal.servico} comRetorno={pacotesOk} onSalvar={salvarServico} onRemover={removerServico} onClose={() => setModal(null)} />}
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
        <div className="kpi"><div className="kpi-rotulo">Faturado</div><div className="kpi-valor verde">{fmtK(r.faturado + extra.pacotes + extra.produtos)}</div><div className="kpi-sub">{r.realizados} {r.realizados === 1 ? 'atendimento' : 'atendimentos'}{extra.pacotes ? ` + ${fmtK(extra.pacotes)} em pacotes` : ''}{extra.produtos ? ` + ${fmtK(extra.produtos)} em produtos` : ''}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Previsto</div><div className="kpi-valor azul">{fmtK(r.previsto)}</div><div className="kpi-sub">{r.agendados} agendado{r.agendados === 1 ? '' : 's'}</div></div>
        <div className="kpi"><div className="kpi-rotulo">A receber</div><div className="kpi-valor ambar">{fmtK(r.aReceber + extra.aReceber)}</div><div className="kpi-sub">recebido {fmtK(r.recebido)}</div></div>
        <div className="kpi"><div className="kpi-rotulo">Sobra (sem material)</div><div className="kpi-valor">{fmtK(r.lucro + extra.pacotes + extra.lucroProdutos)}</div><div className="kpi-sub">{r.cancelados + r.faltas ? `${r.cancelados} cancelado${r.cancelados === 1 ? '' : 's'} · ${r.faltas} falta${r.faltas === 1 ? '' : 's'}` : `material ${fmtK(r.material)}`}</div></div>
      </div>

      <Pilulas rotulo="Visão" valor={visao} onChange={setVisao} opcoes={[['agenda', 'Agenda'], ['clientes', 'Clientes'], ['servicos', 'Serviços'], ...(pacotesOk ? [['retornos', `Retornos${retornos.length + aniv.length ? ` (${retornos.length + aniv.length})` : ''}`], ['pacotes', 'Pacotes'], ['produtos', 'Produtos'], ['relatorio', 'Relatório']] : [])]} />

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
                <thead><tr><th>Serviço</th><th style={{ textAlign: 'right' }}>Preço</th><th className="col-opc" style={{ textAlign: 'right' }}>Duração</th><th className="col-opc" style={{ textAlign: 'right' }}>Material</th><th style={{ textAlign: 'right' }}>Sobra</th>{pacotesOk && <th className="col-opc" style={{ textAlign: 'right' }}>Volta a cada</th>}<th /></tr></thead>
                <tbody>
                  {servicos.map((s) => (
                    <tr key={s.id} style={{ opacity: s.ativo === false ? 0.55 : 1 }}>
                      <td>{s.nome}{s.ativo === false && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>inativo</span>}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(s.preco)}</td>
                      <td className="mono col-opc" style={{ textAlign: 'right' }}>{textoDuracao(s.duracao_min)}</td>
                      <td className="mono col-opc" style={{ textAlign: 'right' }}>{Number(s.custo_material) ? fmt(s.custo_material) : '—'}</td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmt(Number(s.preco) - Number(s.custo_material || 0))}</td>
                      {pacotesOk && <td className="mono col-opc" style={{ textAlign: 'right' }}>{s.retorno_dias ? `${s.retorno_dias} dias` : '—'}</td>}
                      <td><button className="link-btn" onClick={() => setModal({ tipo: 'servico', servico: s })}>editar</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {visao === 'retornos' && (
        <div style={{ marginTop: 12 }}>
          <div className="section-label">para chamar (já passou da hora de voltar)</div>
          {retornos.length === 0 ? (
            <div className="card"><div className="empty">{servicos.some((x) => x.retorno_dias) ? 'Ninguém para chamar agora. 🎉' : 'Em Serviços, informe de quantos em quantos dias a cliente costuma voltar (ex.: limpeza de pele a cada 30 dias). Aí a lista aparece aqui.'}</div></div>
          ) : retornos.map((x) => (
            <div key={x.cliente.id} className="card" style={{ padding: '10px 14px', marginBottom: 8 }}>
              <b>{x.cliente.nome}</b> <span className={`badge ${x.dias < 0 ? 'badge-red' : 'badge-amber'}`} style={{ fontSize: 10 }}>{x.dias < 0 ? `${-x.dias} ${-x.dias === 1 ? 'dia' : 'dias'} de atraso` : x.dias === 0 ? 'volta hoje' : `em ${x.dias} ${x.dias === 1 ? 'dia' : 'dias'}`}</span>
              <div className="cad-sub">último: {x.servico_nome} em {dataBr(x.ultimo.data)}</div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                {x.cliente.telefone && <a className="btn btn-primary btn-sm" href={zap(x.cliente.telefone, mensagemRetorno(x))} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>}
                <button className="link-btn" onClick={() => setModal({ tipo: 'atendimento', clienteId: x.cliente.id })}>agendar</button>
                <button className="link-btn" onClick={() => salvarCliente({ id: x.cliente.id, retorno_adiado_ate: somarDias(hoje, 15) })}>já chamei (esconder 15 dias)</button>
                <button className="link-btn" onClick={() => window.confirm(`Marcar ${x.cliente.nome} como inativa? Ela sai das listas.`) && salvarCliente({ id: x.cliente.id, ativo: false })}>não volta mais</button>
              </div>
            </div>
          ))}
          <div className="section-label">aniversários nos próximos 14 dias</div>
          {aniv.length === 0 ? <div className="card"><div className="empty">Nenhum aniversário por perto. Cadastre a data de nascimento no cadastro da cliente.</div></div> : aniv.map((a) => (
            <div key={a.cliente.id} className="card" style={{ padding: '10px 14px', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <span><b>{a.cliente.nome}</b> <span className="cad-sub">{a.dias === 0 ? 'hoje' : `em ${a.dias} ${a.dias === 1 ? 'dia' : 'dias'} (${dataBr(a.data).slice(0, 5)})`} · {a.idade} anos</span></span>
              {a.cliente.telefone && <a className="btn btn-ghost btn-sm" href={zap(a.cliente.telefone, mensagemAniversario(a))} target="_blank" rel="noreferrer">Dar parabéns</a>}
            </div>
          ))}
        </div>
      )}

      {visao === 'pacotes' && (
        <div style={{ marginTop: 12 }}>
          <div className="aulas-acoes" style={{ marginBottom: 10 }}><button className="btn btn-primary" disabled={!clientes.length} onClick={() => setModal({ tipo: 'pacote' })}>+ Pacote</button></div>
          {pacotes.length === 0 ? <div className="card"><div className="empty">Nenhum pacote vendido ainda. Venda 5 ou 10 sessões de uma vez e acompanhe quantas faltam.</div></div> : pacotes.map((p) => {
            const sd = saldoPacote(p, atendimentos)
            const sit = situacaoPacote(p, atendimentos, hoje)
            const [cor, rot] = SITUACAO_PACOTE[sit]
            return (
              <div key={p.id} className="card" style={{ padding: '10px 14px', marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <b>{p.nome}</b> <span className={`badge ${cor}`} style={{ fontSize: 10 }}>{rot}</span>{!p.pago && <span className="badge badge-amber" style={{ marginLeft: 4, fontSize: 10 }}>a receber</span>}
                    <div className="cad-sub">{clienteDe(p.cliente_id)?.nome || '—'} · vendido em {dataBr(p.data_venda)}{p.validade ? ` · vale até ${dataBr(p.validade)}` : ''}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}><div className="mono"><b>{fmt(p.valor)}</b></div><div className="cad-sub">{fmt(sd.valorSessao)} por sessão</div></div>
                </div>
                <div className="aulas-meta-barra" style={{ margin: '8px 0 4px' }} role="progressbar" aria-valuenow={sd.feitas} aria-valuemin={0} aria-valuemax={sd.total} aria-label="Sessões feitas">
                  <span className="apur" style={{ width: `${Math.round((sd.feitas / sd.total) * 100)}%` }} />
                </div>
                <div className="cad-sub">{sd.feitas} de {sd.total} sessões feitas{sd.reservadas ? ` · ${sd.reservadas} marcada${sd.reservadas > 1 ? 's' : ''}` : ''} · {sd.restam ? `${sd.restam} para marcar` : sit === 'esgotado' ? 'todas feitas' : 'todas marcadas'}</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 6 }}>
                  {sit === 'ativo' && sd.restam > 0 && <button className="btn btn-primary btn-sm" onClick={() => setModal({ tipo: 'atendimento', clienteId: p.cliente_id, pacoteId: p.id })}>Marcar sessão</button>}
                  {!p.pago && <button className="btn btn-ghost btn-sm" onClick={() => salvarPacote({ id: p.id, pago: true, data_pagamento: hoje, forma_pagamento: p.forma_pagamento || 'Pix' })}>Marcar recebido</button>}
                  <button className="link-btn" onClick={() => setModal({ tipo: 'pacote', pacote: p })}>editar</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {visao === 'produtos' && (
        <div style={{ marginTop: 12 }}>
          <div className="aulas-acoes" style={{ marginBottom: 10 }}>
            <button className="btn btn-primary" disabled={!produtos.some((p) => p.ativo !== false)} onClick={() => setModal({ tipo: 'venda' })}>Vender produto</button>
            <button className="btn btn-ghost" onClick={() => setModal({ tipo: 'produto' })}>+ Produto</button>
          </div>
          {produtos.length === 0 ? <div className="card"><div className="empty">Nenhum produto cadastrado. Cadastre cremes e outros itens que você vende, com preço, custo e estoque.</div></div> : (
            <div className="card" style={{ overflowX: 'auto' }}>
              <table className="tabela-compacta">
                <thead><tr><th>Produto</th><th style={{ textAlign: 'right' }}>Preço</th><th className="col-opc" style={{ textAlign: 'right' }}>Custo</th><th style={{ textAlign: 'right' }}>Estoque</th><th /></tr></thead>
                <tbody>{produtos.map((p) => (
                  <tr key={p.id} style={{ opacity: p.ativo === false ? 0.55 : 1 }}>
                    <td>{p.nome}{p.ativo === false && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>inativo</span>}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{fmt(p.preco)}</td>
                    <td className="mono col-opc" style={{ textAlign: 'right' }}>{Number(p.custo) ? fmt(p.custo) : '—'}</td>
                    <td className="mono" style={{ textAlign: 'right', color: p.estoque <= 0 ? 'var(--red)' : p.estoque <= 2 ? 'var(--amber)' : undefined }}>{p.estoque}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{p.ativo !== false && <button className="link-btn" onClick={() => setModal({ tipo: 'venda', produtoId: p.id })}>vender</button>} <button className="link-btn" onClick={() => setModal({ tipo: 'produto', produto: p })}>editar</button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {vendasProdutos.length > 0 && (
            <>
              <div className="section-label">últimas vendas</div>
              <div className="card" style={{ padding: 0 }}>
                {vendasProdutos.slice(0, 10).map((v) => (
                  <div key={v.id} style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                    <span style={{ minWidth: 0 }}>{v.quantidade}× {v.produto_nome} <span className="cad-sub">· {dataBr(v.data)}{v.cliente_id ? ` · ${clienteDe(v.cliente_id)?.nome || ''}` : ''}{!v.pago ? ' · a receber' : ''}</span></span>
                    <span style={{ whiteSpace: 'nowrap' }}><b className="mono">{fmt(valorVenda(v))}</b> {!v.pago && <button className="link-btn" onClick={() => salvarVendaPaga(v)}>recebi</button>} <button className="link-btn" onClick={() => window.confirm('Apagar esta venda? O produto volta ao estoque.') && removerVendaProduto(v)}>apagar</button></span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {visao === 'relatorio' && <RelatorioAtendimentos store={store} />}
    </div>
  )
}
