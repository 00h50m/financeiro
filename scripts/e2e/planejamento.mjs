// Teste de ponta a ponta do Planejamento: grupos no menu, diálogos do app no lugar dos nativos (Chromium real + Supabase simulado). Rode com: bash scripts/e2e/rodar-planejamento.sh
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
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }, { id: 'k2', nome: 'Lazer', subcategorias: ['Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const DB = { cartoes: CART, categorias: CATS, pessoas: PESS, compras: [], fixos: [], rendas: [], fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [] }
const escritas = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
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
    const tabela = url.pathname.replace('/rest/v1/', '')
    if (req.method() === 'GET') return json(DB[tabela] || [])
    if (tabela === 'categorias' && ['PATCH', 'DELETE', 'POST'].includes(req.method())) {
      escritas.push([req.method(), url.searchParams.get('id'), JSON.parse(req.postData() || 'null')])
      if (req.method() === 'PATCH') { const d = JSON.parse(req.postData()); const id = (url.searchParams.get('id') || '').replace('eq.', ''); DB.categorias = DB.categorias.map((c) => (c.id === id ? { ...c, ...d } : c)) }
    }
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = [], dialogos = []
const cel = await abrir({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))
p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss() })
await p.goto(`http://127.0.0.1:${PORTA}/#/renda`)
await p.waitForSelector('.subnav')

const grupos = (await p.locator('.subnav-grupo').allInnerTexts()).map((t) => t.trim().toLowerCase())
ok(JSON.stringify(grupos) === JSON.stringify(['planejar', 'dívidas', 'fechar o mês', 'negócios']), `chips do Planejamento agrupados por jornada (${grupos.join(' · ')})`)
const chips = await p.locator('.subnav-item').allInnerTexts()
ok(chips.length === 12 && ['Meu plano', 'Renda', 'Contas fixas', 'Orçamento', 'Metas', 'Reserva', 'Plano de dívidas', 'Empréstimos', 'Simulador', 'E se eu adiar?', 'Fechamento', 'Aulas particulares'].every((c) => chips.some((x) => x.trim().startsWith(c))), `as telas do perfil continuam acessíveis (Atendimentos fica de fora no perfil padrão) (${chips.length} chips)`)
await p.locator('.subnav-item', { hasText: 'Empréstimos' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Empréstimos')
ok(p.url().endsWith('#/emprestimos'), 'chip do grupo "Dívidas" abre Empréstimos')
const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(sw.sw <= sw.cw + 1, `sem rolagem horizontal (${sw.sw} <= ${sw.cw})`)
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/planejamento-celular.png` : '/tmp/planejamento-celular.png' })

// diálogos do app em telas de planejamento/cadastro: renomear categoria (pedir), remover (confirmar)
await p.goto(`http://127.0.0.1:${PORTA}/#/categorias`)
await p.waitForSelector('.sec-cab, .grupo-cab, [aria-expanded]')
await p.getByRole('button', { name: /Expandir todas|Abrir todas/ }).click().catch(() => {})
await p.locator('[aria-expanded="false"]').first().click().catch(() => {})
await p.getByRole('button', { name: 'Renomear categoria' }).first().click()
await p.waitForSelector('.modal input')
ok(await p.locator('.modal input').inputValue().then((v) => v === 'Alimentação' || v === 'Lazer'), 'renomear abre o diálogo do app já com o nome atual (não o prompt do navegador)')
await p.locator('.modal input').fill('Comida')
await p.locator('.modal .btn-primary').click()
for (let i = 0; i < 40 && !escritas.some(([m, , d]) => m === 'PATCH' && d?.nome === 'Comida'); i++) await p.waitForTimeout(100)
ok(escritas.some(([m, , d]) => m === 'PATCH' && d?.nome === 'Comida'), 'confirmar grava o novo nome')
await p.getByRole('button', { name: /Remover (Comida|Lazer)/ }).first().click()
await p.waitForSelector('.modal')
ok(/Remover a categoria/.test(await p.locator('.modal').innerText()) && !escritas.some(([m]) => m === 'DELETE'), 'remover pede confirmação no diálogo do app e não apaga antes')
await p.locator('.modal .btn-ghost').click()
await p.waitForFunction(() => document.querySelectorAll('.modal').length === 0)
ok(!escritas.some(([m]) => m === 'DELETE'), 'cancelar não apaga nada')
await cel.close()

// desktop: grupos no menu lateral
const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/renda`)
await d.waitForSelector('.sidebar-subgrupo')
const sub = (await d.locator('.sidebar-subgrupo').allInnerTexts()).map((t) => t.trim().toLowerCase())
ok(JSON.stringify(sub) === JSON.stringify(['planejar', 'dívidas', 'fechar o mês', 'negócios']), `menu lateral com os grupos do Planejamento (${sub.join(' · ')})`)
await d.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/planejamento-desktop.png` : '/tmp/planejamento-desktop.png' })
await desk.close()

ok(dialogos.length === 0, `nenhum confirm/alert/prompt nativo foi usado (${dialogos.length})`)
ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
