// Teste das telas Parcelamentos e Divididos (lista padrão, indicadores, selos, quitar, recebi). Rode com: bash scripts/e2e/rodar-parcelamentos-divididos.sh
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
const CART = [{ id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: 3, vencimento: 25, ativo: true, limite: 8000 }]
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
    if (['fixos_valores', 'fixos', 'rendas', 'orcamentos', 'metas_movimentos', 'divisoes_repasses'].includes(tabela) && ['POST', 'PATCH'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const PARC = { id: 'cp1', data_compra: '2026-09-20', descricao: 'GELADEIRA', categoria: 'Casa', subcategoria: 'Outros', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 600, parcelas: 6, origem: 'manual', pago: false, fatura_mes: null }
for (const [nome, vp] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  DB.compras = []; DB.divisoes = []
  const c1 = await abrir(vp)
  const a = await c1.newPage()
  a.on('pageerror', (e) => erros.push(e.message))
  await a.goto(`http://127.0.0.1:${PORTA}/#/parcelamentos`)
  await a.waitForSelector('.estado-vazio')
  ok(/Nenhum parcelamento ativo/.test(await a.locator('.estado-vazio').innerText()), `${nome}: parcelamentos vazio com estado padrão`)
  await c1.close()
  DB.compras = [PARC]
  DB.divisoes = [{ id: 'dv1', tipo: 'compra', ref_id: 'cp1', pessoa: 'Sabrina', modo: 'valor', valor: 100, criada_em: '2026-10-01T00:00:00Z' }]
  const c2 = await abrir(vp)
  const p = await c2.newPage()
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(`http://127.0.0.1:${PORTA}/#/parcelamentos`)
  await p.waitForSelector('.fx-item')
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: parcelamentos sem rolagem horizontal`)
  ok((await p.locator('.indicadores .indicador').count()) === 3 && (await p.locator('table').count()) === 0, `${nome}: 3 indicadores e nenhuma tabela`)
  const item = p.locator('.fx-item', { hasText: 'GELADEIRA' }).first()
  ok(/\/6 pagas/.test(await item.innerText()) && (await item.locator('.selo').count()) >= 1, `${nome}: compra com progresso x/6 e selo de término`)
  await item.getByRole('button', { name: /Quitar\?/ }).click()
  ok(/faltam/.test(await item.innerText()) && (await item.getByLabel(/Quanto o banco/).count()) === 1, `${nome}: painel de quitação abre dentro do cartão`)
  await p.goto(`http://127.0.0.1:${PORTA}/#/divididos`)
  await p.waitForSelector('.indicadores')
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1 && (await p.locator('table').count()) === 0, `${nome}: divididos sem rolagem horizontal e sem tabela`)
  ok((await p.locator('.indicadores .indicador').count()) === 3, `${nome}: divididos com 3 indicadores`)
  const parte = p.locator('.fx-item', { hasText: 'Sabrina' }).first()
  ok(/a receber/i.test(await parte.innerText()), `${nome}: parte da Sabrina com selo "a receber"`)
  ok((await p.locator('.fx-lista[aria-label="Divisões cadastradas"] .fx-item').count()) === 1, `${nome}: divisão cadastrada listada`)
  if (nome === 'celular') {
    await parte.getByRole('button', { name: /Recebi/ }).click()
    await p.getByRole('dialog').locator('input').first().fill('100,00')
    await p.getByRole('dialog').getByRole('button', { name: /Confirmar|OK|Salvar|Enviar/ }).last().click()
    for (let i = 0; i < 30 && !escritas.some(([t]) => t === 'divisoes_repasses'); i++) await p.waitForTimeout(100)
    ok(escritas.some(([t, , c]) => t === 'divisoes_repasses' && JSON.stringify(c).includes('dv1') && JSON.stringify(c).includes('100')), 'Recebi grava o repasse de R$ 100 da divisão dv1')
  }
  await c2.close()
}
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
