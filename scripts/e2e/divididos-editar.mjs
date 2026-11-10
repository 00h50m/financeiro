// Teste de Divididos: editar uma divisão (trocar a pessoa, valor e observação). Rode com: bash scripts/e2e/rodar-divididos-editar.sh
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
for (const [nome, vp] of [['celular', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  escritas.length = 0
  DB.compras = [cp('r1', '2026-10-10', 'RODIZIO', 100), cp('r2', '2026-10-11', 'MERCADO', 200)]
  DB.divisoes = [{ id: 'd1', tipo: 'compra', ref_id: 'r1', pessoa: 'Mãe', modo: 'valor', valor: 40, observacao: null, criada_em: '2026-11-01T00:00:00Z' }, { id: 'd2', tipo: 'compra', ref_id: 'r2', pessoa: 'Rose', modo: 'valor', valor: 100, observacao: null, criada_em: '2026-11-01T00:00:00Z' }]
  DB.divisoes_repasses = []
  const ctx = await abrir(vp)
  const p = await ctx.newPage()
  p.on('pageerror', (e) => erros.push(e.message))
  await p.goto(`http://127.0.0.1:${PORTA}/#/divididos`)
  await p.waitForSelector('.dv-quem')
  const parte = p.locator('.fx-lista[aria-label^="Partes a receber"] .fx-item', { hasText: 'Mãe' })
  ok((await parte.getByRole('button', { name: /Editar/ }).count()) === 1, `${nome}: a parte do mês tem o botão Editar`)
  await parte.getByRole('button', { name: /Editar/ }).click()
  const dlg = p.getByRole('dialog', { name: 'Editar divisão' })
  await dlg.waitFor()
  ok(/RODIZIO|Rodizio/i.test(await dlg.innerText()) && (await dlg.locator('#ed-pessoa').inputValue()) === 'Mãe', `${nome}: o formulário abre com a divisão atual (Mãe)`)
  ok((await dlg.getByRole('button', { name: 'Salvar alterações' }).isDisabled()), `${nome}: salvar desabilitado enquanto nada mudou`)
  await dlg.getByRole('button', { name: 'Rose', exact: true }).click()
  ok((await dlg.locator('#ed-pessoa').inputValue()) === 'Rose', `${nome}: tocar em Rose troca a pessoa`)
  await dlg.locator('#ed-valor').fill('')
  await dlg.locator('#ed-valor').pressSequentially('55,50')
  await dlg.locator('#ed-obs').fill('almoço de domingo')
  ok(/R\$\s?55,50/.test(await dlg.locator('.alert-blue').innerText()), `${nome}: prévia mostra R$ 55,50`)
  ok(escritas.length === 0, `${nome}: nada é gravado antes de salvar`)
  if (nome === 'celular') {
    await dlg.getByRole('button', { name: 'Salvar alterações' }).click()
    for (let i = 0; i < 30 && !escritas.some(([t, m]) => t === 'divisoes' && m === 'PATCH'); i++) await p.waitForTimeout(100)
    const e = escritas.find(([t, m]) => t === 'divisoes' && m === 'PATCH')
    ok(e && /d1/.test(e[3]) && e[2].pessoa === 'Rose' && Number(e[2].valor) === 55.5 && e[2].observacao === 'almoço de domingo', `grava pessoa Rose, valor 55,50 e a observação (${JSON.stringify(e?.[2])?.slice(0, 120)})`)
  } else {
    // passa do valor: a Rose já paga 100 de 200 em outra compra, mas nesta (100) 120 passa
    await dlg.locator('#ed-valor').fill('')
    await dlg.locator('#ed-valor').pressSequentially('120')
    ok(/passa do valor/.test(await dlg.innerText()) && (await dlg.getByRole('button', { name: 'Salvar alterações' }).isDisabled()), `${nome}: valor acima do total bloqueia e avisa`)
    await dlg.getByRole('button', { name: 'Cancelar' }).click()
    ok((await p.getByRole('dialog', { name: 'Editar divisão' }).count()) === 0, `${nome}: cancelar fecha sem gravar`)
  }
  // lista de divisões cadastradas também tem Editar
  if (nome === 'desktop') {
    const cad = p.locator('.fx-lista[aria-label="Divisões cadastradas"] .fx-item', { hasText: 'Mãe' })
    ok((await cad.getByRole('button', { name: /Editar/ }).count()) === 1, `${nome}: Divisões cadastradas também tem Editar`)
  }
  ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, `${nome}: sem rolagem horizontal`)
  await ctx.close()
}
ok(erros.length === 0, `sem erros de JavaScript ${erros.slice(0, 2).join(' | ').slice(0, 160)}`)
await browser.close(); srv.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
