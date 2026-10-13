import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { centavosParaReais, patchRealizar, textoDuracao, valorAula } from '../../lib/aulas'
import SeletorDuracao from './SeletorDuracao'

const dataBr = (d) => d.split('-').reverse().join('/')

// Marca várias aulas previstas como realizadas de uma vez. A duração de cada uma aparece e pode ser ajustada antes de confirmar.
export default function ModalLote({ store, aulas, alunoPorId, onClose }) {
  const [dur, setDur] = useState(() => Object.fromEntries(aulas.map((a) => [a.id, a.duracao_min])))
  const [salvando, setSalvando] = useState(false)
  const total = aulas.reduce((t, a) => t + valorAula(a.valor_hora_centavos, dur[a.id]), 0)
  const minutos = aulas.reduce((t, a) => t + Number(dur[a.id]), 0)
  async function confirmar() {
    setSalvando(true)
    const agora = new Date().toISOString()
    const ok = await store.atualizarAulasLote(aulas.map((a) => ({ id: a.id, patch: patchRealizar(a, dur[a.id], agora) })))
    setSalvando(false)
    if (ok) onClose(true)
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose(false) }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">Marcar {aulas.length} {aulas.length === 1 ? 'aula' : 'aulas'} como realizadas</div>
        <div className="cad-sub" style={{ marginBottom: 8 }}>Confira a duração de cada uma. É a duração efetiva que será cobrada.</div>
        <div className="fech-itens">
          {aulas.map((a) => (
            <div key={a.id} className="fech-item">
              <span>{dataBr(a.data).slice(0, 5)}{a.horario ? ` · ${a.horario}` : ''} · {alunoPorId.get(a.aluno_id)?.nome}</span>
              <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <SeletorDuracao valor={dur[a.id]} onChange={(m) => setDur((d) => ({ ...d, [a.id]: m }))} className="aula-dur" />
                <b className="mono">{fmt(centavosParaReais(valorAula(a.valor_hora_centavos, dur[a.id])))}</b>
              </span>
            </div>
          ))}
          <div className="fech-item total"><span>Total · {textoDuracao(minutos)}</span><b className="mono">{fmt(centavosParaReais(total))}</b></div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={() => onClose(false)}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando} onClick={confirmar}>Confirmar realizadas</button>
        </div>
      </div>
    </div>
  )
}
