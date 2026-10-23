import { useMemo, useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'
import { novoAtendimento, conflitoDeHorario } from '../../lib/atendimentos'
import CampoHorario from '../aulas/CampoHorario'
import SeletorDuracao from '../aulas/SeletorDuracao'

// Marcar ou editar um atendimento. O serviço traz preço, duração e material como ponto de partida; tudo pode ser ajustado.
export default function ModalAtendimento({ atendimento, dataInicial, clienteInicial = '', clientes, servicos, atendimentos, onSalvar, onRemover, onNovaCliente, onClose }) {
  const edicao = !!atendimento?.id
  const ativos = clientes.filter((c) => c.ativo !== false || c.id === atendimento?.cliente_id)
  const catalogo = servicos.filter((s) => s.ativo !== false || s.id === atendimento?.servico_id)
  const [f, setF] = useState(() => ({
    cliente_id: atendimento?.cliente_id || clienteInicial || '', servico_id: atendimento?.servico_id || '', servico_nome: atendimento?.servico_nome || '',
    data: atendimento?.data || dataInicial || hojeSP(), horario: atendimento?.horario || '', duracao: atendimento?.duracao_min || 60,
    valor: atendimento ? String(atendimento.valor).replace('.', ',') : '', material: atendimento ? String(atendimento.custo_material).replace('.', ',') : '', observacao: atendimento?.observacao || '',
  }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const valorC = reaisParaCentavos(f.valor), materialC = f.material.trim() ? reaisParaCentavos(f.material) : 0

  function escolherServico(e) {
    const s = catalogo.find((x) => x.id === e.target.value)
    setF((x) => s ? { ...x, servico_id: s.id, servico_nome: s.nome, duracao: s.duracao_min, valor: String(s.preco).replace('.', ','), material: String(s.custo_material).replace('.', ',') } : { ...x, servico_id: '' })
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
    const base = { cliente_id: cliente.id, servico_id: f.servico_id || null, servico_nome: nome, data: f.data, horario: f.horario || null, duracao_min: Number(f.duracao), valor: valorC / 100, custo_material: materialC / 100, observacao: f.observacao.trim() || null }
    const ok = await onSalvar(edicao ? { id: atendimento.id, ...base } : { ...novoAtendimento({ cliente, servico: catalogo.find((s) => s.id === f.servico_id) || { nome }, data: f.data, horario: f.horario, valor: base.valor, duracao_min: base.duracao_min, custo_material: base.custo_material, observacao: base.observacao }), servico_id: base.servico_id, servico_nome: nome })
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
        {!f.servico_id && <div className="form-group"><label>Nome do serviço (se não estiver na lista)</label><input value={f.servico_nome} onChange={set('servico_nome')} placeholder="Ex.: Limpeza de pele" /></div>}
        <div className="form-row cols2">
          <div className="form-group"><label>Data</label><input type="date" value={f.data} onChange={set('data')} /></div>
          <div className="form-group"><label>Horário <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><CampoHorario valor={f.horario} onChange={(h) => setF((x) => ({ ...x, horario: h }))} rotulo="Horário" /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Duração</label><SeletorDuracao valor={f.duracao} onChange={(m) => setF((x) => ({ ...x, duracao: m }))} /></div>
          <div className="form-group"><label>Valor cobrado (R$)</label><input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="Ex.: 180" /></div>
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
