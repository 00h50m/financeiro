// Teste de ponta a ponta de acessibilidade, foco, falta de conexão e falha de carregamento (Chromium real + Supabase simulado). Rode com: bash scripts/e2e/rodar-acessibilidade.sh
/* global process, console, window, document, localStorage */
import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
const { chromium } = await import('playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'))
const DIST = process.env.DIST, PORTA = Number(process.env.PORTA_E2E || 5188)
const falhas = []
const ok = (c, m) => { console.log(`${c ? 'OK ' : 'ERRO'} ${m}`); if (!c) falhas.push(m) }
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const srv = createServer((req, res) => { const c = new URL(req.url, 'http://x').pathname; const a = existsSync(join(DIST, c)) && c !== '/' ? join(DIST, c) : join(DIST, 'index.html'); res.writeHead(200, { 'content-type': TIPOS[extname(a)] || 'application/octet-stream' }); res.end(readFileSync(a)) }).listen(PORTA)
const SB = 'http://localhost:54321'
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const DB = { cartoes: CART, categorias: CATS, pessoas: PESS, compras: [], fixos: [], rendas: [], fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [], orcamentos: [] }
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
const browser = await chromium.launch()
async function abrir(vp) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' }) // o service worker do app esconde as requisições do roteamento do teste
  await ctx.clock.install({ time: new Date('2026-10-15T15:00:00Z') })
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url())
    const json = (b) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' }, body: JSON.stringify(b) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1')) return json({ user: sessao.user })
    if (url.pathname.includes('/rpc/')) return json({})
    return json(req.method() === 'GET' ? (DB[url.pathname.replace('/rest/v1/', '')] || []) : [])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const ctx = await abrir({ width: 390, height: 844 })
const p = await ctx.newPage()
p.on('pageerror', (e) => erros.push(e.message))

// ---- 1. nome acessível em todos os campos e botões das telas principais
const SEM_NOME = () => {
  const nome = (e) => {
    const lb = e.getAttribute('aria-labelledby'); if (lb) { const t = lb.split(' ').map((id) => document.getElementById(id)?.textContent || '').join(' ').trim(); if (t) return t }
    if ((e.getAttribute('aria-label') || '').trim()) return 1
    if (e.labels && e.labels.length && [...e.labels].map((l) => l.textContent).join('').trim()) return 1
    if (e.closest('label')?.textContent.trim()) return 1
    if ((e.getAttribute('title') || '').trim()) return 1
    return (e.textContent || '').trim()
  }
  return [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab]')].filter((e) => e.offsetParent !== null && !nome(e)).map((e) => `${e.tagName}.${(e.className || '').toString().split(' ')[0]}`)
}
let semNome = []
for (const tela of ['inicio', 'pagamentos', 'compras', 'faturas', 'analises', 'orcamento', 'categorias', 'pessoas', 'simulador', 'emprestimos', 'meuplano', 'config']) {
  await p.goto(`http://127.0.0.1:${PORTA}/#/${tela}`); await p.waitForSelector('.topbar-titulo'); await p.waitForTimeout(450)
  const faltam = await p.evaluate(SEM_NOME)
  if (faltam.length) semNome.push(`${tela}: ${faltam.slice(0, 3).join(', ')}`)
}
ok(semNome.length === 0, `todos os botões e campos das telas principais têm nome acessível ${semNome.length ? '→ ' + semNome.join(' | ') : ''}`)

// ---- 2. foco em janelas: entra, fica preso, Esc fecha e devolve o foco
await p.goto(`http://127.0.0.1:${PORTA}/#/compras`); await p.waitForSelector('.topbar-titulo')
const abrirBtn = p.locator('.tb-primario')
await abrirBtn.focus()
await abrirBtn.click()
await p.waitForSelector('.modal')
ok(await p.evaluate(() => !!document.activeElement?.closest('.modal')), 'ao abrir a janela o foco entra nela')
let preso = true
for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!(await p.evaluate(() => !!document.activeElement?.closest('.modal')))) { preso = false; break } }
for (let i = 0; i < 25 && preso; i++) { await p.keyboard.press('Shift+Tab'); if (!(await p.evaluate(() => !!document.activeElement?.closest('.modal')))) { preso = false; break } }
ok(preso, 'Tab e Shift+Tab ficam dentro da janela (foco preso)')
ok(await p.evaluate(() => document.querySelector('.modal')?.getAttribute('role') === 'dialog' && document.querySelector('.modal')?.getAttribute('aria-modal') === 'true'), 'a janela tem papel de diálogo e aria-modal')
await p.keyboard.press('Escape')
await p.waitForFunction(() => document.querySelectorAll('.modal').length === 0)
ok(await p.evaluate(() => document.activeElement?.textContent?.trim() === '+ Nova compra'), 'Esc fecha e o foco volta para o botão que abriu')

// ---- 3. sem conexão
await ctx.setOffline(true)
await p.waitForSelector('.offline-aviso')
ok(/Sem conexão/.test(await p.locator('.offline-aviso').innerText()) && /Sem conexão/.test(await p.locator('.topbar-sync').getAttribute('title')), 'sem internet: aviso visível e o indicador do topo diz "Sem conexão"')
await ctx.setOffline(false)
await p.waitForFunction(() => document.querySelectorAll('.offline-aviso').length === 0)
ok(true, 'a conexão volta e o aviso some sozinho')

// ---- 4. tela que não carrega (ex.: arquivo antigo depois de uma atualização)
await p.route('**/assets/Parcelamentos-*.js', (r) => r.abort())
await p.goto(`http://127.0.0.1:${PORTA}/#/inicio`); await p.waitForSelector('.topbar-titulo')
await p.locator('.bottom-nav button', { hasText: 'Movimentações' }).click()
await p.locator('.subnav-item', { hasText: 'Parcelamentos' }).click()
await p.waitForSelector('[role=alert]:has-text("Não consegui abrir esta tela")')
ok(true, 'tela que não carrega mostra mensagem com "Recarregar" (em vez de página em branco)')
ok((await p.locator('.topbar-titulo').count()) === 1 && (await p.locator('.bottom-nav').count()) === 1, 'o resto do app (menu e barra) continua funcionando')
await p.locator('.subnav-item', { hasText: 'Compras' }).click()
await p.waitForSelector('.topbar-titulo:has-text("Compras")')
ok(await p.locator('[role=alert]:has-text("Não consegui abrir esta tela")').count() === 0, 'trocar de tela limpa o erro')
await p.unroute('**/assets/Parcelamentos-*.js')

ok(erros.filter((e) => !/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically/i.test(e)).length === 0, `sem erros de JavaScript inesperados ${erros.length ? '→ ' + erros.slice(0, 2).join(' | ').slice(0, 160) : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
