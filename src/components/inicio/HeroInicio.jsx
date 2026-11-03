import { fmt, mesLabel } from '../../lib/utils'
import { GLOSSARIO } from '../../lib/glossario'

const Mini = ({ rotulo, valor, sub, ajuda, tom }) => (
  <div className="ini-ap" role="group" aria-label={rotulo}>
    <div className="ini-ap-rotulo"><span title={ajuda} className="indicador-ajuda">{rotulo}</span></div>
    <div className={`ini-ap-valor mono ${tom || ''}`}>{valor}</div>
    {sub && <div className="ini-ap-sub">{sub}</div>}
    <span className="so-leitor">{ajuda}</span>
  </div>
)

// Situação do mês: UM número grande ("Livre para gastar", que é estimativa), o que ele significa e três números de apoio.
// Sem renda cadastrada o número não é apresentado como fato: pede a renda.
export default function HeroInicio({ d, mes, semRenda, irPara }) {
  const negativo = d.podeGastar < 0
  const g = GLOSSARIO
  const rotulo = negativo ? g.faltandoParaFechar : g.livreParaGastar
  return (
    <section className={`ini-hero ${negativo && !semRenda ? 'neg' : ''}`} aria-label="Situação financeira do mês">
      <div className="ini-hero-rotulo"><span className="indicador-ajuda" title={rotulo.ajuda}>{semRenda ? g.livreParaGastar.rotulo : rotulo.rotulo}</span> <span className="ini-hero-mes">· {mesLabel(mes)}</span></div>
      <div className="ini-hero-valor mono">{semRenda ? '—' : `${negativo ? '−' : ''}${fmt(Math.abs(d.podeGastar))}`}</div>
      {semRenda ? (
        <div className="ini-hero-sub">Cadastre a renda do mês para calcular. <button type="button" className="btn btn-primary btn-sm" onClick={() => irPara('renda')}>Cadastrar renda</button></div>
      ) : negativo ? (
        <div className="ini-hero-sub">As contas do mês passam do que entrou.</div>
      ) : d.porDia != null ? (
        <div className="ini-hero-chip"><b className="mono">{fmt(d.porDia)}</b><span>por dia · {d.diasRestantes} {d.diasRestantes === 1 ? 'dia' : 'dias'} até o fim do mês</span></div>
      ) : <div className="ini-hero-sub">Depois de pagar tudo o que falta no mês.</div>}
      {!semRenda && <div className="ini-hero-nota">Estimativa: o que sobra se tudo o que está previsto acontecer. Não é o saldo da conta.</div>}
      {d.reparto.total > 0 && !semRenda && (
        <div className="ini-reparto">
          <div className="ini-reparto-barra" role="img" aria-label={d.reparto.partes.map((p) => `${p.rotulo} ${fmt(p.valor)}`).join(', ')}>
            {d.reparto.partes.filter((p) => p.pct > 0).map((p) => <div key={p.chave} className={`ini-seg ${p.chave}`} style={{ width: `${p.pct}%` }} />)}
          </div>
          <div className="ini-reparto-leg">
            {d.reparto.partes.filter((p) => p.valor > 0).map((p) => <span key={p.chave}><i className={p.chave} />{p.rotulo} <b className="mono">{fmt(p.valor)}</b></span>)}
          </div>
        </div>
      )}
      <div className="ini-apoios">
        <Mini rotulo={g.disponivelAgora.rotulo} ajuda={g.disponivelAgora.ajuda} valor={semRenda ? '—' : fmt(d.disponivel)} tom={!semRenda && d.disponivel < 0 ? 'erro' : ''} sub="no app hoje" />
        <Mini rotulo={g.aPagar.rotulo} ajuda={g.aPagar.ajuda} valor={fmt(d.aPagar)} tom={d.aPagar > 0.005 ? 'aviso' : 'ok'} sub={d.comprometido > 0 ? `${d.pctPago}% já pago` : 'nada no mês'} />
        <Mini rotulo={g.comprometido.rotulo} ajuda={g.comprometido.ajuda} valor={fmt(d.comprometido)} sub={d.pctComprometido != null ? `${d.pctComprometido}% da entrada de ${fmt(d.entrada)}` : 'sem entrada para comparar'} />
      </div>
    </section>
  )
}
