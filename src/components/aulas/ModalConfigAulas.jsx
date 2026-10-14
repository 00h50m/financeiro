import { CHAVE_RENDA_AULAS } from '../../lib/aulasFechamento'
import { mesLabel, addMonths, nowYM } from '../../lib/utils'

// Configurações das aulas particulares. Hoje: em qual mês o dinheiro das aulas entra na renda da casa.
export default function ModalConfigAulas({ modo, definirConfig, onClose }) {
  const mes = nowYM()
  const opcoes = [
    ['mesmo', 'No mês em que dou a aula', `As aulas de ${mesLabel(mes)} entram na renda de ${mesLabel(mes)}.`],
    ['proximo', 'No mês seguinte', `As aulas de ${mesLabel(mes)} entram na renda de ${mesLabel(addMonths(mes, 1))} (quando os responsáveis pagam depois).`],
  ]
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">Configurações das aulas</div>
        <div className="form-group">
          <label>Em que mês o valor das aulas entra na renda?</label>
          <div className="aulas-conf-opcoes" role="radiogroup" aria-label="Mês da renda das aulas">
            {opcoes.map(([v, titulo, sub]) => (
              <button key={v} type="button" role="radio" aria-checked={modo === v} className={`aulas-conf-op ${modo === v ? 'ativo' : ''}`} onClick={() => definirConfig(CHAVE_RENDA_AULAS, v)}>
                <b>{titulo}</b>
                <span>{sub}</span>
              </button>
            ))}
          </div>
          <div className="cad-sub" style={{ marginTop: 8 }}>
            Isso muda só a Renda, o "Disponível" e os resumos. A tela de Aulas, o fechamento de cada aluno e o relatório continuam organizados pelo mês em que a aula aconteceu.
          </div>
        </div>
        <div className="modal-footer"><button className="btn btn-primary" onClick={onClose}>Pronto</button></div>
      </div>
    </div>
  )
}
