const ETAPAS = ['Selecionar', 'Analisar', 'Revisar', 'Confirmar']

// Indicador discreto das 4 etapas. Dá para voltar a uma etapa já visitada sem perder nada.
export default function Progresso({ etapa, maxEtapa, onIr, bloqueado = false }) {
  return (
    <ol className="imp-progresso" aria-label="Etapas da importação">
      {ETAPAS.map((nome, i) => {
        const n = i + 1
        const feita = etapa > n
        const atual = etapa === n
        const alcancavel = !bloqueado && n <= maxEtapa && etapa <= 4 && n !== etapa
        return (
          <li key={nome} className={`${atual ? 'atual' : ''} ${feita ? 'feita' : ''}`} aria-current={atual ? 'step' : undefined}>
            <button type="button" disabled={!alcancavel} onClick={() => onIr(n)} aria-label={`Etapa ${n}: ${nome}${feita ? ' (concluída)' : ''}`}>
              <span className="imp-passo">{feita ? '✓' : n}</span>
              <span className="imp-passo-nome">{nome}</span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
