import Indicador from '../ui/Indicador'
import { fmt } from '../../lib/utils'

// Resumo compacto do topo: o que falta pagar, o que já foi, o que está atrasado e o que vence nos próximos 7 dias.
export default function ResumoPagamentos({ resumo }) {
  const { aPagar, pago, atrasadas, proximos7, pctPago } = resumo
  return (
    <section aria-label="Resumo dos pagamentos" className="pag-resumo">
      <div className="pag-resumo-grade">
        <Indicador rotulo="A pagar" valor={fmt(aPagar)} tom={aPagar > 0.005 ? 'aviso' : 'ok'} ajuda="Contas do mês que ainda não foram pagas (comprometido menos o que já foi pago)." />
        <Indicador rotulo="Pago" valor={fmt(pago)} sub={`${pctPago}% do mês`} ajuda="Contas já marcadas como pagas neste mês." />
        <Indicador rotulo="Atrasadas" valor={fmt(atrasadas.valor)} tom={atrasadas.qtd ? 'erro' : 'ok'} sub={atrasadas.qtd ? `${atrasadas.qtd} ${atrasadas.qtd === 1 ? 'conta' : 'contas'}` : 'nenhuma'} ajuda="Contas em aberto com vencimento que já passou." />
        <Indicador rotulo="Próximos 7 dias" valor={fmt(proximos7.valor)} sub={proximos7.qtd ? `${proximos7.qtd} ${proximos7.qtd === 1 ? 'conta' : 'contas'}` : 'nada a vencer'} ajuda="Contas em aberto que vencem de hoje até daqui a 7 dias." />
      </div>
      <div className="pag-barra" role="img" aria-label={`${pctPago}% do mês pago`}><div style={{ width: `${pctPago}%` }} /></div>
    </section>
  )
}
