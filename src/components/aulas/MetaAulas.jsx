import { fmt, mesLabel } from '../../lib/utils'
import { centavosParaReais, reaisParaCentavos, textoDuracao } from '../../lib/aulas'
import { CHAVE_META_AULAS } from '../../lib/aulasMeta'

const reais = (c) => fmt(centavosParaReais(c))

// Meta de renda do mês com as aulas: barra (apurado e previsto) e quanto falta em aulas/horas.
export default function MetaAulas({ mes, sit, definirConfig }) {
  function definir() {
    const atual = sit.meta ? String(centavosParaReais(sit.meta)).replace('.', ',') : ''
    const t = window.prompt('Quanto você quer fazer por mês com aulas particulares? (R$; deixe vazio para tirar a meta)', atual)
    if (t == null) return
    if (t.trim() === '') { definirConfig(CHAVE_META_AULAS, ''); return }
    const c = reaisParaCentavos(t)
    if (!c || c <= 0) { window.alert('Não entendi esse valor. Exemplo: 4000 ou 4.000,00'); return }
    definirConfig(CHAVE_META_AULAS, String(c / 100))
  }
  if (!sit.meta) {
    return (
      <div className="card aulas-meta"><div className="aulas-meta-topo"><div><b>Meta do mês</b><div className="cad-sub">Defina quanto quer fazer com aulas e acompanhe quanto falta.</div></div><button className="btn btn-ghost btn-sm" onClick={definir}>Definir meta</button></div></div>
    )
  }
  return (
    <div className="card aulas-meta">
      <div className="aulas-meta-topo">
        <div><b>Meta de {mesLabel(mes)}</b>: {reais(sit.meta)}</div>
        <button className="link-btn" onClick={definir}>Editar</button>
      </div>
      <div className="aulas-meta-barra" role="progressbar" aria-valuenow={sit.pctPrevisto} aria-valuemin={0} aria-valuemax={100} aria-label="Previsto em relação à meta">
        <span className="prev" style={{ width: `${sit.pctPrevisto}%` }} />
        <span className="apur" style={{ width: `${sit.pctApurado}%` }} />
      </div>
      <div className="cad-sub">
        Apurado {reais(sit.apurado)} · previsto {reais(sit.previsto)} ({sit.pctPrevisto}%).{' '}
        {sit.atingida
          ? 'Meta atingida pela previsão. 🎉'
          : sit.mediaHora > 0
            ? `Faltam ${reais(sit.falta)}: cerca de ${sit.aulasFalta} ${sit.aulasFalta === 1 ? 'aula' : 'aulas'} de ${textoDuracao(sit.duracaoMedia)} (${textoDuracao(sit.minutosFalta)}) a ${reais(sit.mediaHora)}/h.`
            : `Faltam ${reais(sit.falta)}.`}
      </div>
    </div>
  )
}
