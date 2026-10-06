import { useEffect, useState } from 'react'

// Confere se foi publicada uma versão mais nova do app (o celular costuma manter o app antigo aberto por dias).
// Compara o número do build que está rodando com o de /version.json (sempre buscado na rede, nunca do cache).
const MINHA = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : null

export const versaoDoApp = MINHA

export default function AvisoNovaVersao() {
  const [nova, setNova] = useState(false)
  useEffect(() => {
    if (!MINHA) return undefined // desenvolvimento: sem build numerado
    let vivo = true
    async function conferir() {
      try {
        const r = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' })
        if (!r.ok) return
        const { build } = await r.json()
        if (vivo && build && build !== MINHA) setNova(true)
      } catch { /* sem rede: tenta de novo depois */ }
    }
    conferir()
    const t = setInterval(conferir, 5 * 60 * 1000)
    const aoVoltar = () => { if (document.visibilityState === 'visible') conferir() }
    document.addEventListener('visibilitychange', aoVoltar)
    return () => { vivo = false; clearInterval(t); document.removeEventListener('visibilitychange', aoVoltar) }
  }, [])

  async function atualizar() {
    try { const regs = await navigator.serviceWorker?.getRegistrations?.(); await Promise.all((regs || []).map((r) => r.update())) } catch { /* segue */ }
    try { const nomes = await caches?.keys?.(); await Promise.all((nomes || []).map((n) => caches.delete(n))) } catch { /* segue */ }
    window.location.reload()
  }
  if (!nova) return null
  return (
    <div className="toast-area" style={{ bottom: 'auto', top: 12 }} role="status" aria-live="polite">
      <div className="toast toast-amber">
        <span>Tem uma versão nova do app.</span>
        <button className="btn btn-primary btn-sm" onClick={atualizar}>Atualizar agora</button>
      </div>
    </div>
  )
}
