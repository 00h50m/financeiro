import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'
import SeletorDuracao from '../aulas/SeletorDuracao'

// Serviço do catálogo: preço, duração e quanto de material ele gasta (para mostrar quanto sobra de cada atendimento).
export default function ModalServico({ servico, comRetorno = false, onSalvar, onRemover, onClose }) {
  const [f, setF] = useState(() => ({ nome: servico?.nome || '', preco: servico ? String(servico.preco).replace('.', ',') : '', duracao: servico?.duracao_min || 60, material: servico ? String(servico.custo_material).replace('.', ',') : '', retorno: servico?.retorno_dias || '' }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const preco = reaisParaCentavos(f.preco), material = f.material.trim() ? reaisParaCentavos(f.material) : 0
  const valido = f.nome.trim() && preco != null && material != null
  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const ok = await onSalvar({ ...(servico?.id ? { id: servico.id } : {}), nome: f.nome.trim(), preco: preco / 100, duracao_min: Number(f.duracao), custo_material: material / 100, ...(comRetorno ? { retorno_dias: Number(f.retorno) > 0 ? Math.floor(Number(f.retorno)) : null } : {}) })
    setSalvando(false)
    if (ok) onClose()
  }
  async function remover() {
    if (!window.confirm(`Remover o serviço "${servico.nome}"? Os atendimentos já feitos continuam com o nome e o valor da época.`)) return
    if (await onRemover(servico.id)) onClose()
  }
  async function alternarAtivo() {
    const ok = await onSalvar({ id: servico.id, ativo: servico.ativo === false })
    if (ok) onClose()
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{servico?.id ? `Editar ${servico.nome}` : 'Novo serviço'}</div>
        <div className="form-group"><label>Nome do serviço</label><input value={f.nome} onChange={set('nome')} autoFocus placeholder="Ex.: Limpeza de pele" /></div>
        <div className="form-row cols2">
          <div className="form-group"><label>Preço (R$)</label><input inputMode="decimal" value={f.preco} onChange={set('preco')} placeholder="Ex.: 180" /></div>
          <div className="form-group"><label>Duração</label><SeletorDuracao valor={f.duracao} onChange={(m) => setF((x) => ({ ...x, duracao: m }))} /></div>
        </div>
        <div className="form-group"><label>Material gasto por atendimento (R$) <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input inputMode="decimal" value={f.material} onChange={set('material')} placeholder="Ex.: 25" /></div>
        {comRetorno && <div className="form-group" style={{ maxWidth: 260 }}><label>Costuma voltar a cada (dias) <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input type="number" min="1" max="730" value={f.retorno} onChange={set('retorno')} placeholder="Ex.: 30" /></div>}
        {preco != null && <div className="cad-sub">Sobra por atendimento: <b>{fmt(Math.max(0, (preco - (material || 0)) / 100))}</b></div>}
        <div className="modal-footer">
          {servico?.id && (
            <span style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" onClick={alternarAtivo}>{servico.ativo === false ? 'Reativar' : 'Inativar'}</button>
              <button className="btn btn-ghost" onClick={remover}>Remover</button>
            </span>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
