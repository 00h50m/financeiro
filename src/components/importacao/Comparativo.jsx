import { fmt } from '../../lib/utils'
import { tituloCompra } from '../../lib/utils'
import { rotuloOrigem } from '../../lib/origem'

const dataBr = (d) => String(d || '').slice(0, 10).split('-').reverse().join('/')
const parcelaTxt = (atual, total) => (Number(total) > 1 ? `${Number(atual) || 1}/${total}` : 'à vista')

// Os dois registros lado a lado, com a diferença destacada: o que a fatura traz × o que já está lançado no app.
export default function Comparativo({ linha: l, valorLinha, mesFatura, parcelaEsperada }) {
  const corr = l.correspondencia
  const c = corr?.compra
  if (!c) return null
  const parcelada = Number(c.parcelas) > 1
  const valorApp = parcelada ? Number(c.valor_total) / Number(c.parcelas) : Number(c.valor_total)
  const ev = corr.evidencias
  const linhaParcela = parcelaTxt(l.parcela_atual, l.parcela_total)
  const appParcela = parcelada ? `${parcelaEsperada || '?'}/${c.parcelas}` : 'à vista'
  const difValor = Math.abs(Number(valorLinha) - valorApp) >= 0.02
  const difData = ev?.data?.ok === false
  const difNome = ev?.nome?.ok === false
  const difParcela = linhaParcela !== appParcela && (parcelada || Number(l.parcela_total) > 1)
  const linhas = [
    ['Data', dataBr(l.data), dataBr(c.data_compra), difData],
    ['Valor', fmt(valorLinha), fmt(valorApp), difValor],
    ['Nome', l.descricaoOriginal || l.descricao, tituloCompra(c), difNome],
    ['Parcela', linhaParcela, appParcela, difParcela],
  ]
  return (
    <div className="imp-comp" role="table" aria-label="Comparação entre a fatura e o aplicativo">
      <div className="imp-comp-cab" role="row"><span /><b role="columnheader">Na fatura</b><b role="columnheader">No aplicativo</b></div>
      {linhas.map(([rot, a, b, dif]) => (
        <div key={rot} className={`imp-comp-linha ${dif ? 'dif' : ''}`} role="row">
          <span className="imp-comp-rot" role="rowheader">{rot}</span>
          <span role="cell">{a}</span>
          <span role="cell">{b}{dif && <span className="imp-comp-dif" title="Diferente"> ≠</span>}</span>
        </div>
      ))}
      <div className="cad-sub" style={{ marginTop: 6 }}>
        Lançada {rotuloOrigem(c.origem) ? `por ${rotuloOrigem(c.origem).replace(/^\S+\s/, '').toLowerCase()}` : 'à mão'}
        {mesFatura && corr.avisos?.includes('parcela_diferente') ? ` · no app, ${dataBr(`${mesFatura}-01`).slice(3)} seria a parcela ${parcelaEsperada}/${c.parcelas}` : ''}.
      </div>
    </div>
  )
}
