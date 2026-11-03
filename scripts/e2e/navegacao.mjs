// Teste de ponta a ponta da navegação por áreas (Chromium real + Supabase simulado). Rode com: bash scripts/e2e/rodar-navegacao.sh
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
const hoje = new Date().toISOString().slice(0, 10), mes = hoje.slice(0, 7)
const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 10, ativo: true, limite: 8000 }, { id: 'c2', nome: 'Inter', titular: 'Sabrina', fechamento: 20, vencimento: 28, ativo: true, limite: 5000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }, { id: 'k2', nome: 'Transporte', subcategorias: ['Combustível'] }, { id: 'k3', nome: 'Assinaturas', subcategorias: ['Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }, { id: 'p2', nome: 'Sabrina', cor: 'blue', apelidos: [] }]
const compra = (i, o) => ({ id: 'cp' + i, data_compra: dia(1 + (i % 27)), descricao: 'Compra de teste número ' + i + ' com nome razoavelmente longo', categoria: CATS[i % 3].nome, subcategoria: CATS[i % 3].subcategorias[0], pessoa: PESS[i % 2].nome, cartao_id: CART[i % 2].id, valor_total: 20 + i * 13.37, parcelas: i % 5 === 0 ? 6 : 1, origem: i % 4 === 0 ? 'telegram' : 'manual', pago: false, fatura_mes: null, ...o })
const COMPRAS = Array.from({ length: 40 }, (_, i) => compra(i))
const FIXOS = [{ id: 'f1', nome: 'Aluguel', valor: 1800, categoria: 'Moradia', subcategoria: 'Aluguel', dia_vencimento: 5, ativo: true, mes_inicio: '2026-01' }, { id: 'f2', nome: 'Internet', valor: 120, categoria: 'Moradia', subcategoria: 'Internet', dia_vencimento: 12, ativo: true, mes_inicio: '2026-01' }]
const RENDAS = [{ id: 'r1', mes, salario_gi: 5000, salario_sabi: 4000, extras: 0, outros: 0 }]
const TAB = { cartoes: CART, categorias: CATS, pessoas: PESS, compras: COMPRAS, fixos: FIXOS, rendas: RENDAS }
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }

const browser = await chromium.launch()
async function novoContexto(vp) {
  const ctx = await browser.newContext({ viewport: vp })
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url())
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' }, body: JSON.stringify(b) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1')) return json({ user: sessao.user })
    if (url.pathname.includes('/rpc/')) return json({})
    if (req.method() === 'GET') return json(TAB[url.pathname.replace('/rest/v1/', '')] || [])
    return json([])
  })
  await ctx.addInitScript((s) => { if (!localStorage.getItem('sb-localhost-auth-token')) localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const titulo = (p) => p.locator('.topbar-titulo').innerText()
const erros = []

// ================= CELULAR =================
const cel = await novoContexto({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))
await p.goto(`http://127.0.0.1:${PORTA}/`)
await p.waitForSelector('.bottom-nav')
const rotulos = await p.locator('.bottom-nav button span:not(.bottom-nav-badge)').allInnerTexts()
ok(JSON.stringify(rotulos) === JSON.stringify(['Início', 'Movimentações', 'Cartões', 'Planejamento', 'Mais']), `barra inferior com as 5 áreas (${rotulos.join(' · ')})`)
ok((await titulo(p)) === 'Início' && (await p.locator('.subnav').count()) === 0, 'Início abre sem sub-navegação (área de uma tela só)')

await p.locator('.bottom-nav button', { hasText: 'Movimentações' }).click()
ok((await titulo(p)) === 'Pagamentos' && p.url().endsWith('#/pagamentos'), 'Movimentações abre Pagamentos e o endereço vira #/pagamentos')
const chips = await p.locator('.subnav-item').allInnerTexts()
ok(['Pagamentos', 'Compras', 'Parcelamentos', 'Divididos', 'Inbox', 'Buscar'].every((x) => chips.some((c) => c.startsWith(x))), `sub-navegação com as telas da área (${chips.join(', ')})`)
ok(await p.locator('.bottom-nav button.ativo').innerText().then((t) => t.includes('Movimentações')), 'Movimentações fica ativa na barra')

await p.locator('.subnav-item', { hasText: 'Compras' }).click()
ok((await titulo(p)) === 'Compras' && p.url().endsWith('#/compras'), 'chip Compras abre Compras (#/compras)')
await p.locator('.bottom-nav button', { hasText: 'Cartões' }).click()
ok((await titulo(p)) === 'Faturas' && p.url().endsWith('#/faturas'), 'Cartões abre Faturas')
await p.locator('.bottom-nav button', { hasText: 'Movimentações' }).click()
ok((await titulo(p)) === 'Compras', 'voltar a Movimentações reabre a última tela usada (Compras), não a padrão')

// botão voltar do celular
await p.goBack(); await p.waitForTimeout(150)
ok((await titulo(p)) === 'Faturas', 'botão voltar retorna à tela anterior (Faturas)')
await p.goBack(); await p.waitForTimeout(150)
ok((await titulo(p)) === 'Compras', 'voltar de novo retorna a Compras')

await p.locator('.bottom-nav button', { hasText: 'Planejamento' }).click()
ok((await titulo(p)) === 'Meu plano', 'Planejamento abre Meu plano')
ok((await p.locator('.subnav-item', { hasText: 'Contas fixas' }).count()) === 1 && (await p.locator('.subnav-item', { hasText: 'Aulas particulares' }).count()) === 1, 'Planejamento lista Contas fixas e Aulas particulares (perfil padrão)')

// menu completo
await p.locator('.bottom-nav button[aria-label="Abrir menu completo"]').click()
await p.waitForSelector('.sidebar.aberta')
const grupos = await p.locator('.sidebar.aberta .sidebar-grupo-titulo').allInnerTexts()
const AREAS6 = ['início', 'movimentações', 'cartões', 'planejamento', 'análises', 'mais'] // o CSS põe os títulos em caixa alta
ok(JSON.stringify(grupos.map((g) => g.trim().toLowerCase())) === JSON.stringify(AREAS6), `menu completo agrupa nas 6 áreas (${grupos.map((g) => g.trim()).join(' · ')})`)
await p.locator('.sidebar.aberta .sidebar-item', { hasText: 'Análises' }).click()
ok((await titulo(p)) === 'Análises' && p.url().endsWith('#/analises'), 'Análises abre pelo menu')
ok(await p.locator('.bottom-nav button.ativo').innerText().then((t) => t.includes('Mais')), 'Análises destaca "Mais" na barra inferior')
ok((await p.locator('.analises-abas .pag-aba').count()) === 6, 'Análises tem 6 abas internas (Visão geral, Evolução, Categorias, Pessoas, Compromissos, Orçado × realizado)')

// endereço digitado com o app aberto
await p.evaluate(() => { window.location.hash = '#/faturas' })
await p.waitForTimeout(200)
ok((await titulo(p)) === 'Faturas', 'mudar o endereço para #/faturas abre Faturas')
await p.evaluate(() => { window.location.hash = '#/nao-existe' })
await p.waitForTimeout(200)
ok((await titulo(p)) === 'Faturas', 'endereço inválido é ignorado (continua na tela atual)')
const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(sw.sw <= sw.cw + 1, `sem rolagem horizontal da página no celular (${sw.sw} <= ${sw.cw})`)
await p.close()

// endereços antigos continuam funcionando (viraram abas)
await p.evaluate(() => { window.location.hash = '#/graficos' })
await p.waitForTimeout(250)
ok((await titulo(p)) === 'Análises' && (await p.locator('.analises-abas .pag-aba.ativa').innerText()) === 'Evolução', '#/graficos abre Análises > Evolução')
await p.evaluate(() => { window.location.hash = '#/porpessoa' })
await p.waitForTimeout(250)
ok((await p.locator('.analises-abas .pag-aba.ativa').innerText()) === 'Pessoas', '#/porpessoa abre Análises > Pessoas')
await p.evaluate(() => { window.location.hash = '#/calendario' })
await p.waitForTimeout(250)
ok((await titulo(p)) === 'Pagamentos' && (await p.locator('.cal-grade').count()) === 1, '#/calendario abre Pagamentos > Calendário')

// link direto: abre já na tela certa, e voltar leva ao Início
const p2 = await cel.newPage()
p2.on('pageerror', (e) => erros.push(e.message))
await p2.goto(`http://127.0.0.1:${PORTA}/#/inbox`)
await p2.waitForSelector('.topbar-titulo')
ok((await titulo(p2)) === 'Inbox' && (await p2.locator('.bottom-nav button.ativo').innerText()).includes('Movimentações'), 'link direto #/inbox abre o Inbox com Movimentações ativa')
await p2.goBack(); await p2.waitForTimeout(200)
ok((await titulo(p2)) === 'Início', 'voltar a partir de um link direto leva ao Início')
await p2.close()
await cel.close()

// ================= DESKTOP =================
const desk = await novoContexto({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/compras`)
await d.waitForSelector('.sidebar')
ok((await titulo(d)) === 'Compras', 'desktop: link direto #/compras')
ok((await d.locator('.subnav').isVisible().catch(() => false)) === false, 'desktop: sub-navegação escondida (a barra lateral já mostra as telas da área)')
const gd = (await d.locator('.sidebar .sidebar-grupo-titulo').allInnerTexts()).map((g) => g.trim())
ok(JSON.stringify(gd.map((g) => g.toLowerCase())) === JSON.stringify(AREAS6), `desktop: barra lateral em 6 áreas (${gd.join(' · ')})`)
await d.locator('.sidebar-item', { hasText: 'Faturas' }).click()
ok((await titulo(d)) === 'Faturas' && d.url().endsWith('#/faturas'), 'desktop: clicar em Faturas muda a tela e o endereço')
await d.reload()
await d.waitForSelector('.topbar-titulo')
ok((await titulo(d)) === 'Faturas', 'desktop: recarregar mantém a tela pelo endereço')
await desk.close()

ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
