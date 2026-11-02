import { useState } from 'react'
import { fmt } from '../../lib/utils'

const STATUS = {
  conciliada: ['badge-green', 'Fatura conciliada'],
  parcial: ['badge-amber', 'Conciliação parcial'],
  pendente: ['badge-gray', 'Conciliação pendente'],
}

// Painel compacto e sempre atualizado: o que o banco cobra, o que o arquivo traz, o que o app já tem e como ficaria depois de importar.
// Valores estimados (ainda não gravados) aparecem com "~".
export default function PainelConciliacao({ analise, mostrarStatusAtual = false }) {
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
        <span className="cad-sub">{c.pendencias === 0 ? 'nenhuma pendência' : `${c.pendencias} pendência${c.pendencias === 1 ? '' : 's'}`}{p.semTotalBanco ? ' · sem o total do banco: comparando com o arquivo' : ''}</span>
        {mostrarStatusAtual && analise.statusAtual !== analise.statusProjetado && <span className="cad-sub">· hoje: {STATUS[analise.statusAtual][1].toLowerCase()}</span>}
      </div>
    </section>
  )
}
