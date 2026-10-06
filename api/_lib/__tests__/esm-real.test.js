import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// O Vitest perdoa importações sem ".js"; o Node de verdade (e a Vercel) não. Já derrubou o bot em produção uma vez:
// este teste carrega cada função da pasta api/ no Node puro, para pegar o problema antes de publicar.
const raiz = fileURLToPath(new URL('../../../', import.meta.url))
describe('funções da API carregam no Node puro (ESM)', () => {
  for (const arq of ['api/telegram.js', 'api/telegram-admin.js', 'api/cron-resumo.js', 'api/cron-resumo-mensal.js']) {
    it(arq, () => {
      const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify('./' + arq)})`], { cwd: raiz, encoding: 'utf8' })
      expect(r.stderr.split('\n')[0] || '').not.toMatch(/Cannot find module|ERR_MODULE_NOT_FOUND/)
      expect(r.status).toBe(0)
    })
  }
})
