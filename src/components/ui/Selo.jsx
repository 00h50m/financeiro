// Selo de status. Nunca depende só da cor: sempre tem texto e um símbolo (que o leitor de tela ignora).
const SIMBOLO = { ok: '✓', aviso: '!', erro: '✕', info: 'i', neutro: '•', marca: '' }
export default function Selo({ tom = 'neutro', children, simbolo, titulo }) {
  const t = SIMBOLO[tom] !== undefined ? tom : 'neutro'
  const s = simbolo ?? SIMBOLO[t]
  return (
    <span className={`selo selo-${t}`} title={titulo}>
      {s && <span className="selo-icone" aria-hidden="true">{s}</span>}
      {children}
    </span>
  )
}
