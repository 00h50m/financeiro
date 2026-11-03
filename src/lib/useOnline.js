import { useEffect, useState } from 'react'

// true quando o aparelho tem conexão (eventos online/offline do navegador). Sem navigator (testes/SSR), considera online.
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine !== false))
  useEffect(() => {
    const ligar = () => setOnline(true)
    const desligar = () => setOnline(false)
    window.addEventListener('online', ligar)
    window.addEventListener('offline', desligar)
    return () => { window.removeEventListener('online', ligar); window.removeEventListener('offline', desligar) }
  }, [])
  return online
}
