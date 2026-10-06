import { DICA_BUSCA } from '../lib/filtro'

// Campo de busca padrão das listas (nome, valor, faixa, data).
export function CampoBusca({ valor, onChange, placeholder = DICA_BUSCA, largura = 280 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <input type="search" placeholder={placeholder} value={valor} onChange={(e) => onChange(e.target.value)} style={{ width: largura, maxWidth: '100%' }} aria-label="Buscar nesta lista" title="Exemplos: mercado · 89,90 · >100 · 100..200 · 05/09" />
    </span>
  )
}

// "Mostrando 12 de 340 · R$ 1.234,00" + limpar filtros. Só aparece quando há filtro ativo.
export function ResumoFiltro({ mostrando, total, ativo, onLimpar, soma = null, fmt }) {
  if (!ativo) return null
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', fontSize: 12, color: 'var(--text2)', margin: '-6px 0 12px' }}>
      <span>Mostrando <b>{mostrando}</b> de {total}{soma != null && fmt ? <> · soma <b className="mono">{fmt(soma)}</b></> : null}</span>
      <button className="btn btn-ghost btn-sm" onClick={onLimpar}>Limpar filtros</button>
    </div>
  )
}
