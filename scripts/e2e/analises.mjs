// Teste de ponta a ponta de Análises e do Calendário em Pagamentos (Chromium real + Supabase simulado). Rode com: bash scripts/e2e/rodar-analises.sh
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
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }, { id: 'k2', nome: 'Moradia', subcategorias: ['Aluguel'] }, { id: 'k3', nome: 'Lazer', subcategorias: ['Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }, { id: 'p2', nome: 'Sabrina', cor: 'blue', apelidos: [] }]
const compra = (id, cat, valor, pessoa) => ({ id, data_compra: dia(2), descricao: `Compra ${id}`, categoria: cat, subcategoria: 'x', pessoa, cartao_id: 'c1', valor_total: valor, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null })
const fx = (id, nome, valor, d) => ({ id, nome, valor, ativo: true, dia_vencimento: d, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Aluguel' })
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS, fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [],
  rendas: [{ mes: MES, giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }],
  fixos: [fx('f1', 'Aluguel', 1500, 5), fx('f2', 'Internet', 120, 20)],
  compras: [compra('a', 'Alimentação', 800, 'Giovanna'), compra('b', 'Lazer', 100, 'Sabrina')],
  orcamentos: [{ categoria: 'Alimentação', valor: 500 }, { categoria: 'Lazer', valor: 400 }],
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
const aba = async () => (await p.locator('.analises-abas .pag-aba.ativa').innerText()).trim()
const semRolagem = async () => { const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); return m.sw <= m.cw + 1 }
await p.goto(`http://127.0.0.1:${PORTA}/#/analises`)
await p.waitForSelector('.analises-abas')

const tabs = (await p.locator('.analises-abas .pag-aba').allInnerTexts()).map((t) => t.trim())
ok(JSON.stringify(tabs) === JSON.stringify(['Visão geral', 'Evolução', 'Categorias', 'Pessoas', 'Compromissos', 'Orçado × realizado']), `seis abas (${tabs.join(' · ')})`)
ok((await aba()) === 'Visão geral', 'abre em Visão geral')
const kpis = (await p.locator('.kpi-faixa').innerText()).replace(/\s+/g, ' ')
ok(/Renda do mês/i.test(kpis) && /Comprometido/i.test(kpis) && /Sobra prevista do mês/i.test(kpis) && /Resultado do mês/i.test(kpis), 'Visão geral: renda, comprometido, sobra prevista e resultado do mês')
ok(!/Já pago|Disponível agora|A pagar/i.test(kpis), 'Visão geral não repete os números de Início e Pagamentos (já pago, disponível agora, a pagar)')
ok(await semRolagem(), 'Visão geral sem rolagem horizontal no celular')
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/analises-visao.png` : '/tmp/analises-visao.png' })

// cada aba
for (const [rotulo, seletor, msg] of [['Evolução', '.grafico-card', 'Evolução mostra gráficos'], ['Categorias', '.grafico-card', 'Categorias mostra gráficos'], ['Pessoas', '.grafico-card, .card', 'Pessoas mostra o gasto por pessoa'], ['Compromissos', '.grafico-card', 'Compromissos mostra a projeção']]) {
  await p.locator('.analises-abas .pag-aba', { hasText: rotulo }).click()
  await p.waitForSelector(seletor)
  ok((await aba()) === rotulo && (await semRolagem()), `${msg}, sem rolagem horizontal`)
}
ok(p.url().endsWith('#/analises/compromissos'), 'o endereço acompanha a aba (#/analises/compromissos)')

// orçado × realizado
await p.locator('.analises-abas .pag-aba', { hasText: 'Orçado' }).click()
await p.waitForSelector('.orc-lista')
const orc = (await p.locator('.orc-lista').innerText()).replace(/\s+/g, ' ')
ok(/Alimentação/.test(orc) && /Estourou/.test(orc) && /passou/.test(orc), 'Orçado × realizado: Alimentação estourou o teto (gasto 800 de 500)')
ok(/Dentro do teto|Lazer/.test(orc), 'Orçado × realizado lista a categoria dentro do teto')
const res = (await p.locator('.orc-resumo').innerText()).replace(/\s+/g, ' ')
ok(/Orçado/i.test(res) && /Realizado/i.test(res) && /Estouradas/i.test(res), 'resumo: orçado, realizado e estouradas')
ok(await p.locator('.orc-barra[role=img]').count() === 2 && /gastou/.test(await p.locator('.orc-barra').first().getAttribute('aria-label')), 'barras com texto acessível (não dependem só da cor)')
ok(await semRolagem(), 'Orçado × realizado sem rolagem horizontal')
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/analises-orcado.png` : '/tmp/analises-orcado.png' })
await p.reload(); await p.waitForSelector('.analises-abas')
ok((await aba()).startsWith('Orçado'), 'recarregar mantém a aba pelo endereço')

// sem teto: estado vazio com ação
DB.orcamentos = []
await p.reload(); await p.waitForSelector('.analises-abas')
ok((await p.locator('.estado-vazio', { hasText: 'Nenhum teto definido' }).count()) === 1, 'sem tetos: estado vazio explicando o que fazer')
await p.getByRole('button', { name: 'Abrir Orçamento' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Orçamento')
ok(true, 'o estado vazio leva ao Orçamento')
DB.orcamentos = [{ categoria: 'Alimentação', valor: 500 }, { categoria: 'Lazer', valor: 400 }]

// endereços antigos
for (const [hash, esperada] of [['#/dashboard', 'Visão geral'], ['#/graficos', 'Evolução'], ['#/evolucao', 'Evolução'], ['#/porpessoa', 'Pessoas']]) {
  await p.goto(`http://127.0.0.1:${PORTA}/${hash}`); await p.waitForSelector('.analises-abas')
  ok((await aba()) === esperada, `${hash} abre Análises > ${esperada}`)
}

// calendário em pagamentos
await p.goto(`http://127.0.0.1:${PORTA}/#/pagamentos`); await p.waitForSelector('.pag-lin, .estado-vazio')
await p.getByRole('button', { name: 'Calendário' }).click()
await p.waitForSelector('.cal-grade')
ok(p.url().endsWith('#/pagamentos/calendario'), 'Calendário é uma visão de Pagamentos (#/pagamentos/calendario)')
ok((await p.locator('.cal-cab span').count()) === 7 && (await p.locator('.cal-dia').count()) === 31, 'grade com 7 colunas e 31 dias (outubro)')
ok((await p.locator('.cal-dia.atrasada').count()) >= 1 && (await p.locator('.cal-dia.aberta').count()) >= 1, 'dias com estado: atrasada (dia 5) e a pagar (dia 20)')
ok(await p.locator('.cal-dia.hoje').getAttribute('aria-label').then((t) => /hoje/.test(t)), 'o dia de hoje é identificado (também para leitor de tela)')
await p.locator('.cal-dia', { hasText: /^5$/ }).first().click()
ok(/Aluguel/.test(await p.locator('.cal-dia-detalhe').innerText()) && /atrasado/.test(await p.locator('.cal-dia-detalhe').innerText()), 'tocar no dia 5 mostra o Aluguel como atrasado')
const alvo = await p.locator('.cal-dia').first().evaluate((e) => e.getBoundingClientRect().height)
ok(alvo >= 44, `célula do dia com área de toque (${Math.round(alvo)} px)`)
ok(await semRolagem(), 'calendário sem rolagem horizontal no celular')
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/calendario-celular.png` : '/tmp/calendario-celular.png' })
await p.locator('.cal-dia-detalhe').getByRole('button', { name: /Abrir/ }).first().click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Pagamentos')
await p.goto(`http://127.0.0.1:${PORTA}/#/pagamentos/calendario`); await p.waitForSelector('.cal-grade')
await p.getByRole('button', { name: 'Contas', exact: true }).click()
await p.waitForSelector('.pag-lista')
ok(p.url().endsWith('#/pagamentos'), 'voltar para "Contas" restaura a lista')
await cel.close()

// Visão geral no desktop: comparação com a média só com base suficiente
const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/analises`)
await d.waitForSelector('.analises-abas')
const dash = (await d.locator('.analises').innerText()).replace(/\s+/g, ' ')
ok(/histórico insuficiente/.test(dash) && !/↑ \d{3,}%/.test(dash), 'desktop: sem histórico suficiente mostra "histórico insuficiente" (nada de "↑ 400%")')
await d.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/analises-desktop.png` : '/tmp/analises-desktop.png' })
await desk.close()

ok(dialogos.length === 0, `nenhum confirm/alert/prompt nativo foi usado (${dialogos.length})`)
ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
