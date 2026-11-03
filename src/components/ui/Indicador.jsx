// Cartão de indicador único (substitui .kpi, .metric, .ini-res e .rs-kpi nas telas refeitas).
// `ajuda`: definição curta do número (aparece ao passar o mouse e para leitor de tela) — cada indicador diz o que significa.
export default function Indicador({ rotulo, valor, sub, tom, ajuda }) {
  return (
    <div className="indicador" role="group" aria-label={rotulo}>
      <div className="indicador-rotulo">{ajuda ? <span className="indicador-ajuda" title={ajuda}>{rotulo}</span> : rotulo}</div>
      <div className={`indicador-valor ${tom || ''}`}>{valor}</div>
      {sub && <div className="indicador-sub">{sub}</div>}
      {ajuda && <span className="so-leitor">{ajuda}</span>}
    </div>
  )
}
