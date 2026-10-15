import { useState } from 'react'
import { fmt, mesLabel, addMonths } from '../lib/utils'

// Escolhe para qual mês adiar uma conta sem cartão (boleto, Pix, conta fixa). A conta sai do mês de origem e entra no escolhido.
export default function ModalAdiar({ titulo, valor, mesOrigem, mesAtualDestino, onConfirmar, onClose }) {
  const opcoes = Array.from({ length: 6 }, (_, i) => addMonths(mesOrigem, i + 1))
  const [destino, setDestino] = useState(mesAtualDestino && opcoes.includes(mesAtualDestino) ? mesAtualDestino : opcoes[0])
  const [salvando, setSalvando] = useState(false)
  async function confirmar() {
    setSalvando(true)
    const ok = await onConfirmar(destino)
    setSalvando(false)
    if (ok) onClose()
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div className="modal-title">Adiar conta</div>
        <div className="cad-sub" style={{ marginBottom: 12 }}><b>{titulo}</b> · {fmt(valor)} · hoje em {mesLabel(mesOrigem)}</div>
        <div className="form-group">
          <label>Passar para</label>
          <div className="aulas-conf-opcoes" role="radiogroup" aria-label="Mês de destino">
            {opcoes.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={destino === m} className={`aulas-conf-op ${destino === m ? 'ativo' : ''}`} onClick={() => setDestino(m)}>
                <b>{mesLabel(m)}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="cad-sub">O valor sai de {mesLabel(mesOrigem)} e entra em {mesLabel(destino)}: a sobra, o "Pode gastar", a projeção e o calendário mudam. Dá para voltar atrás a qualquer momento.</div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando} onClick={confirmar}>Adiar para {mesLabel(destino)}</button>
        </div>
      </div>
    </div>
  )
}
