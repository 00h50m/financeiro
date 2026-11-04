// Teste da tela Fechamento (mês aberto e mês fechado). Rode com: bash scripts/e2e/rodar-fechamento.sh
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
DB.fechamentos = []
DB.auditoria = []
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
    if (['fixos_valores', 'fixos', 'rendas', 'orcamentos', 'metas_movimentos'].includes(tabela) && ['POST', 'PATCH'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
for (const [nome, vp] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  DB.fechamentos = []
  const ctx = await abrir(vp)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(`http://127.0.0.1:${PORTA}/#/fechamento`)
  await p.waitForSelector('.indicadores')
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: aberto sem rolagem horizontal`)
  ok((await p.locator('.indicadores .indicador').count()) === 4 && (await p.locator('table').count()) === 0, `${nome}: 4 indicadores e nenhuma tabela`)
  ok((await p.locator('.selo', { hasText: 'Aberto' }).count()) === 1, `${nome}: situação "Aberto" em selo`)
  ok((await p.getByRole('button', { name: /^Fechar [A-Za-zçÇ]{3}\/\d{2}$/ }).count()) === 1, `${nome}: botão de fechar o mês presente`)
  await ctx.close()
  // mês fechado
  DB.fechamentos = [{ mes: '2026-10', status: 'fechado', fechado_em: '2026-11-02T12:00:00Z', fechado_por: 'gi@teste.com', renda: 11000, despesas: 7000, sobra: 4000, saldo_anterior: 0, ajuste: 0, saldo_final: 4000, reserva_destinada: 1000, saldo_transportado: 3000, pago: 6000, pendente: 1000, por_categoria: { Moradia: 4000, Alimentação: 3000 }, por_pessoa: { Giovanna: 7000 }, detalhes: { faturas: [{ cartao_id: 'c1', nome: 'Nubank', valor: 1500, real: true, pago: true }] } }]
  const c2 = await abrir(vp)
  const q = await c2.newPage()
  q.on('pageerror', (e) => erros.push(e.message))
  await q.goto(`http://127.0.0.1:${PORTA}/#/fechamento`)
  await q.waitForSelector('.indicadores')
  ok((await q.locator('.selo', { hasText: 'Fechado' }).count()) === 1 && /Out\/26 fechado|fechado/i.test(await q.locator('.alert-green').first().innerText()), `${nome}: mês fechado mostra selo e aviso da foto`)
  await q.getByText('Despesas por categoria').first().waitFor()
  ok((await q.locator('.fch-lista li').count()) >= 2 && (await q.locator('table').count()) === 0, `${nome}: categorias em lista`)
  ok((await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: fechado sem rolagem horizontal`)
  if (nome === 'celular') {
    await q.getByRole('button', { name: /^Reabrir / }).click()
    await q.getByRole('dialog').locator('textarea, input').first().fill('corrigir um lançamento')
    await q.getByRole('dialog').getByRole('button', { name: /Confirmar|OK|Enviar|Reabrir/ }).last().click()
    for (let i = 0; i < 30 && !rpcs.some(([n]) => n === 'reabrir_mes'); i++) await q.waitForTimeout(100)
    ok(rpcs.some(([n, c]) => n === 'reabrir_mes' && c.p_mes === '2026-10' && /corrigir/.test(c.p_motivo)), 'reabrir envia o mês e o motivo digitado')
  }
  await c2.close()
}
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
