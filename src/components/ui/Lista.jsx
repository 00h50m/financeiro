// Lista de cartões padrão (substitui tabelas e linhas soltas nas telas refeitas).
// <Lista rotulo="…"><ItemLista titulo selos valor meta acoes>detalhes</ItemLista></Lista>
export function Lista({ rotulo, children }) {
  return <ul className="fx-lista" aria-label={rotulo}>{children}</ul>
}

// `selos`: elementos <Selo/> ao lado do título · `valor`: texto à direita · `meta`: linha de apoio · `acoes`: botões
export function ItemLista({ titulo, selos, valor, tomValor, meta, acoes, children, destaque, ordem }) {
  return (
    <li className={`fx-item${destaque ? ' rd-atual' : ''}`}>
      <div className="fx-topo">
        <div className="fx-nome">
          {ordem != null && <span className="il-ordem" aria-hidden="true">{ordem}</span>}
          <span className="fx-titulo">{titulo}</span>
          {selos}
        </div>
        {valor != null && <div className={`fx-valor mono${tomValor ? ` il-${tomValor}` : ''}`}>{valor}</div>}
      </div>
      {meta && <div className="fx-meta">{meta}</div>}
      {children}
      {acoes && <div className="fx-acoes">{acoes}</div>}
    </li>
  )
}
