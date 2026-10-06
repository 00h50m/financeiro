import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { Balao, GradeY, escalaY, mesCurto, useLargura } from './base'

// Linha de uma série ao longo dos meses, com linha de referência opcional (ex.: teto do Orçamento) e cursor que acompanha o mouse.
//   pontos [{ mes, valor }]   referencia { valor, rotulo }
export default function Linha({ pontos, cor = 'var(--serie-1)', referencia = null, altura = 240, nome = 'Gasto' }) {
  const [ref, W] = useLargura()
  const [alvo, setAlvo] = useState(null)
  const M = { t: 14, r: 22, b: 26, l: 46 }
  const H = altura
  const maxDados = Math.max(0, ...pontos.map((p) => p.valor), referencia?.valor || 0)
  const { max, marcas } = escalaY(maxDados)
  const x = (i) => M.l + (pontos.length === 1 ? (W - M.l - M.r) / 2 : (i / (pontos.length - 1)) * (W - M.l - M.r))
  const y = (v) => M.t + (1 - v / max) * (H - M.t - M.b)
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.valor)}`).join(' ')
  const area = `${linha} L${x(pontos.length - 1)},${y(0)} L${x(0)},${y(0)} Z`
  const passo = Math.max(1, Math.ceil(34 / Math.max(1, (W - M.l - M.r) / Math.max(1, pontos.length - 1))))
  const mover = (e) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = e.clientX - r.left
    const i = Math.max(0, Math.min(pontos.length - 1, Math.round(((px - M.l) / Math.max(1, W - M.l - M.r)) * (pontos.length - 1))))
    setAlvo(i)
  }
  const ultimo = pontos.length - 1
  return (
    <div ref={ref} style={{ position: 'relative' }} onPointerLeave={() => setAlvo(null)}>
      <svg width={W} height={H} role="img" aria-label="Gráfico de linha mês a mês; veja os valores na tabela" style={{ display: 'block' }}>
        <GradeY marcas={marcas} y={y} esquerda={M.l} direita={W - M.r} />
        {referencia?.valor > 0 && (
          <g>
            <line x1={M.l} x2={W - M.r} y1={y(referencia.valor)} y2={y(referencia.valor)} stroke="var(--red)" strokeWidth="1" opacity="0.8" />
            <text x={W - M.r} y={y(referencia.valor) - 5} textAnchor="end" fontSize="11" fill="var(--text2)">{referencia.rotulo}</text>
          </g>
        )}
        <path d={area} fill={cor} opacity="0.1" />
        <path d={linha} fill="none" stroke={cor} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {alvo != null && <line x1={x(alvo)} x2={x(alvo)} y1={M.t} y2={H - M.b} stroke="var(--border2)" strokeWidth="1" />}
        {pontos.map((p, i) => (i % passo === 0 || i === ultimo) && <text key={p.mes} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--text2)">{mesCurto(p.mes)}</text>)}
        {[ultimo, alvo].filter((v, k, a) => v != null && a.indexOf(v) === k).map((i) => (
          <circle key={i} cx={x(i)} cy={y(pontos[i].valor)} r="4" fill={cor} stroke="var(--bg2)" strokeWidth="2" />
        ))}
        {pontos.length > 1 && <text x={x(ultimo)} y={y(pontos[ultimo].valor) - 10} textAnchor="end" fontSize="12" fill="var(--text)" fontWeight="600" className="mono">{fmt(pontos[ultimo].valor)}</text>}
        <rect x={M.l} y={M.t} width={W - M.l - M.r} height={H - M.t - M.b} fill="transparent" onPointerMove={mover}
          tabIndex={0} aria-label="Use as setas para percorrer os meses"
          onKeyDown={(e) => { if (e.key === 'ArrowRight') setAlvo((a) => Math.min(ultimo, (a ?? -1) + 1)); if (e.key === 'ArrowLeft') setAlvo((a) => Math.max(0, (a ?? 1) - 1)) }}
          onBlur={() => setAlvo(null)} style={{ outline: 'none' }} />
      </svg>
      {alvo != null && (
        <Balao x={x(alvo)} y={Math.max(4, y(pontos[alvo].valor) - 56)} largura={W} titulo={pontos[alvo].mes.split('-').reverse().join('/')}
          linhas={[{ nome, cor, valor: pontos[alvo].valor }, ...(referencia?.valor > 0 ? [{ nome: referencia.rotulo, valor: referencia.valor }] : [])]} />
      )}
    </div>
  )
}
