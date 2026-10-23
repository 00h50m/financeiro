import { useState } from 'react'

// Cadastro da cliente: nome e telefone bastam; aniversário e observações (alergias, preferências) ajudam no atendimento.
export default function ModalCliente({ cliente, onSalvar, onRemover, onClose }) {
  const [f, setF] = useState(() => ({ nome: cliente?.nome || '', telefone: cliente?.telefone || '', nascimento: cliente?.nascimento || '', observacoes: cliente?.observacoes || '' }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  async function salvar() {
    if (!f.nome.trim()) return
    setSalvando(true)
    const ok = await onSalvar({ ...(cliente?.id ? { id: cliente.id } : {}), nome: f.nome.trim(), telefone: f.telefone.trim() || null, nascimento: f.nascimento || null, observacoes: f.observacoes.trim() || null })
    setSalvando(false)
    if (ok) onClose(ok)
  }
  async function remover() {
    if (!window.confirm(`Remover ${cliente.nome}? Os atendimentos dela também serão apagados. Para só tirar da lista, use "Inativar".`)) return
    if (await onRemover(cliente.id)) onClose()
  }
  async function alternarAtivo() {
    const ok = await onSalvar({ id: cliente.id, ativo: cliente.ativo === false })
    if (ok) onClose()
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{cliente?.id ? `Editar ${cliente.nome}` : 'Nova cliente'}</div>
        <div className="form-group"><label>Nome</label><input value={f.nome} onChange={set('nome')} autoFocus placeholder="Ex.: Maria Souza" /></div>
        <div className="form-row cols2">
          <div className="form-group"><label>WhatsApp (com DDD)</label><input inputMode="tel" value={f.telefone} onChange={set('telefone')} placeholder="(11) 91234-5678" /></div>
          <div className="form-group"><label>Aniversário <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input type="date" value={f.nascimento} onChange={set('nascimento')} /></div>
        </div>
        <div className="form-group"><label>Observações <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(alergias, preferências)</span></label><input value={f.observacoes} onChange={set('observacoes')} placeholder="Ex.: pele sensível, alergia a ácido" /></div>
        <div className="modal-footer">
          {cliente?.id && (
            <span style={{ marginRight: 'auto', display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" onClick={alternarAtivo}>{cliente.ativo === false ? 'Reativar' : 'Inativar'}</button>
              <button className="btn btn-ghost" onClick={remover}>Remover</button>
            </span>
          )}
          <button className="btn btn-ghost" onClick={() => onClose()}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!f.nome.trim() || salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
