import { useMemo, useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'
import { novoAtendimento, conflitoDeHorario } from '../../lib/atendimentos'
import { pacotesUsaveis, saldoPacote } from '../../lib/atendimentosExtra'
import CampoHorario from '../aulas/CampoHorario'
import SeletorDuracao from '../aulas/SeletorDuracao'

// Marcar ou editar um atendimento. O serviço traz preço, duração e material como ponto de partida; tudo pode ser ajustado.
export default function ModalAtendimento({ atendimento, dataInicial, clienteInicial = '', pacoteInicial = '', pacotes = [], pacotesOk = false, clientes, servicos, atendimentos, onSalvar, onRemover, onNovaCliente, onClose }) {
  const edicao = !!atendimento?.id
  const ativos = clientes.filter((c) => c.ativo !== false || c.id === atendimento?.cliente_id)
  const catalogo = servicos.filter((s) => s.ativo !== false || s.id === atendimento?.servico_id)
  const [f, setF] = useState(() => ({
    cliente_id: atendimento?.cliente_id || clienteInicial || '', pacote_id: atendimento?.pacote_id || pacoteInicial || '', servico_id: atendimento?.servico_id || '', servico_nome: atendimento?.servico_nome || '',
    data: atendimento?.data || dataInicial || hojeSP(), horario: atendimento?.horario || '', duracao: atendimento?.duracao_min || 60,
    valor: atendimento ? String(atendimento.valor).replace('.', ',') : '', material: atendimento ? String(atendimento.custo_material).replace('.', ',') : '', observacao: atendimento?.observacao || '',
  }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const hoje = hojeSP()
  const doPacote = pacotes.find((p) => p.id === f.pacote_id)
  const usaveis = useMemo(() => pacotesUsaveis(pacotes, atendimentos, f.cliente_id, hoje).concat(doPacote && !pacotesUsaveis(pacotes, atendimentos, f.cliente_id, hoje).some((p) => p.id === doPacote.id) ? [doPacote] : []), [pacotes, atendimentos, f.cliente_id, hoje, doPacote])
  const valorC = doPacote ? 0 : reaisParaCentavos(f.valor), materialC = f.material.trim() ? reaisParaCentavos(f.material) : 0

  function escolherServico(e) {
    const s = catalogo.find((x) => x.id === e.target.value)
    setF((x) => s ? { ...x, servico_id: s.id, servico_nome: s.nome, duracao: s.duracao_min, valor: String(s.preco).replace('.', ','), material: String(s.custo_material).replace('.', ',') } : { ...x, servico_id: '' })
  }
  function escolherPacote(e) {
    const p = pacotes.find((x) => x.id === e.target.value)
    const sv = p?.servico_id ? catalogo.find((x) => x.id === p.servico_id) : null
    setF((x) => p ? { ...x, pacote_id: p.id, ...(sv ? { servico_id: sv.id, servico_nome: sv.nome, duracao: sv.duracao_min, material: String(sv.custo_material).replace('.', ',') } : {}), valor: '0' } : { ...x, pacote_id: '', valor: x.servico_id ? String(catalogo.find((s) => s.id === x.servico_id)?.preco ?? '').replace('.', ',') : '' })
  }
  const cliente = clientes.find((c) => c.id === f.cliente_id)
  const nome = (f.servico_nome || '').trim()
  const valido = cliente && nome && f.data && valorC != null && materialC != null
  const novo = useMemo(() => ({ data: f.data, horario: f.horario, duracao_min: Number(f.duracao) }), [f.data, f.horario, f.duracao])
  const conflito = useMemo(() => conflitoDeHorario(atendimentos, novo, atendimento?.id), [atendimentos, novo, atendimento])
  const nomeDe = (id) => clientes.find((c) => c.id === id)?.nome || 'outra cliente'

  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const base = { cliente_id: cliente.id, servico_id: f.servico_id || null, servico_nome: nome, data: f.data, horario: f.horario || null, duracao_min: Number(f.duracao), valor: valorC / 100, custo_material: materialC / 100, observacao: f.observacao.trim() || null, ...(pacotesOk ? { pacote_id: f.pacote_id || null } : {}) }
    const ok = await onSalvar(edicao ? { id: atendimento.id, ...base } : { ...novoAtendimento({ cliente, servico: catalogo.find((s) => s.id === f.servico_id) || { nome }, data: f.data, horario: f.horario, valor: base.valor, duracao_min: base.duracao_min, custo_material: base.custo_material, observacao: base.observacao }), servico_id: base.servico_id, servico_nome: nome, ...(pacotesOk ? { pacote_id: base.pacote_id } : {}) })
    setSalvando(false)
    if (ok) onClose()
  }
  async function remover() {
    if (!window.confirm('Apagar este atendimento? (Para cancelar mantendo o histórico, use "cancelar" na agenda.)')) return
    if (await onRemover(atendimento.id)) onClose()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-title">{edicao ? 'Editar atendimento' : 'Novo atendimento'}</div>
        <div className="form-row cols2">
          <div className="form-group"><label>Cliente</label>
            <select value={f.cliente_id} onChange={set('cliente_id')}>
              <option value="">Escolha…</option>
              {ativos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button type="button" className="link-btn" onClick={onNovaCliente}>+ nova cliente</button>
          </div>
          <div className="form-group"><label>Serviço</label>
            <select value={f.servico_id} onChange={escolherServico}>
              <option value="">{f.servico_id || !f.servico_nome ? 'Escolha…' : `${f.servico_nome} (avulso)`}</option>
              {catalogo.map((s) => <option key={s.id} value={s.id}>{s.nome} · {fmt(s.preco)}</option>)}
            </select>
          </div>
        </div>
        {pacotesOk && f.cliente_id && (usaveis.length > 0 || f.pacote_id) && (
          <div className="form-group"><label>Cobrança</label>
            <select value={f.pacote_id} onChange={escolherPacote}>
              <option value="">Avulso (cobra o valor abaixo)</option>
              {usaveis.map((p) => { const sd = saldoPacote(p, atendimentos); return <option key={p.id} value={p.id}>Sessão do pacote: {p.nome} (feitas {sd.feitas}/{sd.total})</option> })}
            </select>
          </div>
        )}
        {!f.servico_id && <div className="form-group"><label>Nome do serviço (se não estiver na lista)</label><input value={f.servico_nome} onChange={set('servico_nome')} placeholder="Ex.: Limpeza de pele" /></div>}
        <div className="form-row cols2">
          <div className="form-group"><label>Data</label><input type="date" value={f.data} onChange={set('data')} /></div>
          <div className="form-group"><label>Horário <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><CampoHorario valor={f.horario} onChange={(h) => setF((x) => ({ ...x, horario: h }))} rotulo="Horário" /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Duração</label><SeletorDuracao valor={f.duracao} onChange={(m) => setF((x) => ({ ...x, duracao: m }))} /></div>
          <div className="form-group"><label>Valor cobrado (R$)</label><input inputMode="decimal" value={doPacote ? '0' : f.valor} onChange={set('valor')} placeholder="Ex.: 180" disabled={!!doPacote} title={doPacote ? 'Já pago no pacote' : undefined} /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Material gasto (R$)</label><input inputMode="decimal" value={f.material} onChange={set('material')} placeholder="0" /></div>
          <div className="form-group"><label>Observação</label><input value={f.observacao} onChange={set('observacao')} placeholder="Opcional" /></div>
        </div>
        {conflito && <div className="alert alert-amber">Esse horário bate com {nomeDe(conflito.cliente_id)} ({conflito.horario}, {conflito.servico_nome}). Dá para salvar mesmo assim.</div>}
        <div className="modal-footer">
          {edicao && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={remover}>Apagar</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
