// Service worker do Sobrou! — só guarda o "casco" do app (HTML/JS/CSS/ícones) para abrir rápido
// e permitir instalação. Dados financeiros (Supabase) NUNCA passam por aqui: são outra origem e
// nada é interceptado, então não ficam em cache no aparelho.
const CACHE = 'sobrou-v1'
const CASCO = ['/', '/favicon.svg', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CASCO)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Páginas: tenta a rede (pega deploy novo) e cai no cache se estiver offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put('/', res.clone())); return res })
        .catch(() => caches.match('/'))
    )
    return
  }

  // Arquivos com hash no nome (/assets/*) nunca mudam: cache primeiro.
  if (url.pathname.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        const copia = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copia))
        return res
      }))
    )
    return
  }

  // Demais arquivos estáticos (ícones, manifest): usa o cache e atualiza em segundo plano.
  e.respondWith(
    caches.match(req).then((hit) => {
      const rede = fetch(req).then((res) => {
        const copia = res.clone()
        caches.open(CACHE).then((c) => c.put(req, copia))
        return res
      }).catch(() => hit)
      return hit || rede
    })
  )
})
