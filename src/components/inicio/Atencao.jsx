import { useState } from 'react'
import Selo from '../ui/Selo'

const TOM = { erro: ['erro', 'Urgente'], aviso: ['aviso', 'Conferir'], info: ['info', 'Em breve'] }
const MAX = 4

// "Precisa da sua atenção": o que pede ação, do mais urgente ao menos, com um botão em cada item.
export default function Atencao({ itens, irPara }) {
  const [todos, setTodos] = useState(false)
  const visiveis = todos ? itens : itens.slice(0, MAX)
  return (
    <section className="ini-card ini-atencao2" aria-label="Precisa da sua atenção">
      <div className="ini-card-topo"><h2>Precisa da sua atenção</h2>{itens.length > 0 && <span className="ini-card-dica">{itens.length}</span>}</div>
      {itens.length === 0 ? (
        <div className="ini-vazio">Tudo em dia. Nada pedindo a sua atenção agora. ✓</div>
      ) : (
        <ul className="ini-aten-lista">
          {visiveis.map((i) => {
            const [tom, rotulo] = TOM[i.tom]
            return (
              <li key={i.chave} className={`ini-aten-item ${i.tom}`}>
                <div className="ini-aten-texto">
                  <div className="ini-aten-titulo">{i.titulo}</div>
                  <div className="ini-aten-detalhe"><Selo tom={tom}>{rotulo}</Selo> {i.detalhe}</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm ini-aten-acao" onClick={() => irPara(i.acao.tela)}>{i.acao.rotulo}</button>
              </li>
            )
          })}
        </ul>
      )}
      {itens.length > MAX && <button type="button" className="ini-link" onClick={() => setTodos((v) => !v)}>{todos ? 'Mostrar menos' : `Ver todas (${itens.length})`}</button>}
    </section>
  )
}
