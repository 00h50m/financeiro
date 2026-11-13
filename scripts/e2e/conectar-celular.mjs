// Teste de Automações: conectar o celular pelo app (gerar token, copiar corpo da macro, testar conexão). Rode com: bash scripts/e2e/rodar-conectar-celular.sh
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
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }, { id: 'c2', nome: 'Mercado Pago', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 3000 }]
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado'] }, { id: 'k2', nome: 'Assinaturas', subcategorias: ['Outros'] }]
const PESS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const fx = (id, nome, valor, extra) => ({ id, nome, valor, ativo: true, dia_vencimento: 10, mes_inicio: '2026-01', categoria: 'Assinaturas', subcategoria: 'Outros', pessoa: 'Giovanna', ...extra })
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS, rendas: ['2026-09', '2026-10', '2026-11', '2026-12'].map((mes) => ({ mes, giovanna: 8000, sabrina: 3000, extra_sabrina: 0, mesada: 0, outros: 0 })),
  fixos: [fx('fn', 'Netflix', 59.9, { cartao_id: 'c1', variavel: true }), fx('fs', 'Spotify', 21.9, { cartao_id: null, variavel: false }), fx('fa', 'Aluguel', 1800, { categoria: 'Moradia', subcategoria: 'Aluguel', pessoa: null, mes_fim: '2026-09' }), fx('fl', 'Luz', 210, { variavel: true, categoria: 'Moradia', subcategoria: 'Luz', dia_vencimento: 12 })],
  fixos_valores: [], orcamentos: [{ id: 'o1', categoria: 'Alimentação', valor: 500 }], metas: [{ id: 'm1', nome: 'Viagem', tipo: 'objetivo', valor_alvo: 3000, prazo: null, prioridade: 2, ativa: true }], metas_movimentos: [{ id: 'mv1', meta_id: 'm1', data: '2026-10-10', tipo: 'aporte', valor: 750 }], fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [], importacoes_fatura: [], compras: [{ id: 'cc1', data_compra: '2026-10-20', descricao: 'MERCADO', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 620, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null }],
}
DB.divisoes = []
DB.divisoes_repasses = []
DB.config = []
DB.dispositivos_android = []
const escritas = []; const rpcs = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
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
    if (req.method() === 'GET') return json(DB[tabela] || [])
    if (['fixos_valores', 'fixos', 'rendas', 'orcamentos', 'metas_movimentos', 'divisoes_repasses', 'divisoes', 'config'].includes(tabela) && ['POST', 'PATCH'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const TOKEN = 'fin_' + 'a1b2c3d4'.repeat(6)
const chamadas = []
for (const [nome, vp] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  chamadas.length = 0
  const ctx = await abrir(vp)
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: `http://127.0.0.1:${PORTA}` }).catch(() => {})
  await ctx.route(`http://127.0.0.1:${PORTA}/api/android-token`, async (route) => {
    const corpo = JSON.parse(route.request().postData() || '{}'); chamadas.push(['android-token', corpo, route.request().headers().authorization])
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, token: TOKEN }) })
  })
  await ctx.route(`http://127.0.0.1:${PORTA}/api/notificacao`, async (route) => {
    const corpo = JSON.parse(route.request().postData() || '{}'); chamadas.push(['notificacao', corpo])
    return route.fulfill({ status: corpo.token === TOKEN ? 200 : 401, contentType: 'application/json', body: JSON.stringify({ ok: corpo.token === TOKEN, teste: true }) })
  })
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(`http://127.0.0.1:${PORTA}/#/automacoes`)
  await p.waitForSelector('.conectar-celular')
  ok((await p.locator('.cc-codigo').count()) === 0, `${nome}: antes de gerar não mostra token nem corpo`)
  await p.getByRole('button', { name: 'Gerar o token do meu celular' }).click()
  await p.waitForSelector('.cc-codigo')
  const textos = await p.locator('.cc-codigo').allInnerTexts()
  ok(textos[0] === TOKEN, `${nome}: mostra o token gerado`)
  ok(/\/api\/notificacao$/.test(textos[1]), `${nome}: mostra o endereço certo (${textos[1]})`)
  ok(textos[2].startsWith(`token: ${TOKEN}`) && /app: \[nome do aplicativo\]/.test(textos[2]) && /texto: \[texto da notificação\]/.test(textos[2]), `${nome}: corpo da macro já vem com o token preenchido`)
  ok(chamadas[0]?.[0] === 'android-token' && chamadas[0][1].acao === 'gerar' && /^Bearer /.test(chamadas[0][2] || ''), `${nome}: pede o token ao servidor com o login e a ação "gerar"`)
  await p.locator('.conectar-celular').getByRole('button', { name: 'Copiar' }).first().click()
  await p.locator('.conectar-celular .cc-rotulo', { hasText: '✓ Copiado' }).waitFor()
  ok((await p.evaluate(() => navigator.clipboard.readText())) === TOKEN, `${nome}: "Copiar" coloca o token na área de transferência e confirma com ✓ Copiado`)
  await p.getByRole('button', { name: 'Testar conexão' }).click()
  await p.getByText(/Conexão OK/).waitFor()
  const t = chamadas.find((c) => c[0] === 'notificacao')
  ok(t && t[1].teste === true && t[1].token === TOKEN, `${nome}: "Testar conexão" manda teste:true com o token`)
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: sem rolagem horizontal`)
  await p.close()
  // teste com token colado errado
  const q = await ctx.newPage()
  q.on('pageerror', (e) => erros.push(e.message))
  await q.goto(`http://127.0.0.1:${PORTA}/#/automacoes`)
  await q.waitForSelector('.conectar-celular')
  await q.getByLabel('Token para testar').fill('fin_errado')
  await q.getByRole('button', { name: 'Testar conexão' }).click()
  await q.getByText(/não reconheceu esse token/).waitFor()
  ok(true, `${nome}: token errado colado → explica que o servidor não reconheceu`)
  await ctx.close()
}
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
