import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// PWA: registra o service worker só no site publicado (no desenvolvimento atrapalharia o recarregamento).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem service worker o app funciona igual */ })
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
