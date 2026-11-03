// Teste de ponta a ponta do PERFIL ESTETICISTA (build com VITE_PERFIL=esteticista): telas visíveis e navegação. Rode com: bash scripts/e2e/rodar-perfil.sh
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
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Maria', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }]
const PESS = [{ id: 'p1', nome: 'Maria', cor: 'purple', apelidos: [] }]
const DB = { cartoes: CART, categorias: CATS, pessoas: PESS, compras: [], fixos: [], rendas: [], fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [], orcamentos: [], atendimentos: [], clientes: [], servicos: [], pacotes: [], produtos: [], vendas_produtos: [] }
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'maria@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
const browser = await chromium.launch()
async function abrir(vp) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo' })
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
const cel = await abrir({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))
await p.goto(`http://127.0.0.1:${PORTA}/#/renda`)
await p.waitForSelector('.subnav')
const chips = (await p.locator('.subnav-item').allInnerTexts()).map((t) => t.trim())
ok(chips.some((c) => c.startsWith('Atendimentos')) && !chips.some((c) => c.startsWith('Aulas')), `perfil esteticista: Planejamento tem Atendimentos e NÃO tem Aulas (${chips.length} chips)`)
const grupos = (await p.locator('.subnav-grupo').allInnerTexts()).map((t) => t.trim().toLowerCase())
ok(grupos.includes('negócios'), 'o grupo "Negócios" aparece com Atendimentos')
await p.evaluate(() => { window.location.hash = '#/aulas' })
await p.waitForTimeout(300)
ok((await p.locator('.topbar-titulo').innerText()) !== 'Aulas particulares', 'endereço #/aulas é ignorado no perfil esteticista')
await p.goto(`http://127.0.0.1:${PORTA}/#/atendimentos`)
await p.waitForSelector('.topbar-titulo')
ok((await p.locator('.topbar-titulo').innerText()) === 'Atendimentos', '#/atendimentos abre a agenda')
for (const tela of ['inicio', 'pagamentos', 'compras', 'faturas', 'analises', 'renda', 'orcamento', 'fechamento']) {
  await p.goto(`http://127.0.0.1:${PORTA}/#/${tela}`); await p.waitForSelector('.topbar-titulo'); await p.waitForTimeout(300)
  const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
  if (m.sw > m.cw + 1) ok(false, `${tela}: rolagem horizontal no perfil esteticista`)
}
ok(!falhas.some((f) => /rolagem horizontal/.test(f)), 'telas principais do perfil sem rolagem horizontal')
await p.goto(`http://127.0.0.1:${PORTA}/#/inicio`); await p.waitForSelector('.ini-hero')
ok(!/Aulas particulares/.test(await p.locator('.page').innerText()), 'Início não mostra Aulas particulares')
await cel.close()

const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/inicio`)
await d.waitForSelector('.sidebar')
const itens = (await d.locator('.sidebar-item').allInnerTexts()).map((t) => t.trim())
ok(itens.some((t) => t.startsWith('Atendimentos')) && !itens.some((t) => t.startsWith('Aulas particulares')), 'menu lateral: Atendimentos sim, Aulas particulares não')
await desk.close()

ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 2).join(' | ').slice(0, 160) : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
