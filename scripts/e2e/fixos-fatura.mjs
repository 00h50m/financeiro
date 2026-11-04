// Teste de ponta a ponta de contas fixas na fatura: valor variável do cartão e conta fixa paga fora do cartão. Rode com: bash scripts/e2e/rodar-fixos-fatura.sh
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
  cartoes: CART, categorias: CATS, pessoas: PESS, rendas: [{ mes: '2026-11', giovanna: 8000, sabrina: 0, extra_sabrina: 0, mesada: 0, outros: 0 }],
  fixos: [fx('fn', 'Netflix', 59.9, { cartao_id: 'c1', variavel: true }), fx('fs', 'Spotify', 21.9, { cartao_id: null, variavel: false })],
  fixos_valores: [], fixos_pagamentos: [], compras_pagamentos: [], faturas: [], eventos_financeiros: [], importacoes_fatura: [], orcamentos: [], compras: [],
}
const escritas = []; const rpcs = []
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
writeFileSync(join(process.env.TMP_E2E || '/tmp', 'fatura-fixos.csv'), ['data,descricao,valor,categoria,parcela_atual,parcela_total,cartao,observacao', '2026-10-05,NETFLIX,55.90,Assinaturas,,,Nubank,', '2026-10-06,SPOTIFY,21.90,Assinaturas,,,Nubank,', '2026-10-07,PADARIA DO ZE,40,Alimentação,,,Nubank,'].join('\n'))
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
    if (['fixos_valores', 'fixos'].includes(tabela) && ['POST', 'PATCH'].includes(req.method())) escritas.push([tabela, req.method(), JSON.parse(req.postData() || 'null'), url.search])
    return json([])
  })
  await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)) }, sessao)
  return ctx
}
const erros = []
const cel = await abrir({ width: 390, height: 844 })
const p = await cel.newPage()
p.on('pageerror', (e) => erros.push(e.message))
await p.goto(`http://127.0.0.1:${PORTA}/#/importar`)
await p.waitForSelector('.imp-escolher')
await p.locator('input[type=file][accept=".csv"]').setInputFiles(join(process.env.TMP_E2E || '/tmp', 'fatura-fixos.csv'))
await p.waitForSelector('.imp-config')
await p.getByRole('button', { name: /Analisar lançamentos/ }).click()
await p.waitForSelector('.imp-resumos')
await p.getByRole('button', { name: /Revisar pendências/ }).click()
const net = p.locator('.imp-linha.revisao', { hasText: 'NETFLIX' })
const spo = p.locator('.imp-linha.revisao', { hasText: 'SPOTIFY' })
await net.waitFor()
ok((await p.locator('.imp-linha.revisao').count()) === 2 && (await p.locator('.imp-linha.revisao', { hasText: 'PADARIA' }).count()) === 0, 'Netflix e Spotify vão para revisão; a padaria segue como nova')
const tn = (await net.innerText()).replace(/\s+/g, ' ')
ok(/Conta fixa Netflix deste cartão/.test(tn) && /R\$\s?59,90/.test(tn) && /R\$\s?55,90/.test(tn) && /valor variável/.test(tn), 'Netflix: explica que a conta fixa do cartão está em 59,90 e a fatura traz 55,90 (valor variável)')
const ts = (await spo.innerText()).replace(/\s+/g, ' ')
ok(/fora do cartão/.test(ts) && /duas vezes/.test(ts), 'Spotify: avisa que a conta fixa está fora do cartão e que importar duplicaria')
ok((await p.locator('.imp-linha.revisao .btn').filter({ hasText: 'É outra compra' }).count()) === 2, 'as duas têm a saída "É outra compra" (nada é decidido sozinho)')
await net.getByRole('button', { name: /É a conta fixa: registrar R\$\s?55,90 neste mês/ }).click()
await p.locator('.imp-linha', { hasText: 'SPOTIFY' }).getByRole('button', { name: 'Passar a conta fixa para este cartão' }).click()
await p.getByRole('button', { name: /Continuar para confirmar/ }).click()
await p.waitForSelector('.imp-confirmar-grade')
const grav = (await p.locator('.imp-gravar').innerText()).replace(/\s+/g, ' ')
ok(/1 nova compra/.test(grav) && /Padaria/i.test(grav) && !/NETFLIX|SPOTIFY/.test(grav.split('Ajustes em contas fixas')[0]), 'só a padaria será criada como compra (Netflix e Spotify não duplicam)')
ok(/Ajustes em contas fixas/.test(grav) && /Netflix: valor de Nov\/26 de R\$\s?59,90 para R\$\s?55,90/.test(grav) && /Spotify: passa a ser cobrada no cartão desta fatura/.test(grav), 'a confirmação lista os ajustes das contas fixas')
ok(escritas.length === 0, 'nada nas contas fixas é gravado antes de confirmar')
await p.getByRole('button', { name: 'Confirmar importação' }).click()
await p.waitForSelector('text=Importação concluída')
for (let i = 0; i < 40 && escritas.length < 2; i++) await p.waitForTimeout(100)
const imp = rpcs.find(([n]) => n === 'aplicar_importacao')
ok(imp && imp[1].p_dados.compras.length === 1 && /padaria/i.test(imp[1].p_dados.compras[0].descricao), 'a importação gravou só 1 compra (Padaria)')
ok(escritas.some(([t, m, c]) => t === 'fixos_valores' && m === 'POST' && c.fixo_id === 'fn' && c.mes === '2026-11' && Number(c.valor) === 55.9), 'valor de novembro da Netflix gravado como 55,90')
ok(escritas.some(([t, m, c, q]) => t === 'fixos' && m === 'PATCH' && c.cartao_id === 'c1' && /fs/.test(q)), 'Spotify passou a ser cobrada no cartão Nubank')
ok(/2 ajustes em contas fixas feitos/.test(await p.locator('.imp-assistente').innerText()), 'o resultado informa os 2 ajustes')
await cel.close()

ok(erros.length === 0, `sem erros de JavaScript ${erros.length ? '→ ' + erros.slice(0, 2).join(' | ').slice(0, 160) : ''}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
