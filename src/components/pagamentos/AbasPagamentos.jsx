import { ABAS_PAGAMENTO } from '../../lib/pagamentosLista'

// Abas A pagar / Atrasadas / Pagas / Todas, com a contagem de cada uma.
export default function AbasPagamentos({ valor, onChange, contagem }) {
  return (
    <div className="pag-abas" role="tablist" aria-label="Situação das contas">
      {ABAS_PAGAMENTO.map(([k, rotulo]) => (
        <button key={k} type="button" role="tab" aria-selected={valor === k} className={`pag-aba ${valor === k ? 'ativa' : ''} ${k === 'atrasadas' && contagem[k] > 0 ? 'alerta' : ''}`} onClick={() => onChange(k)}>
          {rotulo} <span className="pag-aba-n">{contagem[k]}</span>
        </button>
      ))}
    </div>
  )
}
