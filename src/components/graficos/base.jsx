import { useEffect, useRef, useState } from 'react'
import { fmt } from '../../lib/utils'

// Cores das séries (ordem fixa, nunca reciclada). Validadas na superfície escura do app (ver .graficos no index.css).
export const SERIE = ['var(--serie-1)', 'var(--serie-2)', 'var(--serie-3)', 'var(--serie-4)', 'var(--serie-5)', 'var(--serie-6)']

export function useLargura(padrao = 640) {
  const ref = useRef(null)
  const [w, setW] = useState(padrao)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const medir = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    medir()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w]
}

// Eixo: 4-5 marcas redondas de 0 até o máximo.
export function escalaY(max, alvo = 4) {
  if (!(max > 0)) return { max: 1, marcas: [0, 1] }
  const bruto = max / alvo
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto)
  const topo = Math.ceil(max / passo) * passo
  const marcas = []
  for (let v = 0; v <= topo + 1e-9; v += passo) marcas.push(Math.round(v * 100) / 100)
  return { max: topo, marcas }
}
// Escala com valores negativos: de um múltiplo redondo abaixo do mínimo até um acima do máximo.
export function escalaFaixa(min, max, alvo = 4) {
  if (!(min < 0)) { const e = escalaY(max, alvo); return { min: 0, max: e.max, marcas: e.marcas } }
  const amplitude = Math.max(1, max - min)
  const bruto = amplitude / alvo
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const passo = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto)
  const lo = Math.floor(min / passo) * passo
  const hi = Math.max(passo, Math.ceil(Math.max(0, max) / passo) * passo)
  const marcas = []
  for (let v = lo; v <= hi + 1e-9; v += passo) marcas.push(Math.round(v * 100) / 100)
  return { min: lo, max: hi, marcas }
}
export const compacto = (v) => {
  const a = Math.abs(v)
  if (a >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',').replace(',0', '') + ' mi'
  if (a >= 1000) return (v / 1000).toFixed(a % 1000 === 0 ? 0 : 1).replace('.', ',') + ' mil'
  return String(Math.round(v))
}
export const mesCurto = (m) => ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m.slice(5, 7)) - 1] + (m.slice(5, 7) === '01' ? '/' + m.slice(2, 4) : '')

// Barra com a ponta de dados arredondada (4px) e a base reta. dir: 'cima' (coluna) ou 'direita' (barra horizontal).
export function pathBarra(x, y, w, h, dir = 'cima', r = 4) {
  if (w <= 0 || h <= 0) return ''
  r = Math.min(r, w / 2, h / 2)
  if (dir === 'direita') return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`
}

// Cartão do gráfico: título, subtítulo, legenda (2+ séries), o gráfico e a visão em tabela.
export function CartaoGrafico({ titulo, sub, legenda = [], tabela, children, acoes }) {
  const [tab, setTab] = useState(false)
  return (
    <section className="card grafico-card" aria-label={titulo}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontWeight: 500, fontSize: 14 }}>{titulo}</div>
          {sub && <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
        </div>
        {acoes}
        {tabela && <button className="btn btn-ghost btn-sm" onClick={() => setTab((v) => !v)} aria-pressed={tab}>{tab ? 'Ver gráfico' : 'Ver como tabela'}</button>}
      </div>
      {legenda.length >= 2 && !tab && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', margin: '10px 0 0', fontSize: 12, color: 'var(--text2)' }}>
          {legenda.map((l) => (
            <span key={l.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: l.cor, display: 'inline-block' }} />{l.nome}
            </span>
          ))}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        {tab && tabela ? (
          <div style={{ overflowX: 'auto', maxHeight: 360 }}>
            <table>
              <thead><tr>{tabela.cabecalhos.map((c, i) => <th key={c} style={i ? { textAlign: 'right' } : undefined}>{c}</th>)}</tr></thead>
              <tbody>{tabela.linhas.map((l, i) => <tr key={i}>{l.map((v, j) => <td key={j} className={j ? 'mono' : undefined} style={j ? { textAlign: 'right' } : undefined}>{v}</td>)}</tr>)}</tbody>
            </table>
          </div>
        ) : children}
      </div>
    </section>
  )
}

// Balão: valor em destaque, nome da série em segundo plano, chave em traço colorido. Textos entram como texto (nunca HTML).
export function Balao({ x, y, largura, titulo, linhas }) {
  if (!linhas) return null
  const lado = x > largura * 0.6 ? 'esq' : 'dir'
  return (
    <div role="status" style={{ position: 'absolute', top: Math.max(0, y), left: lado === 'dir' ? x + 12 : undefined, right: lado === 'esq' ? largura - x + 12 : undefined, zIndex: 5, pointerEvents: 'none', background: 'var(--bg4)', border: '1px solid var(--border2)', borderRadius: 8, padding: '8px 10px', minWidth: 150, boxShadow: '0 6px 18px rgba(0,0,0,.35)' }}>
      {titulo && <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>{titulo}</div>}
      {linhas.map((l) => (
        <div key={l.nome} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, lineHeight: 1.7 }}>
          {l.cor && <span style={{ width: 12, height: 3, borderRadius: 2, background: l.cor, flex: '0 0 auto' }} />}
          <span className="mono" style={{ color: 'var(--text)', fontWeight: 600, marginLeft: 'auto', order: 2 }}>{l.valorTxt ?? fmt(l.valor)}</span>
          <span style={{ color: 'var(--text2)' }}>{l.nome}</span>
        </div>
      ))}
    </div>
  )
}

// Eixo Y e grade recessiva (hairlines sólidas).
export function GradeY({ marcas, y, esquerda, direita, formatar = compacto }) {
  return (
    <g>
      {marcas.map((m) => (
        <g key={m}>
          <line x1={esquerda} x2={direita} y1={y(m)} y2={y(m)} stroke="var(--border)" strokeWidth="1" />
          <text x={esquerda - 8} y={y(m)} textAnchor="end" dominantBaseline="middle" fontSize="11" fill="var(--text2)">{formatar(m)}</text>
        </g>
      ))}
    </g>
  )
}
