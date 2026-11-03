import Selo from '../ui/Selo'
import { fmt } from '../../lib/utils'

const SELO_SITUACAO = { atrasada: ['erro', 'Atrasada'], a_vencer: ['info', 'A vencer'], sem_data: ['neutro', 'Sem vencimento'], paga: ['ok', 'Paga'] }

// O selo já diz "Sem vencimento"/"Paga": o texto só acrescenta o que o selo não diz (quando vence, ou em que dia foi paga).
const quandoTexto = (item) => (item.situacao === 'paga' ? (item.dataPagamento ? `paga em ${String(item.dataPagamento).slice(8, 10)}/${String(item.dataPagamento).slice(5, 7)}` : '') : item.situacao === 'sem_data' ? '' : item.texto)

// Uma conta da lista: nome, vencimento, valor, status e UMA ação principal. O resto fica em "detalhes".
export default function LinhaPagamento({ item, selecionada, aoSelecionar, selecionavel, aberta, aoAlternar, aoPagar, ocupada, detalhes }) {
  const [tom, rotulo] = SELO_SITUACAO[item.situacao]
  return (
    <li className={`pag-lin ${item.situacao}`}>
      <div className="pag-lin-main">
        {selecionavel ? (
          <input type="checkbox" className="pag-lin-check" checked={!!selecionada} onChange={() => aoSelecionar(item)} aria-label={`Selecionar ${item.nome}`} />
        ) : <span className="pag-lin-check-vazio" aria-hidden="true" />}
        <button type="button" className="pag-lin-corpo" onClick={() => aoAlternar(item)} aria-expanded={!!aberta}>
          <span className="pag-lin-nome">{item.nome}</span>
          <span className="pag-lin-sub">
            <Selo tom={tom}>{rotulo}</Selo>
            <span className="pag-lin-texto">{[quandoTexto(item), item.origem].filter(Boolean).join(' · ')}</span>
            {item.estimado && !item.pago && <Selo tom="aviso" titulo="Valor ainda não confirmado">Estimado</Selo>}
            {item.confirmado && !item.pago && <Selo tom="ok" titulo="Valor confirmado">Valor confirmado</Selo>}
          </span>
        </button>
        <div className="pag-lin-dir">
          <span className="pag-lin-valor mono">{fmt(item.valor)}</span>
          <button type="button" className={`btn btn-sm ${item.pago ? 'btn-ghost' : 'btn-primary'} pag-lin-acao`} disabled={ocupada} onClick={() => aoPagar(item)} aria-label={`${item.pago ? 'Desfazer pagamento de' : 'Pagar'} ${item.nome}`}>
            {item.pago ? 'Desfazer' : 'Pagar'}
          </button>
        </div>
      </div>
      {aberta && <div className="pag-lin-detalhes">{detalhes}</div>}
    </li>
  )
}
