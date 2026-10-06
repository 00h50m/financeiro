import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Cada build ganha um número; o app confere /version.json de vez em quando e avisa quando há versão nova publicada.
const BUILD = Date.now().toString(36)
const emitirVersao = () => ({
  name: 'emitir-versao',
  generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) }) },
})

export default defineConfig({
  plugins: [react(), emitirVersao()],
  define: { __APP_BUILD__: JSON.stringify(BUILD) },
})
