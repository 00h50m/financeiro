import { fmt, mesLabel } from '../../lib/utils'
import { previaParcelamento } from '../../lib/planoImportacao'

const dataBr = (d) => String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/')
const SITUACAO = { passada: 'meses passados', esta: 'esta fatura', futura: 'próximas faturas' }

// Parcela em andamento sem parcelamento no app: explica o que cada opção cria, parcela por parcela, antes de qualquer gravação.
export default function ParcelamentoPrevia({ l, mesFatura, modoValor, cartoes, fechamentos, inconsistente, escolher, decidir }) {
  const completo = previaParcelamento({ ...l, parcelamentoOpcao: 'completo' }, mesFatura, modoValor, { cartoes, fechamentos })
  const avulsas = l.avulsasParecidas || []
  const preferirSoEsta = avulsas.length > 0 || inconsistente || !completo.bate
  return (
    <div className="imp-parcelamento">
      <p style={{ margin: 0 }}><b>Esta é a parcela {completo.parcelaAtual} de {completo.total}</b> ({fmt(completo.valorParcela)} cada) e não encontrei esse parcelamento no app. Escolha como registrar:</p>

      {avulsas.length > 0 && (
        <div className="alert alert-amber" style={{ margin: 0 }}>
          <b>Já existem lançamentos parecidos de meses anteriores</b> neste cartão: {avulsas.slice(0, 4).map((c) => `${dataBr(c.data)} ${c.nome} ${fmt(c.valor)}`).join(' · ')}{avulsas.length > 4 ? ` e mais ${avulsas.length - 4}` : ''}.
          Podem ser parcelas anteriores já lançadas à parte: criar o parcelamento completo repetiria esses meses.
        </div>
      )}
      {(inconsistente || !completo.bate) && <div className="alert alert-amber" style={{ margin: 0 }}>Pelo calendário do cartão, a parcela {completo.parcelaAtual} não cairia em {mesLabel(mesFatura)} se o parcelamento fosse criado por completo. Registre só esta parcela, ou corrija o mês da fatura na etapa 1.</div>}

      <div className="imp-opcoes">
        <div className={`imp-opcao ${preferirSoEsta ? '' : 'recomendada'}`}>
          <b>Criar o parcelamento completo</b>{!preferirSoEsta && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>recomendado</span>}
          <p className="cad-sub">{completo.total} parcelas de {mesLabel(completo.primeiraParcela)} a {mesLabel(completo.ultimaParcela)}: {completo.anteriores} {completo.anteriores === 1 ? 'anterior' : 'anteriores'} nos meses passados, esta e as {completo.restantes - 1} seguintes. Total {fmt(completo.valorTotal)}.</p>
          <p className="cad-sub">A data da compra original não consta na fatura: usamos o dia 1 do mês da primeira parcela (<b>data estimada</b>). Os meses passados passam a incluir esta parcela, o que muda o total deles.</p>
          {completo.mesesFechados.length > 0 && <p className="imp-erro">Atenção: {completo.mesesFechados.map(mesLabel).join(', ')} {completo.mesesFechados.length === 1 ? 'está fechado e seria alterado' : 'estão fechados e seriam alterados'}; o app vai pedir o motivo ao confirmar.</p>}
          <details className="imp-cronograma">
            <summary>Ver as {completo.total} parcelas</summary>
            <table className="tabela-compacta"><tbody>
              {completo.cronograma.map((p) => <tr key={p.mes} className={p.situacao === 'esta' ? 'esta' : ''}><td>{p.num}/{completo.total}</td><td>{mesLabel(p.mes)}</td><td className="mono" style={{ textAlign: 'right' }}>{fmt(p.valor)}</td><td className="cad-sub">{SITUACAO[p.situacao]}{p.fechado ? ' · mês fechado' : ''}</td></tr>)}
            </tbody></table>
          </details>
          <button type="button" className={`btn btn-sm ${preferirSoEsta ? 'btn-ghost' : 'btn-primary'}`} disabled={inconsistente || !completo.bate} onClick={() => escolher(l._id, 'completo')}>Criar parcelamento completo</button>
        </div>
        <div className={`imp-opcao ${preferirSoEsta ? 'recomendada' : ''}`}>
          <b>Registrar só esta parcela</b>{preferirSoEsta && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>recomendado</span>}
          <p className="cad-sub">Cria 1 compra de {fmt(completo.valorParcela)} na fatura de {mesLabel(mesFatura)}, sem mexer nos meses passados nem inventar datas. As próximas parcelas você registra nas próximas faturas.</p>
          <button type="button" className={`btn btn-sm ${preferirSoEsta ? 'btn-primary' : 'btn-ghost'}`} onClick={() => escolher(l._id, 'so_esta')}>Registrar só esta parcela</button>
        </div>
      </div>
      <div className="imp-acoes"><button type="button" className="btn btn-sm btn-ghost" onClick={() => decidir(l._id, 'depois')}>Revisar depois</button></div>
    </div>
  )
}
