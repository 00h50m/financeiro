import { useState } from 'react'
import { fmt, mesLabel, addMonths } from '../lib/utils'
import { acrescimoAdiamento } from '../lib/financeiro'
import { gravarPrefAdiar, lerPrefAdiar, paraAcrescimo } from '../lib/adiamentoPref'
import CamposAcrescimo from './CamposAcrescimo'

// Escolhe para qual mês adiar uma conta sem cartão (boleto, Pix, conta fixa) e quanto isso custa de multa e juros.
export default function ModalAdiar({ titulo, valor, mesOrigem, mesAtualDestino, onConfirmar, onClose }) {
  const opcoes = Array.from({ length: 6 }, (_, i) => addMonths(mesOrigem, i + 1))
  const pref = lerPrefAdiar()
  const [destino, setDestino] = useState(mesAtualDestino && opcoes.includes(mesAtualDestino) ? mesAtualDestino : opcoes[0])
  const [multa, setMulta] = useState(pref.multa)
  const [juros, setJuros] = useState(pref.juros)
  const [semAcrescimo, setSemAcrescimo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const acrescimo = semAcrescimo ? 0 : acrescimoAdiamento(valor, mesOrigem, destino, paraAcrescimo(multa), paraAcrescimo(juros))
  async function confirmar() {
    setSalvando(true)
    gravarPrefAdiar(multa, juros)
    const ok = await onConfirmar(destino, acrescimo)
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
          <div className="aulas-conf-opcoes adiar-meses" role="radiogroup" aria-label="Mês de destino">
            {opcoes.map((m) => (
              <button key={m} type="button" role="radio" aria-checked={destino === m} className={`aulas-conf-op ${destino === m ? 'ativo' : ''}`} onClick={() => setDestino(m)}>
                <b>{mesLabel(m)}</b>
              </button>
            ))}
          </div>
        </div>
        <CamposAcrescimo multa={multa} juros={juros} onMulta={setMulta} onJuros={setJuros} desabilitado={semAcrescimo} />
        <label className="check-linha"><input type="checkbox" checked={semAcrescimo} onChange={(e) => setSemAcrescimo(e.target.checked)} /> Sem multa nem juros (combinei com quem cobra)</label>
        <div className="cad-sub">
          {acrescimo > 0
            ? <>Custo de adiar: <b>+{fmt(acrescimo)}</b>. Em {mesLabel(destino)} a conta passa a valer <b>{fmt(Number(valor) + acrescimo)}</b>. Confira no boleto os valores reais.</>
            : <>Sem acréscimo: a conta passa a valer {fmt(valor)} em {mesLabel(destino)}.</>}
        </div>
        <div className="cad-sub" style={{ marginTop: 6 }}>A sobra, o "Pode gastar", a projeção e o calendário mudam. Dá para voltar atrás a qualquer momento.</div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando} onClick={confirmar}>Adiar para {mesLabel(destino)}</button>
        </div>
      </div>
    </div>
  )
}
