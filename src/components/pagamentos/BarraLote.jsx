import { fmt } from '../../lib/utils'

// Barra que aparece quando há contas selecionadas: pagar várias de uma vez (só as seguras) ou limpar a seleção.
export default function BarraLote({ qtd, total, aoMarcar, aoLimpar, ocupada }) {
  if (!qtd) return null
  return (
    <div className="pag-lote" role="region" aria-label="Ações em lote">
      <span><b>{qtd}</b> {qtd === 1 ? 'selecionada' : 'selecionadas'} · {fmt(total)}</span>
      <span className="pag-lote-acoes">
        <button type="button" className="btn btn-ghost btn-sm" onClick={aoLimpar}>Limpar</button>
        <button type="button" className="btn btn-primary btn-sm" disabled={ocupada} onClick={aoMarcar}>Marcar como pagas</button>
      </span>
    </div>
  )
}
