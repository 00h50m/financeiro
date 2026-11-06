// Teste da lista de Aulas: ao marcar como realizada, a aula desce para o grupo 'Realizadas'. Rode com: bash scripts/e2e/rodar-aulas-ordem.sh
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
const aula = (id, data, status, extra) => ({ id, aluno_id: 'al1', data, data_original: data, horario: null, duracao_min: 60, duracao_real_min: status === 'realizada' ? 60 : null, valor_hora_centavos: 12000, valor_centavos: status === 'realizada' ? 12000 : null, status, origem: 'recorrente', programacao_id: 'pg1', historico: [], ...extra })
DB.alunos = [{ id: 'al1', nome: 'Ana', responsavel: 'Mãe', valor_hora_centavos: 12000, inicio: '2026-10-01', ativo: true }]
DB.aulas_programacao = [{ id: 'pg1', aluno_id: 'al1', dia_semana: 2, horario: null, duracao_min: 60, vigencia_inicio: '2026-10-01', vigencia_fim: null }]
DB.aulas = [aula('x1', '2026-11-03', 'realizada'), aula('x2', '2026-11-10', 'prevista'), aula('x3', '2026-11-17', 'prevista')]
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
    if (tabela === 'aulas' && req.method() === 'PATCH') { const id = (url.search.match(/id=eq\.([^&]+)/) || [])[1]; const corpo = JSON.parse(req.postData() || '{}'); DB.aulas = DB.aulas.map((a) => (a.id === id ? { ...a, ...corpo } : a)); return json([]) }
    if (req.method() === 'GET') return json(DB[tabela] || [])
    if (['fixos_valores', 'fixos', 'rendas', 'orcamentos', 'metas_movimentos', 'divisoes_repasses'].includes(tabela) && ['POST', 'PATCH'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
for (const [nome, vp] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  DB.aulas = [aula('x1', '2026-11-03', 'realizada'), aula('x2', '2026-11-10', 'prevista'), aula('x3', '2026-11-17', 'prevista')]
  const ctx = await abrir(vp)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(`http://127.0.0.1:${PORTA}/#/aulas`)
  await p.waitForSelector('.aula-card')
  const ordem = async () => p.locator('.aulas-lista .aula-card').evaluateAll((els) => els.map((e) => e.className.split(' ')[1]))
  ok(JSON.stringify(await ordem()) === JSON.stringify(['prevista', 'prevista', 'realizada']), `${nome}: previstas em cima e a realizada no fim → ${JSON.stringify(await ordem())}`)
  ok((await p.locator('.aulas-feitas-titulo').count()) === 1 && /realizadas \(1\)/i.test(await p.locator('.aulas-feitas-titulo').innerText()), `${nome}: título "Realizadas (1)" antes do grupo`)
  await p.locator('.aula-card.prevista').first().getByRole('button', { name: /Realizada/ }).click()
  for (let i = 0; i < 40 && (await ordem()).filter((c) => c === 'realizada').length < 2; i++) await p.waitForTimeout(100)
  ok(JSON.stringify(await ordem()) === JSON.stringify(['prevista', 'realizada', 'realizada']), `${nome}: ao marcar como realizada, a aula desce → ${JSON.stringify(await ordem())}`)
  const textos = await p.locator('.aulas-lista .aula-card').allInnerTexts()
  ok(textos.length === 3 && !/✓ Realizada/.test(textos[1]) && !/✓ Realizada/.test(textos[2]) && /✓ Realizada/.test(textos[0]), `${nome}: só a aula ainda prevista mantém o botão de realizar`)
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: sem rolagem horizontal`)
  await ctx.close()
}
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
