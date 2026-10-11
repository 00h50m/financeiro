// Seção recolhível das telas de lista: cabeçalho com título, resumo e total; o conteúdo só aparece aberto.
export default function Secao({ titulo, info, infoSempre = false, destaque, aberto, onToggle, children }) {
  return (
    <section className="card grupo-mes">
      <button className="grupo-cab" onClick={onToggle} aria-expanded={aberto}>
        <span className="grupo-seta" aria-hidden="true">▾</span>
        <span className="grupo-nome">{titulo}</span>
        {info && <span className={`grupo-info ${infoSempre ? '' : 'grupo-info-sec'}`}>{info}</span>}
        {destaque != null && <span className="grupo-total mono">{destaque}</span>}
      </button>
      {aberto && children}
    </section>
  )
}
