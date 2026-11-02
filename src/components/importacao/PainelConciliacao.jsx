import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { detalheDiferenca } from '../../lib/conciliacaoFatura'

const STATUS = {
  conciliada: ['badge-green', 'Fatura conciliada'],
  parcial: ['badge-amber', 'Conciliação parcial'],
  pendente: ['badge-gray', 'Conciliação pendente'],
}

// Painel compacto e sempre atualizado: o que o banco cobra, o que o arquivo traz, o que o app já tem e como ficaria depois de importar.
// Valores estimados (ainda não gravados) aparecem com "~".
export default function PainelConciliacao({ analise, mostrarStatusAtual = false, modo = 'parcela', aoResolver = null }) {
  const [listar, setListar] = useState(false)
  // no celular começa resumido (projetado e diferença): o painel fica sempre visível sem ocupar a tela
  const [detalhes, setDetalhes] = useState(() => typeof window === 'undefined' || !window.matchMedia || !window.matchMedia('(max-width: 640px)').matches)
  if (!analise) return null
  const p = analise.painel
  const c = analise.contadores
  const [cor, rotulo] = STATUS[analise.statusProjetado]
  const dif = p.diferenca
  const difOk = Math.abs(dif) <= 0.1
  return (
    <section className="imp-painel" aria-label="Conciliação da fatura">
      <div className={`imp-painel-grade ${detalhes ? '' : 'resumido'}`}>
        <div className="imp-detalhe" title="Total impresso na fatura (PDF) ou informado por você"><span>Banco</span><b className="mono">{p.totalBanco != null ? fmt(p.totalBanco) : '—'}</b></div>
        <div className="imp-detalhe" title="Soma das linhas do arquivo (compras − créditos + encargos; sem pagamentos)"><span>Arquivo</span><b className="mono">{fmt(p.totalExtraido)}</b></div>
        <div className="imp-detalhe" title="O que já está lançado no app para este cartão e mês"><span>No app</span><b className="mono">{fmt(p.totalApp)}</b></div>
        <div className="imp-detalhe" title="Novas compras selecionadas, atualizações de valor e compras movidas para esta fatura: ainda não gravado"><span>+ A gravar</span><b className="mono imp-estimado">~{fmt(p.valores.estimado)}</b></div>
        <div title="Como o app ficaria depois de gravar"><span>Projetado</span><b className="mono imp-estimado">~{fmt(p.projetado)}</b></div>
        <div title={`Projetado menos ${p.baseDiferenca === 'banco' ? 'o total do banco' : 'a soma do arquivo (não há total do banco)'}`}><span>Diferença</span><b className="mono" style={{ color: difOk ? 'var(--green)' : 'var(--amber)' }}>{difOk ? 'R$ 0,00' : `${dif > 0 ? '+' : '−'}${fmt(Math.abs(dif))}`}</b></div>
      </div>
      <div className="imp-painel-rodape">
        <span className={`badge ${cor}`}>{rotulo}</span>
        <button type="button" className="link-btn imp-alternar" onClick={() => setDetalhes((d) => !d)} aria-expanded={detalhes}>{detalhes ? 'menos detalhes' : 'ver detalhes'}</button>
        {c.pendencias === 0 ? <span className="cad-sub">nenhuma pendência</span> : <button type="button" className="link-btn imp-pendencias-btn" onClick={() => setListar((x) => !x)} aria-expanded={listar}>{c.pendencias} pendência{c.pendencias === 1 ? '' : 's'} {listar ? '▴' : '▾'}</button>}
        {p.semTotalBanco && <span className="cad-sub"> · sem o total do banco: comparando com o arquivo</span>}
        {mostrarStatusAtual && analise.statusAtual !== analise.statusProjetado && <span className="cad-sub">· hoje: {STATUS[analise.statusAtual][1].toLowerCase()}</span>}
      </div>
      {listar && c.pendencias > 0 && <ListaPendencias det={detalheDiferenca(analise, modo)} aoResolver={aoResolver} />}
    </section>
  )
}

// O que ainda está pendente, em qualquer etapa: cada item com valor e motivo.
function ListaPendencias({ det, aoResolver }) {
  const grupos = [['revisao', 'Para revisar', det.revisao, det.totais.revisao], ['deixadas', 'Novas deixadas de fora', det.deixadas, det.totais.deixadas], ['app', 'Só no app (fora do arquivo)', det.soNoApp, det.totais.soNoApp]].filter((g) => g[2].length)
  return (
    <div className="imp-pendencias" role="region" aria-label="Pendências">
      {grupos.map(([k, rot, itens, total]) => (
        <div key={k} className="imp-pend-grupo">
          <div className="imp-pend-titulo"><b>{rot} ({itens.length})</b> <span className="mono">{fmt(total)}</span>{aoResolver && <button type="button" className="link-btn" onClick={() => aoResolver(k === 'deixadas' ? 'novas' : k)}>abrir</button>}</div>
          <ul className="imp-lista">{itens.map((i) => <li key={i.id}>{i.data && <span className="cad-sub">{String(i.data).slice(8, 10)}/{String(i.data).slice(5, 7)} · </span>}{i.nome} <span className="cad-sub">· {i.motivo}</span> <span className="mono">{fmt(i.valor)}</span></li>)}</ul>
        </div>
      ))}
    </div>
  )
}
