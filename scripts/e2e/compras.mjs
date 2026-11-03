// Teste de ponta a ponta de Compras (Chromium real + Supabase simulado que grava). Rode com: bash scripts/e2e/rodar-compras.sh
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
const MES = '2026-10'
const dia = (m, n) => `${m}-${String(n).padStart(2, '0')}`
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }, { id: 'k2', nome: 'Transporte', subcategorias: ['Combustível'] }, { id: 'k3', nome: 'Lazer', subcategorias: ['Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }, { id: 'p2', nome: 'Sabrina', cor: 'blue', apelidos: [] }]
const compra = (i, o = {}) => ({ id: `c${i}`, data_compra: dia(MES, 1 + (i % 27)), descricao: `Compra ${String(i).padStart(2, '0')}`, categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: PESS[i % 2].nome, cartao_id: 'c1', valor_total: 10 + i, parcelas: 1, origem: i % 5 === 0 ? 'telegram' : 'manual', pago: false, fatura_mes: null, ...o })
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS,
  compras: [...Array.from({ length: 40 }, (_, i) => compra(i)), compra(100, { id: 'antiga', data_compra: '2026-09-10', descricao: 'Compra de setembro', valor_total: 999 }), compra(101, { id: 'parcelada', descricao: 'Geladeira', valor_total: 3000, parcelas: 10, data_compra: dia(MES, 28) })],
  rendas: [], fixos: [], fixos_pagamentos: [], compras_pagamentos: [], faturas: [],
}
const escritas = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
const idsDoFiltro = (q) => { const v = q.get('id') || ''; const m = /^eq\.(.+)$/.exec(v) || /^in\.\((.+)\)$/.exec(v); return m ? m[1].split(',') : [] }

const browser = await chromium.launch()
async function abrir(vp) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo' })
  await ctx.clock.install({ time: new Date('2026-10-15T15:00:00Z') })
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(); const url = new URL(req.url())
    const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' }, body: JSON.stringify(b) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (url.pathname.startsWith('/auth/v1')) return json({ user: sessao.user })
    if (url.pathname.includes('/rpc/')) return json({})
    const tabela = url.pathname.replace('/rest/v1/', '')
    if (req.method() === 'GET') return json(DB[tabela] || [])
    if (tabela === 'compras' && req.method() === 'PATCH') {
      const dados = JSON.parse(req.postData() || '{}'); const ids = idsDoFiltro(url.searchParams)
      escritas.push(['PATCH', ids, dados])
      DB.compras = DB.compras.map((c) => (ids.includes(c.id) ? { ...c, ...dados } : c))
      return json([])
    }
    if (tabela === 'compras' && req.method() === 'DELETE') {
      const ids = idsDoFiltro(url.searchParams); escritas.push(['DELETE', ids])
      DB.compras = DB.compras.filter((c) => !ids.includes(c.id))
      return json([])
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
await p.goto(`http://127.0.0.1:${PORTA}/#/compras`)
await p.waitForSelector('.cmp-lin')
const nomes = async () => p.locator('.cmp-lin .cmp-nome').allInnerTexts()
const texto = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ')

ok((await p.locator('table').count()) === 0 && (await p.locator('.cmp-lin').count()) > 0, 'lista enxuta no lugar da tabela')
ok((await p.locator('.cmp-lin').count()) === 30, `primeiro mês mostra 30 compras e o resto fica para "Mostrar mais" (${await p.locator('.cmp-lin').count()})`)
const primeira = await texto('.cmp-lin')
ok(/Compra|Geladeira/.test(primeira) && /Alimentação/.test(primeira) && /Giovanna|Sabrina/.test(primeira) && /Nubank/.test(primeira) && /R\$/.test(primeira), 'a linha mostra descrição, categoria, pessoa, forma de pagamento e valor')
ok(/10x/.test(await texto('.cmp-lin:has-text("Geladeira")')), 'compra parcelada sinalizada (10x)')
const altLinha = await p.locator('.cmp-corpo').first().evaluate((e) => e.getBoundingClientRect().height)
ok(altLinha >= 44, `linha com altura de toque (${Math.round(altLinha)} px)`)
await p.locator('.cmp-mais').click()
ok((await p.locator('.cmp-lin').count()) === 41 && (await p.locator('.cmp-mais').count()) === 0, 'Mostrar mais completa o mês (41 compras)')

// ordenação
await p.locator('.cmp-ordem').selectOption('valor_desc')
ok((await nomes())[0] === 'Geladeira', 'ordenar por maior valor põe a Geladeira (R$ 3.000) primeiro')
await p.locator('.cmp-ordem').selectOption('valor_asc')
ok((await nomes())[0] === 'Compra 00', 'ordenar por menor valor')
await p.locator('.cmp-ordem').selectOption('data_desc')

// filtro de origem
await p.getByRole('button', { name: /Filtros/ }).click()
await p.locator('select[aria-label="Filtrar por origem"]').selectOption('telegram')
const telegram = await nomes()
ok(telegram.length === 9 && telegram.includes('Compra de setembro') && telegram.every((n) => /Compra (00|05|10|15|20|25|30|35|de setembro)/.test(n)), `filtro por origem Telegram: as 8 deste mês + 1 de setembro (${telegram.length} compras)`)
await p.locator('select[aria-label="Filtrar por origem"]').selectOption('')
await p.getByRole('button', { name: /Filtros/ }).click()

// detalhes e edição rápida de categoria
await p.locator('.cmp-corpo', { hasText: 'Compra 03' }).click()
ok(/Alimentação › Mercado/.test(await texto('.cmp-detalhes')) && /Nubank/.test(await texto('.cmp-detalhes')), 'detalhes mostram categoria › subcategoria e pagamento')
ok(await p.getByRole('button', { name: 'Salvar categoria' }).isDisabled(), '"Salvar categoria" só habilita quando há mudança')
await p.locator('.cmp-rapida select[aria-label="Categoria"]').selectOption('Transporte')
ok(await p.getByRole('button', { name: 'Salvar categoria' }).isDisabled(), 'ao trocar a categoria a subcategoria fica para você escolher')
await p.locator('.cmp-rapida select[aria-label="Subcategoria"]').selectOption('Combustível')
await p.getByRole('button', { name: 'Salvar categoria' }).click()
for (let i = 0; i < 40 && !escritas.some(([m, ids]) => m === 'PATCH' && ids.includes('c3')); i++) await p.waitForTimeout(100)
ok(escritas.some(([m, ids, d]) => m === 'PATCH' && ids.includes('c3') && d.categoria === 'Transporte' && d.subcategoria === 'Combustível'), 'edição rápida grava categoria e subcategoria')

// renomear (diálogo do app)
await p.locator('.cmp-corpo', { hasText: 'Compra 04' }).click()
await p.locator('.cmp-lin:has-text("Compra 04") >> button', { hasText: 'Renomear' }).click()
await p.waitForSelector('.modal input')
await p.locator('.modal input').fill('Mercado do mês')
await p.locator('.modal .btn-primary').click()
await p.waitForFunction(() => [...document.querySelectorAll('.cmp-nome')].some((e) => e.textContent === 'Mercado do mês'))
ok(escritas.some(([m, ids, d]) => m === 'PATCH' && ids.includes('c4') && d.identificacao === 'Mercado do mês'), 'renomear grava a identificação')

// excluir com confirmação
await p.locator('.cmp-corpo', { hasText: 'Compra 06' }).click()
const antesDel = escritas.length
await p.locator('.cmp-lin:has-text("Compra 06") >> button', { hasText: 'Excluir' }).click()
await p.waitForSelector('.modal')
ok(/Compra 06/.test(await texto('.modal')) && escritas.length === antesDel, 'excluir pede confirmação (diálogo do app) e não apaga antes')
await p.locator('.modal .btn-danger').click()
await p.waitForFunction(() => ![...document.querySelectorAll('.cmp-nome')].some((e) => e.textContent === 'Compra 06'))
ok(escritas.some(([m, ids]) => m === 'DELETE' && ids.includes('c6')), 'excluir apaga a compra')
ok(await p.locator('.toast:has-text("apagada")').count() === 1, 'oferece desfazer a exclusão')

// seleção em lote
ok((await p.locator('.cmp-check').count()) === 0, 'sem modo de seleção a lista não mostra caixas (menos poluição)')
await p.getByRole('button', { name: 'Selecionar' }).click()
await p.locator('input[aria-label="Selecionar Compra 01"]').check()
await p.locator('input[aria-label="Selecionar Compra 02"]').check()
await p.waitForSelector('.barra-flutuante')
ok(/2 selecionadas/.test(await texto('.barra-flutuante')) && /23,00/.test(await texto('.barra-flutuante')), 'barra de lote: 2 selecionadas e a soma (R$ 23,00)')
await p.locator('.barra-flutuante select[aria-label="Nova categoria"]').selectOption('Lazer')
const antesLote = escritas.length
await p.getByRole('button', { name: 'Aplicar' }).click()
await p.waitForSelector('.modal')
ok(escritas.length === antesLote, 'nada é gravado antes de confirmar o lote')
await p.locator('.modal .btn-primary').click()
await p.waitForFunction(() => document.querySelectorAll('.barra-flutuante').length === 0)
const lote = escritas.slice(antesLote).find(([m]) => m === 'PATCH')
ok(lote && lote[1].includes('c1') && lote[1].includes('c2') && lote[2].categoria === 'Lazer', 'lote troca a categoria das duas compras')

// mês antigo recolhido + limpeza
ok((await p.locator('.grupo-cab').count()) === 2 && (await p.locator('.cmp-lista').count()) === 1, 'meses anteriores ficam recolhidos por padrão')
const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(sw.sw <= sw.cw + 1, `sem rolagem horizontal no celular (${sw.sw} <= ${sw.cw})`)
await p.locator('.cmp-corpo').first().scrollIntoViewIfNeeded()
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/compras-celular.png` : '/tmp/compras-celular.png' })
await cel.close()

const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/compras`)
await d.waitForSelector('.cmp-lin')
ok(await d.locator('.cmp-data').first().isVisible() && await d.locator('.cmp-meta').first().isVisible(), 'desktop: data, categoria, pessoa e pagamento visíveis na linha')
await d.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/compras-desktop.png` : '/tmp/compras-desktop.png' })
await desk.close()

ok(dialogos.length === 0, `nenhum confirm/alert/prompt nativo foi usado (${dialogos.length})`)
ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
