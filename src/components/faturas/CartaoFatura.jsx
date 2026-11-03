import Selo from '../ui/Selo'
import { fmt } from '../../lib/utils'

const SELO_VALOR = { estimada: ['aviso', 'Valor estimado', 'Soma do que está lançado no cartão; o valor do banco ainda não foi informado'], real: ['info', 'Valor real informado', 'Valor da fatura informado do banco'] }
const SELO_DIF = (l) => ({
  sem_real: null,
  ok: ['ok', 'Sem diferença'],
  faltam: ['erro', `Faltam identificar ${fmt(l.diferenca)}`],
  excede: ['aviso', `Excede em ${fmt(Math.abs(l.diferenca))}`],
}[l.estados.diferenca])
const SELO_CONC = { sem_importacao: ['neutro', 'Sem importação'], importada: ['info', 'Importada · conciliação pendente'], parcial: ['aviso', 'Conciliação parcial'], conciliada: ['ok', 'Fatura conciliada'] }
const SELO_PAG = { a_pagar: ['neutro', 'A pagar'], vencida: ['erro', 'Vencida'], paga: ['ok', 'Paga'] }

// Um cartão no mês: quatro estados independentes (valor, diferença, conciliação, pagamento), números e as ações do dia a dia.
export default function CartaoFatura({ l, qtdCompras, aberta, aoAlternarCompras, aoInformarValor, aoImportar, aoPagar, aoEditar, ocupada, listaCompras }) {
  const e = l.estados
  const [tv, rv, hv] = SELO_VALOR[e.valor]
  const dif = SELO_DIF(l)
  const [tc, rc] = SELO_CONC[e.conciliacao]
  const [tp, rp] = SELO_PAG[e.pagamento]
  return (
    <article className="fat-card" aria-label={`Fatura ${l.cartao.nome}`}>
      <header className="fat-card-topo">
        <div>
          <h3 className="fat-card-nome">{l.cartao.nome}</h3>
          <div className="fat-card-venc">{l.vencimento.texto}</div>
        </div>
        <Selo tom={tp}>{rp}</Selo>
      </header>
      <div className="fat-selos">
        <Selo tom={tv} titulo={hv}>{rv}</Selo>
        {dif && <Selo tom={dif[0]}>{dif[1]}</Selo>}
        <Selo tom={tc}>{rc}</Selo>
      </div>
      <dl className="fat-nums">
        <div><dt>Lançado no app</dt><dd className="mono">{fmt(l.lancado)}</dd></div>
        <div><dt>Valor do banco</dt><dd className="mono">{l.real != null ? fmt(l.real) : '—'}</dd></div>
        <div><dt>Diferença</dt><dd className={`mono ${l.diferenca != null && Math.abs(l.diferenca) >= 1 ? (l.diferenca > 0 ? 'neg' : 'aviso') : ''}`}>{l.diferenca != null ? (Math.abs(l.diferenca) < 0.02 ? '—' : (l.diferenca > 0 ? '+' : '') + fmt(l.diferenca)) : '—'}</dd></div>
      </dl>
      <div className="fat-acoes">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => aoAlternarCompras(l)} aria-expanded={!!aberta}>{aberta ? '▾' : '▸'} Ver compras ({qtdCompras})</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => aoImportar(l)}>{e.conciliacao === 'sem_importacao' ? 'Importar fatura' : e.conciliacao === 'conciliada' ? 'Rever conciliação' : 'Conciliar'}</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => aoInformarValor(l)}>{l.real != null ? 'Corrigir valor real' : 'Informar valor real'}</button>
        <button type="button" className={`btn btn-sm ${e.pagamento === 'paga' ? 'btn-ghost' : 'btn-primary'}`} disabled={ocupada} onClick={() => aoPagar(l)}>{e.pagamento === 'paga' ? 'Desfazer pagamento' : 'Registrar pagamento'}</button>
        {l.fatura && l.real != null && <button type="button" className="link-btn" onClick={() => aoEditar(l)}>Editar fatura</button>}
      </div>
      {aberta && <div className="fat-compras">{listaCompras}</div>}
    </article>
  )
}
