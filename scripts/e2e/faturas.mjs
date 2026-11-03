// Teste de ponta a ponta de Faturas (Chromium real + Supabase simulado que grava). Rode com: bash scripts/e2e/rodar-faturas.sh
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
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }, { id: 'c2', nome: 'Inter', titular: 'Giovanna', fechamento: 20, vencimento: 5, ativo: true, limite: 5000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const compra = (id, cartao, valor, data = `${MES}-02`) => ({ id, data_compra: data, descricao: `Compra ${id}`, categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: cartao, valor_total: valor, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null })
const lote = (cartao, status) => ({ id: `L-${cartao}`, cartao_id: cartao, mes: MES, arquivo_nome: 'fatura.csv', origem_leitura: 'csv', status_importacao: 'concluida', status_conciliacao: status, concluida_em: '2026-10-10T10:00:00Z', linhas: [], decisoes: {} })
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS, fixos: [], rendas: [], fixos_pagamentos: [], compras_pagamentos: [],
  compras: [compra('n1', 'c1', 300), compra('i1', 'c2', 500)],
  faturas: [{ id: 'f-inter', cartao_id: 'c2', mes: MES, valor_real: 650, pago: false }],
  importacoes_fatura: [lote('c1', 'conciliada'), lote('c2', 'parcial')],
}
const CHAVES = { faturas: ['cartao_id', 'mes'] }
const escritas = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }

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
    const corpo = JSON.parse(req.postData() || 'null')
    if (req.method() === 'POST' && CHAVES[tabela]) {
      for (const r of [].concat(corpo)) {
        escritas.push([tabela, r])
        const [k1, k2] = CHAVES[tabela]
        const i = DB[tabela].findIndex((x) => x[k1] === r[k1] && x[k2] === r[k2])
        if (i >= 0) DB[tabela][i] = { ...DB[tabela][i], ...r }; else DB[tabela].push({ id: `${tabela}-${DB[tabela].length}`, ...r })
      }
      return json([])
    }
    if (req.method() === 'PATCH' && tabela === 'faturas') { escritas.push(['PATCH faturas', corpo]); return json([]) }
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
await p.goto(`http://127.0.0.1:${PORTA}/#/faturas`)
await p.waitForSelector('.fat-card')
const texto = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ')
const card = (nome) => p.locator('.fat-card', { has: p.locator(`h3:text-is("${nome}")`) })
const nomes = async () => p.locator('.fat-card-nome').allInnerTexts()

ok((await p.locator('.fat-card').count()) === 2, 'visão por mês: um card por cartão')
ok(JSON.stringify(await nomes()) === JSON.stringify(['Inter', 'Nubank']), 'a fatura vencida vem primeiro (Inter)')
const inter = (await card('Inter').innerText()).replace(/\s+/g, ' ')
ok(/Valor real informado/.test(inter) && /Faltam identificar R\$\s?150,00/.test(inter) && /Conciliação parcial/.test(inter) && /Vencida/.test(inter), 'Inter: quatro estados independentes (valor real, faltam identificar, conciliação parcial, vencida)')
const nu = (await card('Nubank').innerText()).replace(/\s+/g, ' ')
ok(/Valor estimado/.test(nu) && /Fatura conciliada/.test(nu) && /A pagar/.test(nu), 'Nubank: valor estimado, fatura conciliada e a pagar convivem')
ok(/Lançado no app\s*R\$\s?800,00/i.test(await texto('.fat-resumo')) && /650,00/.test(await texto('.fat-resumo')) && /150,00/.test(await texto('.fat-resumo')) && /0\/2/.test(await texto('.fat-resumo')), 'resumo do mês: lançado 800, banco 650, diferença +150, pagas 0/2')

// registrar pagamento
await card('Inter').getByRole('button', { name: 'Registrar pagamento' }).click()
await card('Inter').getByRole('button', { name: 'Desfazer pagamento' }).waitFor()
ok(escritas.some(([t, r]) => t === 'faturas' && r.cartao_id === 'c2' && r.pago === true && r.mes === MES), 'Registrar pagamento grava a fatura como paga')
ok(/Paga/.test((await card('Inter').innerText())) && /1\/2/.test(await texto('.fat-resumo')), 'estado de pagamento e resumo atualizam (Pagas 1/2)')
ok(!/Faltam identificar/.test('') && /Faltam identificar/.test(await card('Inter').innerText()), 'pagar não apaga os outros estados (a diferença continua visível)')
await card('Inter').getByRole('button', { name: 'Desfazer pagamento' }).click()
await card('Inter').getByRole('button', { name: 'Registrar pagamento' }).waitFor()
ok(escritas.filter(([t, r]) => t === 'faturas' && r.cartao_id === 'c2').at(-1)[1].pago === false, 'Desfazer pagamento reverte')

// ver compras
await card('Nubank').getByRole('button', { name: /Ver compras/ }).click()
ok(/Compra n1/.test(await texto('.fat-compras')), 'Ver compras mostra o que compõe a fatura')
await card('Nubank').getByRole('button', { name: /Ver compras/ }).click()

// informar valor real (modal existente)
await card('Nubank').getByRole('button', { name: 'Informar valor real' }).click()
await p.waitForSelector('.modal')
await p.locator('.modal input[inputmode], .modal input[type=text], .modal input[type=number]').first().fill('300')
await p.getByRole('button', { name: 'Salvar fatura' }).click()
await p.waitForFunction(() => document.querySelectorAll('.modal').length === 0)
for (let i = 0; i < 40 && !escritas.some(([t, r]) => t === 'faturas' && r.cartao_id === 'c1' && Number(r.valor_real) === 300); i++) await p.waitForTimeout(100)
ok(escritas.some(([t, r]) => t === 'faturas' && r.cartao_id === 'c1' && Number(r.valor_real) === 300), 'informar valor real grava o valor do banco do Nubank')
await p.waitForFunction(() => [...document.querySelectorAll('.fat-card')].some((c) => c.innerText.includes('Nubank') && c.innerText.includes('Valor real informado')))
ok(/Sem diferença/.test((await card('Nubank').innerText())), 'com o valor real igual ao lançado o Nubank fica "Sem diferença"')

// importar / conciliar
await card('Inter').getByRole('button', { name: 'Conciliar' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Importar fatura')
ok(p.url().endsWith('#/importar'), 'Conciliar leva ao assistente de importação (#/importar)')
await p.goBack(); await p.waitForSelector('.fat-card')

// outros meses e navegação de mês
ok((await p.locator('details.fat-secundaria > summary').allInnerTexts()).join('|') === 'Compromissos a longo prazo|Outros meses', 'longo prazo e outros meses ficam recolhidos em seções secundárias')
ok(await p.locator('.nav-mes button').first().isDisabled(), 'não deixa voltar para antes do início do app (Out/26)')
await p.locator('.nav-mes button').last().click()
await p.waitForFunction(() => /Nov\/26/i.test(document.querySelector('.nav-mes-nome')?.textContent || ''))
ok(true, 'navegar para o mês seguinte (Nov/26)')
await p.locator('.nav-mes button').first().click()

// todos os meses (visão antiga preservada)
await p.getByRole('button', { name: 'Todos os meses' }).click()
ok((await p.locator('.grupo-mes').count()) > 0 && (await p.locator('.toolbar input').count()) > 0, 'visão "Todos os meses" preserva a tabela com busca e filtros')
await p.getByRole('button', { name: 'Por mês' }).click()

const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(sw.sw <= sw.cw + 1, `sem rolagem horizontal no celular (${sw.sw} <= ${sw.cw})`)
const peq = await p.evaluate(() => [...document.querySelectorAll('.fat-acoes .btn')].filter((e) => e.getBoundingClientRect().height < 36).length)
ok(peq === 0, 'botões de ação com altura de toque adequada')
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/faturas-celular.png` : '/tmp/faturas-celular.png' })
await cel.close()

const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/faturas`)
await d.waitForSelector('.fat-card')
ok((await d.locator('.fat-cards').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)) === 2, 'desktop: cards em duas colunas')
await d.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/faturas-desktop.png` : '/tmp/faturas-desktop.png' })
await desk.close()

ok(dialogos.length === 0, `nenhum confirm/alert/prompt nativo foi usado (${dialogos.length})`)
ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
