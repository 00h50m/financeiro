import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { Balao, GradeY, escalaY, mesCurto, pathBarra, useLargura } from './base'

// Colunas por mês: agrupadas (uma ao lado da outra) ou empilhadas. Cada mês é o alvo do mouse/toque/foco.
//   meses  [{ rotulo, valores: [n por série], extra?: [{ nome, valorTxt }] }]    series [{ nome, cor }]
export default function Colunas({ meses, series, empilhado = false, altura = 240, rotuloMes = mesCurto, tituloBalao }) {
  const [ref, W] = useLargura()
  const [alvo, setAlvo] = useState(null)
  const M = { t: 12, r: 8, b: 26, l: 46 }
  const H = altura
  const total = (m) => (empilhado ? m.valores.reduce((t, v) => t + Math.max(0, v), 0) : Math.max(0, ...m.valores))
  const { max, marcas } = escalaY(Math.max(0, ...meses.map(total)))
  const y = (v) => M.t + (1 - v / max) * (H - M.t - M.b)
  const base = y(0)
  const faixa = (W - M.l - M.r) / Math.max(1, meses.length)
  const grossura = empilhado ? Math.min(24, faixa * 0.6) : Math.min(24, (faixa * 0.8) / series.length - 2)
  const larguraGrupo = empilhado ? grossura : series.length * grossura + (series.length - 1) * 2
  const mostrarRotulo = (i) => faixa >= 34 || i % Math.ceil(34 / faixa) === 0

  return (
    <div ref={ref} style={{ position: 'relative' }} onPointerLeave={() => setAlvo(null)}>
      <svg width={W} height={H} role="img" aria-label="Gráfico de colunas por mês; veja os valores na tabela" style={{ display: 'block' }}>
        <GradeY marcas={marcas} y={y} esquerda={M.l} direita={W - M.r} />
        {meses.map((m, i) => {
          const cx = M.l + faixa * i + faixa / 2
          const x0 = cx - larguraGrupo / 2
          const ativo = alvo?.i === i
          let acumulado = 0
          return (
            <g key={m.rotulo + i}>
              {ativo && <rect x={M.l + faixa * i} y={M.t} width={faixa} height={H - M.t - M.b} fill="var(--bg3)" opacity="0.6" />}
              {m.valores.map((v, s) => {
                const alt = Math.max(0, base - y(Math.max(0, v)))
                if (empilhado) {
                  const plot = base - y(max) // altura útil do gráfico
                  const vv = Math.max(0, v)
                  const topo = base - ((acumulado + vv) / max) * plot
                  const ehTopo = m.valores.slice(s + 1).every((x) => !(x > 0))
                  const respiro = vv > 0 && !ehTopo ? 2 : 0 // 2px de respiro entre este segmento e o de cima
                  const hSeg = Math.max(0, (vv / max) * plot - respiro)
                  acumulado += vv
                  if (!(hSeg > 0)) return null
                  const yy = topo + respiro
                  const d = ehTopo ? pathBarra(x0, yy, grossura, hSeg) : `M${x0},${yy} h${grossura} v${hSeg} h${-grossura} Z`
                  return <path key={s} d={d} fill={series[s].cor} opacity={ativo || !alvo ? 1 : 0.75} />
                }
                return alt > 0 ? <path key={s} d={pathBarra(x0 + s * (grossura + 2), base - alt, grossura, alt)} fill={series[s].cor} opacity={ativo || !alvo ? 1 : 0.75} /> : null
              })}
              {mostrarRotulo(i) && <text x={cx} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text2)">{rotuloMes(m.rotulo)}</text>}
              <rect
                x={M.l + faixa * i} y={M.t} width={faixa} height={H - M.t - M.b} fill="transparent" tabIndex={0}
                aria-label={`${m.rotulo}: ${series.map((s, k) => `${s.nome} ${fmt(m.valores[k])}`).join(', ')}`}
                onPointerMove={() => setAlvo({ i, x: cx, y: M.t + 6 })} onFocus={() => setAlvo({ i, x: cx, y: M.t + 6 })} onBlur={() => setAlvo(null)}
                style={{ outline: 'none' }}
              />
            </g>
          )
        })}
        <line x1={M.l} x2={W - M.r} y1={base} y2={base} stroke="var(--border2)" strokeWidth="1" />
      </svg>
      {alvo && (
        <Balao x={alvo.x} y={alvo.y} largura={W} titulo={tituloBalao ? tituloBalao(meses[alvo.i]) : meses[alvo.i].rotulo}
          linhas={[...series.map((s, k) => ({ nome: s.nome, cor: s.cor, valor: meses[alvo.i].valores[k] })), ...(meses[alvo.i].extra || [])]} />
      )}
    </div>
  )
}
