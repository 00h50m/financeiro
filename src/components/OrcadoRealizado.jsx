import { useMemo, useState } from 'react'
import NavMes from './NavMes'
import Indicador from './ui/Indicador'
import Selo from './ui/Selo'
import EstadoVazio from './ui/EstadoVazio'
import { orcadoRealizado } from '../lib/orcadoRealizado'
import { fmt, mesLabel, nowYM } from '../lib/utils'

const SELO = { ok: ['ok', 'Dentro do teto'], atencao: ['aviso', 'Perto do teto'], estourou: ['erro', 'Estourou'], sem: ['neutro', 'Sem teto'] }

// Barra do teto: preenchimento = gasto; o traço marca o teto (100%). Passou do teto: a barra fica vermelha e termina no fim.
function Linha({ l }) {
  const pct = Math.min(100, l.pct ?? 0)
  const [tom, rotulo] = SELO[l.status] || SELO.sem
  return (
    <li className={`orc-lin ${l.status}`}>
      <div className="orc-lin-topo">
        <span className="orc-lin-nome">{l.categoria}</span>
        <span className="mono orc-lin-valores">{fmt(l.gasto)} <span className="cad-sub">de {fmt(l.teto)}</span></span>
      </div>
      <div className="orc-barra" role="img" aria-label={`${l.categoria}: gastou ${fmt(l.gasto)} de um teto de ${fmt(l.teto)} (${l.pct}%)`}><div style={{ width: `${pct}%` }} /></div>
      <div className="orc-lin-rodape"><Selo tom={tom}>{rotulo}</Selo><span className="cad-sub">{l.restante >= 0 ? `restam ${fmt(l.restante)}` : `passou ${fmt(Math.abs(l.restante))}`} · {l.pct}%</span></div>
    </li>
  )
}

// Orçado × realizado: o teto de cada categoria (definido em Orçamento) contra o que foi gasto no mês.
export default function OrcadoRealizado({ store, irPara }) {
  const [mes, setMes] = useState(nowYM())
  const { compras, cartoes, fixos, divisoes, categorias, orcamentos, orcamentosOk } = store
  const r = useMemo(() => orcadoRealizado({ compras, cartoes, fixos, divisoes, categorias, orcamentos: orcamentosOk ? orcamentos : [], mes }), [compras, cartoes, fixos, divisoes, categorias, orcamentos, orcamentosOk, mes])
  return (
    <div>
      <NavMes mes={mes} onChange={setMes} />
      {r.semNenhumTeto ? (
        <div className="card">
          <EstadoVazio titulo="Nenhum teto definido" texto={`Defina um teto por categoria em Orçamento para comparar com o que foi gasto em ${mesLabel(mes)}.`} acao="Abrir Orçamento" aoClicar={() => irPara('orcamento')} />
        </div>
      ) : (
        <>
          <section className="orc-resumo" aria-label="Resumo do orçamento">
            <Indicador rotulo="Orçado" valor={fmt(r.totalTeto)} sub={`${r.comTeto.length} ${r.comTeto.length === 1 ? 'categoria' : 'categorias'} com teto`} ajuda="Soma dos tetos definidos em Orçamento." />
            <Indicador rotulo="Realizado" valor={fmt(r.gastoComTeto)} tom={r.gastoComTeto > r.totalTeto ? 'erro' : undefined} sub={`${r.totalTeto > 0 ? Math.round((r.gastoComTeto / r.totalTeto) * 100) : 0}% do orçado`} ajuda="Gasto do mês nas categorias que têm teto." />
            <Indicador rotulo="Estouradas" valor={String(r.estouradas)} tom={r.estouradas ? 'erro' : 'ok'} sub={r.estouradas ? 'passaram do teto' : 'nenhuma'} ajuda="Categorias cujo gasto já passou do teto." />
            <Indicador rotulo="Sem teto" valor={fmt(r.gastoSemTeto)} sub={`${r.semTeto.length} ${r.semTeto.length === 1 ? 'categoria' : 'categorias'}`} ajuda="Gasto em categorias sem teto definido." />
          </section>
          <ul className="orc-lista" aria-label="Orçado e realizado por categoria">{r.comTeto.map((l) => <Linha key={l.categoria} l={l} />)}</ul>
          {r.semTeto.length > 0 && (
            <details className="card fat-secundaria"><summary>Gastos em categorias sem teto ({r.semTeto.length})</summary>
              <ul className="fat-hist-lista">{r.semTeto.map((l) => <li key={l.categoria}><span>{l.categoria}</span><span className="mono">{fmt(l.gasto)}</span></li>)}</ul>
            </details>
          )}
          <button type="button" className="ini-link" onClick={() => irPara('orcamento')}>Editar tetos em Orçamento →</button>
        </>
      )}
    </div>
  )
}
