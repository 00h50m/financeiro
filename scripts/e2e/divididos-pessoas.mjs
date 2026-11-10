// Teste de Divididos: filtro por pessoa, situação, busca e 'pagou tudo'. Rode com: bash scripts/e2e/rodar-divididos-pessoas.sh
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
    if (['fixos_valores', 'fixos', 'rendas', 'orcamentos', 'metas_movimentos', 'divisoes_repasses', 'divisoes'].includes(tabela) && ['POST', 'PATCH'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const cp = (id, data, descricao, valor) => ({ id, data_compra: data, descricao, categoria: 'Casa', subcategoria: 'Outros', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: valor, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null })
DB.compras = [cp('r1', '2026-10-10', 'ROTEADOR', 100), cp('r2', '2026-10-11', 'MERCADO', 200), cp('r3', '2026-10-12', 'FARMACIA', 80)]
const dv = (id, ref, pessoa, valor) => ({ id, tipo: 'compra', ref_id: ref, pessoa, modo: 'valor', valor, criada_em: '2026-11-01T00:00:00Z' })
DB.divisoes = [dv('d1', 'r1', 'Mãe', 50), dv('d2', 'r2', 'Mãe', 100), dv('d3', 'r3', 'Rose', 40)]
DB.divisoes_repasses = []
for (const [nome, vp] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  escritas.length = 0
  const ctx = await abrir(vp)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(`http://127.0.0.1:${PORTA}/#/divididos`)
  await p.waitForSelector('.dv-quem')
  const cards = (await p.locator('.dv-quem-card').allInnerTexts()).map((t) => t.replace(/\s+/g, ' '))
  ok(cards.length === 3 && /Todas/.test(cards[0]) && /Mãe/.test(cards[1]) && /Rose/.test(cards[2]), `${nome}: cartões Todas, Mãe e Rose (${cards.join(' | ').slice(0, 120)})`)
  ok(/190,00/.test(cards[0]) && /150,00/.test(cards[1]) && /40,00/.test(cards[2]), `${nome}: quanto cada pessoa deve (todas 190, Mãe 150, Rose 40)`)
  const itens = p.locator('.fx-lista[aria-label^="Partes a receber"] .fx-item')
  ok((await itens.count()) === 3, `${nome}: sem filtro mostra as 3 partes do mês`)
  await p.locator('.dv-quem').getByRole('button', { name: /^Mãe/ }).click()
  ok((await itens.count()) === 2 && /150,00/.test(await p.locator('.indicador', { hasText: 'A receber neste mês' }).innerText()), `${nome}: filtrar por Mãe mostra 2 partes e A receber R$ 150,00`)
  ok(/Mãe deve/i.test(await p.locator('.indicadores').innerText()), `${nome}: indicador "Mãe deve (todos os meses)"`)
  ok((await p.locator('.fx-lista[aria-label="Divisões cadastradas"] .fx-item').count()) === 2, `${nome}: as divisões cadastradas também filtram`)
  await p.getByPlaceholder(/Buscar nas partes/).fill('roteador')
  ok((await itens.count()) === 1, `${nome}: a busca refina dentro da pessoa`)
  await p.getByPlaceholder(/Buscar nas partes/).fill('')
  await p.getByRole('button', { name: 'A receber', exact: true }).click()
  ok((await itens.count()) === 2, `${nome}: situação "A receber" mantém as 2 pendentes`)
  await p.getByRole('button', { name: 'Recebidas', exact: true }).click()
  ok((await p.getByText('Nada com esses filtros').count()) === 1, `${nome}: situação "Recebidas" sem nenhuma mostra aviso e ação de limpar`)
  await p.getByRole('button', { name: 'Todas', exact: true }).first().click()
  if (nome === 'celular') {
    const tudo = p.getByRole('button', { name: 'Mãe pagou tudo' })
    ok((await tudo.count()) === 1, 'aparece "Mãe pagou tudo" quando há mais de uma parte pendente')
    await tudo.click()
    const dlg = p.getByRole('dialog')
    ok(/2 partes de Mãe/.test(await dlg.innerText()) && /150,00/.test(await dlg.innerText()), 'a confirmação cita 2 partes e R$ 150,00')
    ok(escritas.length === 0, 'nada é marcado antes de confirmar')
    await dlg.getByRole('button', { name: 'Marcar como recebido' }).click()
    for (let i = 0; i < 40 && escritas.filter(([t]) => t === 'divisoes_repasses').length < 2; i++) await p.waitForTimeout(100)
    const rep = escritas.filter(([t]) => t === 'divisoes_repasses')
    ok(rep.length >= 2, `grava um repasse para cada parte (${rep.length})`)
  }
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: sem rolagem horizontal`)
  await ctx.close()
}
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
