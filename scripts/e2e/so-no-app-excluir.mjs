// Teste: aba 'Só no app' permite excluir a compra lançada que não está na fatura. Rode com: bash scripts/e2e/rodar-so-no-app-excluir.sh
/* global process, console, window, document, localStorage */
import { createServer } from 'node:http'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { join, extname } from 'node:path'
const { chromium } = await import('playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'))
const DIST = process.env.DIST, PORTA = Number(process.env.PORTA_E2E || 5188)
const falhas = []
const ok = (c, m) => { console.log(`${c ? 'OK ' : 'ERRO'} ${m}`); if (!c) falhas.push(m) }
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const srv = createServer((req, res) => { const c = new URL(req.url, 'http://x').pathname; const a = existsSync(join(DIST, c)) && c !== '/' ? join(DIST, c) : join(DIST, 'index.html'); res.writeHead(200, { 'content-type': TIPOS[extname(a)] || 'application/octet-stream' }); res.end(readFileSync(a)) }).listen(PORTA)
const SB = 'http://localhost:54321'
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }, { id: 'k2', nome: 'Assinaturas', subcategorias: ['Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const fx = (id, nome, valor, extra) => ({ id, nome, valor, ativo: true, dia_vencimento: 10, mes_inicio: '2026-01', categoria: 'Assinaturas', subcategoria: 'Outros', pessoa: 'Giovanna', ...extra })
const DB = {
  cartoes: CART, categorias: [{ id: 'k3', nome: 'Animais', subcategorias: ['Medicamentos'] }, { id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado', 'Lanche/Café'] }, { id: 'k2', nome: 'Casa', subcategorias: ['Limpeza', 'Móveis'] }], pessoas: PESS, rendas: [{ mes: '2026-11', giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }],
  fixos: [],
  fixos_valores: [], fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [], importacoes_fatura: [], orcamentos: [], compras: [{ id: 'pv1', data_compra: '2026-10-08', descricao: 'PUPOVET', identificacao: 'Pupovet', categoria: 'Animais', subcategoria: 'Medicamentos', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 13.2, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null }, { id: 'cp1', data_compra: '2026-10-04', descricao: 'AMAZON BR', identificacao: 'Finish', categoria: 'Casa', subcategoria: 'Limpeza', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 17.57, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null }],
}
const escritas = []; const rpcs = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
writeFileSync(join(process.env.TMP_E2E || '/tmp', 'fatura-conc.csv'), ['data,descricao,valor,categoria,parcela_atual,parcela_total,cartao,observacao', '2026-10-04,AMAZON BR,17.54,Alimentação,,,Nubank,'].join('\n'))
const browser = await chromium.launch()
async function abrir(vp) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' })
  await ctx.clock.install({ time: new Date('2026-11-15T15:00:00Z') })
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url())
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' }, body: JSON.stringify(b) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1')) return json({ user: sessao.user })
    const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)
    if (rpc) {
      const corpo = JSON.parse(req.postData() || '{}'); rpcs.push([rpc[1], corpo])
      if (rpc[1] === 'aplicar_importacao') return json({ importacao_id: corpo.p_importacao, status_importacao: 'concluida', status_conciliacao: corpo.p_dados.status_conciliacao, criadas: corpo.p_dados.compras.length, atualizadas: 0, movidas: 0, ids: [] })
      return json({ salvo: true })
    }
    const tabela = url.pathname.replace('/rest/v1/', '')
    if (tabela === 'compras' && req.method() === 'DELETE') { const id = (url.search.match(/id=eq\.([^&]+)/) || [])[1]; DB.compras = DB.compras.filter((c) => c.id !== id) }
    if (req.method() === 'GET') return json(DB[tabela] || [])
    if (['fixos_valores', 'fixos', 'compras'].includes(tabela) && ['POST', 'PATCH', 'DELETE'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const cel = await abrir({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))
await p.goto(`http://127.0.0.1:${PORTA}/#/importar`)
await p.waitForSelector('.imp-escolher')
await p.locator('input[type=file][accept=".csv"]').setInputFiles(join(process.env.TMP_E2E || '/tmp', 'fatura-conc.csv'))
await p.waitForSelector('.imp-config')
await p.getByRole('button', { name: /Analisar lançamentos/ }).click()
await p.waitForSelector('.imp-resumos')
await p.getByRole('button', { name: /Revisar pendências/ }).click()
await p.getByRole('button', { name: /Só no app/ }).click()
const cartao = p.locator('.imp-linha.so-app', { hasText: 'Pupovet' })
await cartao.waitFor()
ok((await cartao.getByRole('button', { name: 'Editar a compra' }).count()) === 1 && (await cartao.getByRole('button', { name: /Excluir/ }).count()) === 1, 'a compra "só no app" tem Editar e Excluir')
await cartao.getByRole('button', { name: /Excluir/ }).click()
const dialogo = p.getByRole('dialog')
await dialogo.waitFor()
ok(/Pupovet/.test(await dialogo.innerText()) && /desfazer/i.test(await dialogo.innerText()), 'pede confirmação citando a compra e a opção de desfazer')
ok(escritas.length === 0, 'nada é excluído antes de confirmar')
await dialogo.getByRole('button', { name: 'Excluir' }).click()
for (let i = 0; i < 40 && !escritas.some(([t, m]) => t === 'compras' && m === 'DELETE'); i++) await p.waitForTimeout(100)
const del = escritas.find(([t, m]) => t === 'compras' && m === 'DELETE')
ok(del && /pv1/.test(del[3]), `DELETE enviado para a compra pv1 (${del?.[3]})`)
for (let i = 0; i < 40 && (await p.locator('.imp-linha.so-app', { hasText: 'Pupovet' }).count()) > 0; i++) await p.waitForTimeout(100)
ok((await p.locator('.imp-linha.so-app', { hasText: 'Pupovet' }).count()) === 0, 'a compra some da aba "Só no app" depois de excluída')
// cancelar não exclui
await cel.close()
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
