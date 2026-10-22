import { useState } from 'react'
import { LIQUIDEZ } from '../lib/reserva'
import { reaisParaCentavos } from '../lib/aulas'

// Um lugar onde está o dinheiro da reserva (poupança, CDB, conta, dinheiro, FGTS…).
export default function ModalFonteReserva({ fonte, onSalvar, onRemover, onClose }) {
  const [f, setF] = useState(() => ({ nome: fonte?.nome || '', valor: fonte ? String(fonte.valor).replace('.', ',') : '', liquidez: fonte?.liquidez || 'na_hora', observacao: fonte?.observacao || '' }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const cent = reaisParaCentavos(f.valor)
  const valido = f.nome.trim() && cent != null

  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const ok = await onSalvar({ ...(fonte?.id ? { id: fonte.id } : {}), nome: f.nome.trim(), valor: cent / 100, liquidez: f.liquidez, observacao: f.observacao.trim() || null, atualizado_em: new Date().toISOString().slice(0, 10) })
    setSalvando(false)
    if (ok) onClose()
  }
  async function remover() {
    if (!window.confirm(`Remover "${fonte.nome}" da reserva?`)) return
    if (await onRemover(fonte)) onClose()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{fonte ? 'Editar' : 'Onde está o dinheiro'}</div>
        <div className="form-group"><label>Nome</label><input value={f.nome} onChange={set('nome')} autoFocus placeholder="Ex.: Poupança Caixa, CDB Nubank, dinheiro guardado" /></div>
        <div className="form-row cols2">
          <div className="form-group"><label>Quanto tem aí (R$)</label><input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="Ex.: 2.540,00" /></div>
          <div className="form-group"><label>Dá para sacar</label>
            <select value={f.liquidez} onChange={set('liquidez')}>{Object.entries(LIQUIDEZ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
        </div>
        <div className="form-group"><label>Observação <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input value={f.observacao} onChange={set('observacao')} placeholder="Ex.: rende 100% do CDI, resgate em D+1" /></div>
        <div className="modal-footer">
          {fonte && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={remover}>Remover</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
