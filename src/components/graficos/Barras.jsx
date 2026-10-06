import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { Balao, pathBarra, useLargura } from './base'

// Ranking horizontal (uma série): nome à esquerda, barra, valor e % no fim da barra.
export default function Barras({ itens, cor = 'var(--serie-1)', corOutras = 'var(--text3)', linha = 30 }) {
  const [ref, W] = useLargura()
  const [alvo, setAlvo] = useState(null)
  const nomeW = Math.min(170, Math.max(96, W * 0.3))
  const rotuloW = 150
  const areaBarra = Math.max(40, W - nomeW - rotuloW - 8)
  const max = Math.max(1, ...itens.map((i) => i.valor))
  const H = itens.length * linha + 4
  const cortar = (t, n) => (t.length > n ? t.slice(0, n - 1) + '…' : t)
  return (
    <div ref={ref} style={{ position: 'relative' }} onPointerLeave={() => setAlvo(null)}>
      <svg width={W} height={H} role="img" aria-label="Ranking de categorias; veja os valores na tabela" style={{ display: 'block' }}>
        {itens.map((it, i) => {
          const y = i * linha + 4
          const w = (it.valor / max) * areaBarra
          return (
            <g key={it.nome}>
              <text x={nomeW - 8} y={y + linha / 2 - 2} textAnchor="end" dominantBaseline="middle" fontSize="12" fill="var(--text)">{cortar(it.nome, Math.floor(nomeW / 7))}</text>
              <path d={pathBarra(nomeW, y + (linha - 14) / 2 - 2, Math.max(w, 2), 14, 'direita')} fill={it.outras ? corOutras : cor} opacity={!alvo || alvo.i === i ? 1 : 0.7} />
              <text x={nomeW + Math.max(w, 2) + 8} y={y + linha / 2 - 2} dominantBaseline="middle" fontSize="12" fill="var(--text2)">
                <tspan className="mono" fill="var(--text)" fontWeight="600">{fmt(it.valor)}</tspan><tspan dx="6">{String(it.pct).replace('.', ',')}%</tspan>
              </text>
              <rect x="0" y={y - 2} width={W} height={linha} fill="transparent" tabIndex={0} aria-label={`${it.nome}: ${fmt(it.valor)}, ${it.pct}% do total`}
                onPointerMove={() => setAlvo({ i, x: nomeW + w / 2, y: y + linha })} onFocus={() => setAlvo({ i, x: nomeW + w / 2, y: y + linha })} onBlur={() => setAlvo(null)} style={{ outline: 'none' }} />
            </g>
          )
        })}
      </svg>
      {alvo && <Balao x={alvo.x} y={alvo.y} largura={W} titulo={itens[alvo.i].nome} linhas={[{ nome: 'Gasto no mês', valor: itens[alvo.i].valor, cor }, { nome: 'Do total', valorTxt: String(itens[alvo.i].pct).replace('.', ',') + '%' }]} />}
    </div>
  )
}
