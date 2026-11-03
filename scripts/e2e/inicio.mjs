// Teste de ponta a ponta do Início (Chromium real + Supabase simulado). Rode com: bash scripts/e2e/rodar-inicio.sh
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
const dia = (n) => `${MES}-${String(n).padStart(2, '0')}`
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }, { id: 'c2', nome: 'Inter', titular: 'Giovanna', fechamento: 20, vencimento: 28, ativo: true, limite: 5000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }, { id: 'k2', nome: 'Moradia', subcategorias: ['Aluguel', 'Internet'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const compra = (id, cartao, valor) => ({ id, data_compra: dia(2), descricao: `Compra ${id}`, categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: cartao, valor_total: valor, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null })
const fx = (id, nome, valor, d) => ({ id, nome, valor, ativo: true, dia_vencimento: d, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Internet' })
const evento = (i) => ({ id: `e${i}`, origem: 'telegram', status: 'pendente', descricao_original: `Evento ${i}`, descricao_normalizada: null, valor: 10 + i, data_evento: '2026-10-14', parcelas: 1, capturado_em: '2026-10-14T10:00:00Z', forma_pagamento: 'cartao', estabelecimento_chave: `e${i}` })
const RENDA = { mes: MES, giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS, rendas: [RENDA], fixos_pagamentos: [], compras_pagamentos: [],
  fixos: [fx('f1', 'Aluguel', 1500, 5), fx('f2', 'Internet', 120, 20)],
  compras: [compra('n1', 'c1', 300), compra('i1', 'c2', 500)],
  faturas: [{ id: 'f-inter', cartao_id: 'c2', mes: MES, valor_real: 650, pago: false }],
  importacoes_fatura: [{ id: 'L1', cartao_id: 'c2', mes: MES, arquivo_nome: 'x.csv', origem_leitura: 'csv', status_importacao: 'concluida', status_conciliacao: 'parcial', concluida_em: '2026-10-10T10:00:00Z', linhas: [], decisoes: {} }],
  eventos_financeiros: [evento(1), evento(2), evento(3)],
}
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
    if (req.method() === 'GET') return json(DB[url.pathname.replace('/rest/v1/', '')] || [])
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
await p.goto(`http://127.0.0.1:${PORTA}/#/inicio`)
await p.waitForSelector('.ini-hero')
const texto = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ')

const hero = await texto('.ini-hero')
ok(/Livre para gastar/i.test(hero) && /R\$\s?\d/.test(hero), 'hero: "Livre para gastar" com o valor')
ok(/Estimativa/.test(hero) && /Não é o saldo da conta/.test(hero), 'hero deixa claro que é estimativa e não o saldo da conta')
ok(/Disponível agora/i.test(hero) && /A pagar/i.test(hero) && /Comprometido/i.test(hero), 'três números de apoio: disponível agora, a pagar e comprometido')
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/inicio-celular-topo.png` : '/tmp/inicio-celular-topo.png' })
const hh = await p.locator('.ini-hero').evaluate((e) => e.getBoundingClientRect().height)
ok(hh < 420, `hero compacto no celular (${Math.round(hh)} px)`)

const titulos = await p.locator('.ini-aten-titulo').allInnerTexts()
ok(titulos[0] === '1 conta vencida', `a conta vencida vem primeiro (${titulos.join(' | ')})`)
ok(titulos.some((t) => /Fatura Inter com diferença/.test(t)) && titulos.some((t) => /3 compras aguardando confirmação/.test(t)) && titulos.some((t) => /fatura importada para conciliar/.test(t)), 'atenção inclui fatura com diferença, Inbox e fatura para conciliar')
ok((await p.locator('.ini-aten-item').count()) === 4 && /Ver todas \(5\)/.test(await texto('.ini-atencao2')), 'mostra 4 itens e "Ver todas (5)"')
const topo = await p.locator('.ini-aten-item').first().evaluate((e) => e.getBoundingClientRect().bottom)
ok(topo < 844 - 64, `o primeiro item de atenção aparece sem rolar (termina em ${Math.round(topo)} px)`)
await p.getByRole('button', { name: /Ver todas/ }).click()
ok((await p.locator('.ini-aten-item').count()) === 5, '"Ver todas" mostra os 5 itens')

ok((await p.locator('.so-mob .ini-btn').count()) === 5, 'cinco ações rápidas (gasto, entrada, pagamento, importar, pendências)')
ok(/Próximos pagamentos/.test(await texto('.ini-contas')), 'bloco "Próximos pagamentos"')
ok((await p.locator('details.ini-linha-det').count()) === 1 && !(await p.locator('details.ini-linha-det').evaluate((e) => e.open)), 'linha do mês recolhida (um toque para abrir)')

// navegação pelas ações
await p.locator('.ini-aten-item', { hasText: 'vencida' }).getByRole('button', { name: 'Pagar' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Pagamentos')
ok(p.url().endsWith('#/pagamentos'), 'Pagar leva a Pagamentos')
await p.goBack(); await p.waitForSelector('.ini-hero')
await p.getByRole('button', { name: /Ver todas/ }).click()
await p.locator('.ini-aten-item', { hasText: 'aguardando confirmação' }).getByRole('button', { name: 'Revisar' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Inbox')
ok(p.url().endsWith('#/inbox'), 'Revisar leva ao Inbox')
await p.goBack(); await p.waitForSelector('.ini-hero')
await p.locator('.so-mob').getByRole('button', { name: 'Importar fatura' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Importar fatura')
ok(true, 'ação rápida "Importar fatura" abre o assistente')
await p.goBack(); await p.waitForSelector('.ini-hero')

const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(sw.sw <= sw.cw + 1, `sem rolagem horizontal no celular (${sw.sw} <= ${sw.cw})`)
const peq = await p.evaluate(() => [...document.querySelectorAll('.ini-aten-acao, .so-mob .ini-btn')].filter((e) => e.getBoundingClientRect().height < 36).length)
ok(peq === 0, 'botões de ação com altura de toque adequada')
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/inicio-celular.png` : '/tmp/inicio-celular.png' })

// sem renda: não apresenta projeção como fato
DB.rendas = []
await p.reload(); await p.waitForSelector('.ini-hero')
const semRenda = await texto('.ini-hero')
ok(/—/.test(semRenda) && /Cadastre a renda do mês/.test(semRenda), 'sem renda: o número vira "—" e pede a renda (não mostra projeção como fato)')
ok((await p.locator('.ini-aten-titulo', { hasText: 'Renda do mês não cadastrada' }).count()) === 1, 'sem renda: item de atenção "Renda do mês não cadastrada"')
await cel.close()

DB.rendas = [RENDA]
const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/inicio`)
await d.waitForSelector('.ini-hero')
const [yh, ya] = await Promise.all([d.locator('.ini-hero').evaluate((e) => e.getBoundingClientRect().top), d.locator('.ini-atencao2').evaluate((e) => e.getBoundingClientRect().top)])
ok(Math.abs(yh - ya) < 4, 'desktop: situação e atenção lado a lado')
ok(/% da entrada de R\$\s?8\.000,00/.test((await d.locator('.ini-hero').innerText()).replace(/\s+/g, ' ')), 'desktop: comprometido mostra a % da entrada')
ok((await d.locator('.so-desk .ini-btn').count()) === 4 && await d.locator('.so-desk').isVisible(), 'desktop: quatro ações rápidas no topo (as pendências já estão em "Precisa da sua atenção")')
const altTopo = await d.locator('.ini-topo').evaluate((e) => e.getBoundingClientRect().height)
ok(altTopo < 90, `desktop: ações numa linha só (${Math.round(altTopo)} px)`)
await d.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/inicio-desktop.png` : '/tmp/inicio-desktop.png' })
await desk.close()

ok(dialogos.length === 0, `nenhum confirm/alert/prompt nativo foi usado (${dialogos.length})`)
ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
