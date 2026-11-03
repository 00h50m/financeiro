// Teste de ponta a ponta das cobranças recorrentes: aviso na importação de fatura (cadastrar como conta fixa) e item no Início. Rode com: bash scripts/e2e/rodar-recorrencias.sh
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
const compra = (id, mes, descricao, valor) => ({ id, data_compra: `${mes}-05`, descricao, categoria: 'Assinaturas', subcategoria: 'Outros', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: valor, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null })
const DB = {
  cartoes: CART, categorias: CATS, pessoas: PESS, fixos: [], fixos_valores: [], rendas: [{ mes: '2026-10', giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }],
  fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [], importacoes_fatura: [], orcamentos: [],
  compras: [compra('n8', '2026-08', 'NETFLIX', 55.9), compra('n9', '2026-09', 'NETFLIX', 55.9)],
}
const escritas = []; const rpcs = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
writeFileSync(join(process.env.TMP_E2E || '/tmp', 'fatura-rec.csv'), ['data,descricao,valor,categoria,parcela_atual,parcela_total,cartao,observacao', '2026-10-05,NETFLIX,55.90,Assinaturas,,,Nubank,', '2026-10-06,PADARIA DO ZE,40,Alimentação,,,Nubank,'].join('\n'))
const browser = await chromium.launch()
async function abrir(vp) {
  const ctx = await browser.newContext({ viewport: vp, timezoneId: 'America/Sao_Paulo', serviceWorkers: 'block' })
  await ctx.clock.install({ time: new Date('2026-10-15T15:00:00Z') })
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
    if (req.method() === 'POST' && tabela === 'fixos') { const corpo = JSON.parse(req.postData() || 'null'); [].concat(corpo).forEach((c) => escritas.push(c)); return json([].concat(corpo).map((c, i) => ({ id: `fx${i}`, ...c }))) }
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const cel = await abrir({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))

// ---- Início: aviso de cobrança recorrente (Netflix em 2 meses + a de outubro = 3)
DB.compras.push(compra('n10', '2026-10', 'NETFLIX', 55.9))
await p.goto(`http://127.0.0.1:${PORTA}/#/inicio`)
await p.waitForSelector('.ini-atencao2')
ok(/1 cobrança recorrente para virar conta fixa/.test(await p.locator('.ini-atencao2').innerText()), 'Início: "1 cobrança recorrente para virar conta fixa" em Precisa da sua atenção')
await p.locator('.ini-aten-item', { hasText: 'recorrente' }).getByRole('button', { name: 'Ver' }).click()
await p.waitForFunction(() => document.querySelector('.topbar-titulo')?.textContent === 'Contas fixas')
await p.waitForFunction(() => document.body.innerText.includes('recorrente'))
ok(p.url().endsWith('#/fixos'), 'o item leva a Contas fixas, onde a detecção oferece cadastrar')
DB.compras = DB.compras.filter((c) => c.id !== 'n10')

// ---- Importação: aviso na linha e cadastro da conta fixa depois de importar
await p.goto(`http://127.0.0.1:${PORTA}/#/importar`)
await p.reload() // recarrega para o app ler o banco sem a compra de outubro
await p.waitForSelector('.imp-escolher')
await p.locator('input[type=file][accept=".csv"]').setInputFiles(join(process.env.TMP_E2E || '/tmp', 'fatura-rec.csv'))
await p.waitForSelector('.imp-config')
await p.getByRole('button', { name: /Analisar lançamentos/ }).click()
await p.waitForSelector('.imp-resumos')
ok(/1 cobrança parece recorrente/.test(await p.locator('.imp-aviso-recorrente').innerText()), 'a etapa Analisar já avisa que há cobrança recorrente (mesmo sem pendências)')
await p.getByRole('button', { name: 'Escolher quais cadastrar' }).click()
const netflix = p.locator('.imp-linha', { hasText: 'NETFLIX' })
await netflix.waitFor()
ok((await netflix.locator('.badge', { hasText: 'recorrente' }).count()) === 1, 'a linha da NETFLIX ganha o selo "recorrente"')
ok((await p.locator('.imp-linha', { hasText: 'PADARIA' }).locator('.badge', { hasText: 'recorrente' }).count()) === 0, 'a padaria (sem histórico) não ganha o selo')
await netflix.locator('.imp-linha-topo').click()
ok(/2 meses antes/.test(await netflix.innerText()) && /a partir do mês seguinte/.test(await netflix.innerText()), 'a caixa explica: 2 meses antes e conta fixa a partir do mês seguinte')
await netflix.locator('.imp-recorrente input[type=checkbox]').check()
await p.getByRole('button', { name: /Continuar para confirmar/ }).click()
await p.waitForSelector('.imp-confirmar-grade')
const grav = (await p.locator('.imp-gravar').innerText()).replace(/\s+/g, ' ')
ok(/1 conta fixa a cadastrar depois da importação/.test(grav) && /NETFLIX/.test(grav) && /Dez\/26/i.test(grav), 'a confirmação lista a conta fixa a cadastrar (fatura de Nov/26, conta fixa a partir de Dez/26)')
ok(escritas.length === 0, 'nada é cadastrado antes de confirmar')
await p.getByRole('button', { name: 'Confirmar importação' }).click()
await p.waitForSelector('text=Importação concluída')
for (let i = 0; i < 40 && !escritas.length; i++) await p.waitForTimeout(100)
ok(rpcs.some(([n, c]) => n === 'aplicar_importacao' && c.p_dados.compras.some((x) => /netflix/i.test(x.descricao))), 'a cobrança da fatura foi importada como compra normal')
ok(escritas.length === 1 && /netflix/i.test(escritas[0].nome) && Number(escritas[0].valor) === 55.9 && escritas[0].mes_inicio === '2026-12' && escritas[0].cartao_id === 'c1', 'a conta fixa foi cadastrada depois: valor 55,90, cartão Nubank, a partir de 2026-12 (mês seguinte ao da fatura)')
ok(/1 conta fixa cadastrada/.test(await p.locator('.imp-assistente').innerText()), 'o resultado informa a conta fixa cadastrada')
await cel.close()

ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 2).join(' | ').slice(0, 160) : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
