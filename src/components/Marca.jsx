// Identidade do Sobrou!: moedinha + brilho ("sobrou dinheiro").
export function Marca({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" style={{ flexShrink: 0 }}>
      <rect width="32" height="32" rx="9" fill="var(--brand)" />
      <circle cx="14" cy="18" r="8" fill="var(--brand-ink)" />
      <circle cx="14" cy="18" r="4.5" fill="none" stroke="var(--brand)" strokeWidth="1.6" />
      <path d="M23 4Q23.8 8.2 28 9Q23.8 9.8 23 14Q22.2 9.8 18 9Q22.2 8.2 23 4Z" fill="var(--brand-ink)" />
    </svg>
  )
}

export function Nome() {
  return <span className="marca-nome">Sobrou<span className="marca-excl">!</span></span>
}

export const SLOGAN = 'Seu dinheiro, finalmente, sobrando.'
