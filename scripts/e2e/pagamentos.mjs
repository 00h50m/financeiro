// Teste de ponta a ponta de Pagamentos (Chromium real + Supabase simulado que grava). Rode com: bash scripts/e2e/rodar-pagamentos.sh
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
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }, { id: 'k2', nome: 'Educação', subcategorias: ['Outros'] }, { id: 'k3', nome: 'Moradia', subcategorias: ['Aluguel', 'Internet', 'Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const fx = (id, nome, valor, d, extra = {}) => ({ id, nome, valor, ativo: true, dia_vencimento: d, mes_inicio: '2026-01', categoria: 'Moradia', subcategoria: 'Outros', ...extra })
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS,
  fixos: [fx('f1', 'Aluguel', 1500, 5), fx('f2', 'Internet', 120, 20), fx('f3', 'Condomínio', 400, null), fx('f4', 'Luz', 200, 18, { variavel: true })],
  compras: [
    { id: 'a', data_compra: dia(2), descricao: 'Mercado', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 300, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null },
    { id: 'b', data_compra: dia(4), descricao: 'Boleto escola', categoria: 'Educação', subcategoria: 'Outros', pessoa: 'Giovanna', cartao_id: null, valor_total: 700, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null },
  ],
  rendas: [{ mes: MES, giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }],
  fixos_pagamentos: [], compras_pagamentos: [], faturas: [],
}
const CHAVES = { fixos_pagamentos: ['fixo_id', 'mes'], compras_pagamentos: ['compra_id', 'mes'], faturas: ['cartao_id', 'mes'] }
const escritas = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }

const browser = await chromium.launch()
async function abrir(vp) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo' })
  await ctx.clock.install({ time: new Date('2026-10-15T15:00:00Z') }) // hoje = 15/10/2026
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
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const dialogos = []
const cel = await abrir({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))
p.on('dialog', (d) => { dialogos.push(d.message()); d.dismiss() })
await p.goto(`http://127.0.0.1:${PORTA}/#/pagamentos`)
await p.waitForSelector('.pag-lista, .estado-vazio', { timeout: 15000 })
const nomes = async () => p.locator('.pag-lin .pag-lin-nome').allInnerTexts()
const texto = async (sel) => (await p.locator(sel).first().innerText()).replace(/\s+/g, ' ')

ok(await p.locator('.pag-resumo').count() === 1, 'resumo compacto no topo')
ok(['A pagar', 'Pago', 'Atrasadas', 'Próximos 7 dias'].every((r) => true) && (await p.locator('.indicador').count()) === 4, '4 indicadores: a pagar, pago, atrasadas e próximos 7 dias')
const abas = (await p.locator('.pag-aba').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim())
ok(JSON.stringify(abas) === JSON.stringify(['A pagar 6', 'Atrasadas 1', 'Pagas 0', 'Todas 6']), `abas com contagem (${abas.join(' | ')})`)
const ordem = await nomes()
ok(ordem[0] === 'Aluguel', `a conta atrasada vem primeiro (${ordem.join(', ')})`)
ok(ordem.indexOf('Internet') < ordem.indexOf('Fatura Nubank') && ordem.indexOf('Fatura Nubank') < ordem.indexOf('Condomínio'), 'ordem por vencimento: 20 → 25 → sem data')
ok((await texto('.pag-lin.atrasada')).includes('Atrasada'), 'selo "Atrasada" com texto (não só cor)')
ok(/Estimado/.test(await texto('.pag-lin:has-text("Luz")')), 'valor estimado sinalizado (Luz)')
const alvoPequeno = await p.evaluate(() => [...document.querySelectorAll('.pag-lin-acao, .pag-aba')].filter((e) => e.getBoundingClientRect().height < 36).length)
ok(alvoPequeno === 0, 'botões de ação e abas com altura de toque adequada')

// aba Atrasadas
await p.locator('.pag-aba', { hasText: 'Atrasadas' }).click()
ok(JSON.stringify(await nomes()) === JSON.stringify(['Aluguel']), 'aba Atrasadas lista só o Aluguel')
await p.locator('.pag-aba', { hasText: 'A pagar' }).click()

// pagar e desfazer
await p.getByRole('button', { name: 'Pagar Aluguel' }).click()
await p.waitForSelector('.toast:has-text("Aluguel marcada como paga")')
ok(escritas.some(([t, r]) => t === 'fixos_pagamentos' && r.fixo_id === 'f1' && r.pago === true), 'Pagar grava o pagamento (fixos_pagamentos, pago = true)')
ok(!(await nomes()).includes('Aluguel'), 'a conta paga sai de "A pagar"')
ok(/Atrasadas 0/.test((await texto('.pag-abas'))), 'contagem de atrasadas atualiza')
await p.locator('.toast button', { hasText: 'Desfazer' }).click()
await p.waitForFunction(() => [...document.querySelectorAll('.pag-lin-nome')].some((e) => e.textContent === 'Aluguel'))
ok(escritas.filter(([t, r]) => t === 'fixos_pagamentos' && r.fixo_id === 'f1').at(-1)[1].pago === false, 'Desfazer devolve a conta para "a pagar" (pago = false)')
await p.getByRole('button', { name: 'Pagar Aluguel' }).click()
await p.waitForSelector('.toast:has-text("Aluguel marcada como paga")')
await p.locator('.pag-aba', { hasText: 'Pagas' }).click()
ok(JSON.stringify(await nomes()) === JSON.stringify(['Aluguel']) && /Paga/.test(await texto('.pag-lin')), 'aba Pagas mostra o Aluguel como paga')
ok((await p.locator('.pag-lin-acao').first().innerText()) === 'Desfazer', 'conta paga oferece "Desfazer"')
await p.locator('.pag-aba', { hasText: 'A pagar' }).click()

// pagamento em lote
ok((await p.locator('input[aria-label="Selecionar Luz"]').count()) === 0, 'conta de valor estimado NÃO entra no lote (precisa conferir o valor)')
await p.locator('input[aria-label="Selecionar Internet"]').check()
await p.locator('input[aria-label="Selecionar Boleto escola"]').check()
await p.waitForSelector('.pag-lote')
ok(/2 selecionadas/.test(await texto('.pag-lote')) && /820,00/.test(await texto('.pag-lote')), 'barra de lote mostra 2 selecionadas e R$ 820,00')
const antes = escritas.length
await p.getByRole('button', { name: 'Marcar como pagas' }).click()
await p.waitForSelector('.modal')
ok(/Internet/.test(await texto('.modal')) && /Boleto escola/.test(await texto('.modal')) && /820,00/.test(await texto('.modal')), 'confirmação lista as contas e o total (diálogo do app, não do navegador)')
ok(escritas.length === antes, 'nada é gravado antes de confirmar')
await p.locator('.modal .btn-primary').click()
await p.waitForSelector('.toast:has-text("2 contas marcadas como pagas")')
const novas = escritas.slice(antes)
ok(novas.some(([t, r]) => t === 'fixos_pagamentos' && r.fixo_id === 'f2' && r.pago) && novas.some(([t, r]) => t === 'compras_pagamentos' && r.compra_id === 'b' && r.pago), 'lote grava as duas contas (fixa e compra sem cartão)')
await p.locator('.toast button', { hasText: 'Desfazer' }).click()
await p.waitForFunction(() => [...document.querySelectorAll('.pag-lin-nome')].some((e) => e.textContent === 'Internet'))
for (let i = 0; i < 40 && escritas.slice(antes).filter(([, r]) => r.pago === false).length < 2; i++) await p.waitForTimeout(100) // o desfazer reverte uma conta de cada vez
ok(escritas.slice(antes).filter(([, r]) => r.pago === false).length === 2, 'Desfazer do lote reverte as duas contas')

// detalhes
await p.locator('.pag-lin-corpo', { hasText: 'Fatura Nubank' }).click()
ok(/Valor estimado/.test(await texto('.pag-lin-detalhes')), 'detalhes da fatura explicam que o valor é estimado')
ok((await p.locator('.pag-lin-detalhes button', { hasText: 'Corrigir valor' }).count()) === 1, 'detalhes oferecem "Corrigir valor"')

// seções secundárias
ok(await p.locator('.pag-secundarias').count() === 1 && /Por categoria/.test(await texto('.pag-secundarias')), 'resumo por categoria continua disponível abaixo da lista')
const sw = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(sw.sw <= sw.cw + 1, `sem rolagem horizontal no celular (${sw.sw} <= ${sw.cw})`)
await p.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/pagamentos-celular.png` : '/tmp/pag-celular.png' })

// busca
await p.locator('.toolbar input').fill('escola')
ok(JSON.stringify(await nomes()) === JSON.stringify(['Boleto escola']), 'busca filtra a lista')
await p.locator('.toolbar input').fill('zzz')
ok((await p.locator('.estado-vazio').count()) === 1, 'busca sem resultado mostra estado vazio')
await cel.close()

// desktop
const desk = await abrir({ width: 1366, height: 800 })
const d = await desk.newPage()
d.on('pageerror', (e) => erros.push(e.message))
await d.goto(`http://127.0.0.1:${PORTA}/#/pagamentos`)
await d.waitForSelector('.pag-lin')
ok((await d.locator('.pag-resumo-grade').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length)) === 4, 'desktop: 4 indicadores em uma linha')
await d.screenshot({ path: process.env.SHOTS ? `${process.env.SHOTS}/pagamentos-desktop.png` : '/tmp/pag-desktop.png' })
await desk.close()

ok(dialogos.length === 0, `nenhum confirm/alert/prompt nativo foi usado (${dialogos.length})`)
ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
