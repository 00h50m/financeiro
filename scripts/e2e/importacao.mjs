// Teste de ponta a ponta do assistente de importação de fatura: navegador real (Chromium) + Supabase simulado.
// Não faz parte do `npm test` (precisa do Playwright e do Chromium). Rode com: bash scripts/e2e/rodar-importacao.sh
/* global process, console, globalThis */
import { createServer } from 'node:http'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, extname } from 'node:path'

const { chromium } = await import('playwright').catch(() => import('/opt/node-tools/node_modules/playwright/index.mjs'))
const TMP = process.env.TMP_E2E || '/tmp/e2e'
const DIST = process.env.DIST || join(TMP, 'dist')
const PORTA = Number(process.env.PORTA_E2E || 5199)
mkdirSync(TMP, { recursive: true })
const TIPOS = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' }
const servidor = createServer((req, res) => {
  const caminho = new URL(req.url, 'http://x').pathname
  const arq = existsSync(join(DIST, caminho)) && caminho !== '/' ? join(DIST, caminho) : join(DIST, 'index.html')
  res.writeHead(200, { 'content-type': TIPOS[extname(arq)] || 'application/octet-stream' })
  res.end(readFileSync(arq))
}).listen(PORTA)

const SB = 'http://localhost:54321'
const hoje = new Date().toISOString().slice(0, 10)
const mes = hoje.slice(0, 7)
const dia = (n) => `${mes}-${String(n).padStart(2, '0')}`
const falhas = []
const ok = (cond, msg) => { console.log(`${cond ? 'OK ' : 'ERRO'} ${msg}`); if (!cond) falhas.push(msg) }

const CART = { id: 'c1', nome: 'Nubank', titular: 'Giovanna', fechamento: null, vencimento: 10, ativo: true }
const CATS = [{ id: 'k1', nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }, { id: 'k2', nome: 'Transporte', subcategorias: ['Combustível'] }]
const PESSOAS = [{ id: 'p1', nome: 'Giovanna', cor: 'purple', apelidos: [] }]
const compra = (o) => ({ id: o.id, data_compra: dia(10), descricao: 'X', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', cartao_id: 'c1', valor_total: 10, parcelas: 1, origem: 'manual', pago: false, fatura_mes: null, ...o })
const mesAnt = (() => { const d = new Date(`${mes}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) })()
const COMPRAS = [
  compra({ id: 'g0', data_compra: `${mesAnt}-16`, descricao: 'GELADEIRA BRASTEMP', valor_total: 250 }), // possível parcela anterior lançada à parte
  compra({ id: 'e1', data_compra: dia(3), descricao: 'MERCADO EXTRA', valor_total: 100 }),            // exata
  compra({ id: 'p-1', data_compra: dia(12), descricao: 'Padaria Sao Joao Ltda', valor_total: 40 }),   // parecida (nome/data diferentes)
  compra({ id: 'v1', data_compra: dia(5), descricao: 'POSTO SHELL', categoria: 'Transporte', subcategoria: 'Combustível', valor_total: 200 }), // valor diferente (fatura traz 205)
  compra({ id: 's1', data_compra: dia(8), descricao: 'LOJA SO NO APP', valor_total: 77 }),             // só no app
]
const CSV = [
  'data,descricao,valor,categoria,parcela_atual,parcela_total,cartao,observacao',
  `${dia(3)},MERCADO EXTRA,100,Alimentação,,,Nubank,`,
  `${dia(14)},Padaria Sao Joao,40,Alimentação,,,Nubank,`,
  `${dia(5)},POSTO SHELL,205,Transporte,,,Nubank,`,
  `${dia(15)},DELIVERY NOVO,60,Alimentação,,,Nubank,`,
  `${dia(16)},Geladeira Brastemp,250,,3,10,Nubank,`,
  `${dia(17)},Pagamento recebido,-2000,,,,Nubank,`,
  `${dia(18)},Estorno Loja Y,-30,Alimentação,,,Nubank,`,
  `${dia(19)},LOJA SEM CATEGORIA XYZ,9,,,,Nubank,`, // sem categoria e sem histórico: bloqueia só esta linha
].join('\n')
writeFileSync(join(TMP, 'fatura.csv'), CSV)

const chamadas = { rpc: [], rascunhos: [] }
let modoAplicar = 'ok' // ok | falha | repetida
let rascunhoGuardado = null
const TABELAS = { cartoes: [CART], categorias: CATS, pessoas: PESSOAS, compras: COMPRAS }

const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const sessao = { access_token: 'x.y.z', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: Math.floor(Date.now() / 1000) + 99999, user: { id: 'u1', email: 'gi@teste.com', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01' } }
await ctx.addInitScript((s) => { localStorage.setItem('sb-localhost-auth-token', JSON.stringify(s)); localStorage.setItem('aba', 'importar') }, sessao)
await ctx.route(`${SB}/**`, async (route) => {
  const req = route.request()
  const url = new URL(req.url())
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/*' }, body: JSON.stringify(body) })
  if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
  if (url.pathname.startsWith('/auth/v1')) return json({ user: sessao.user })
  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/(\w+)/)
  if (rpc) {
    const corpo = JSON.parse(req.postData() || '{}')
    chamadas.rpc.push([rpc[1], corpo])
    if (rpc[1] === 'salvar_rascunho_importacao') { rascunhoGuardado = corpo; return json({ salvo: true, importacao_id: corpo.p_importacao }) }
    if (rpc[1] === 'aplicar_importacao') {
      if (modoAplicar === 'falha') { modoAplicar = 'ok'; return json({ code: 'P0001', message: 'Lançamento 2: categoria "X" não existe.', details: null, hint: null }, 400) }
      if (modoAplicar === 'repetida') return json({ importacao_id: 'antigo', status_importacao: 'concluida', status_conciliacao: 'pendente', criadas: 3, atualizadas: 0, movidas: 0, repetida: true, motivo: 'mesmo_arquivo', concluida_em: '2026-10-01T12:00:00Z' })
      const d = corpo.p_dados
      if (!d.chave || d.chave.length < 16) return json({ code: 'P0001', message: 'Importação sem a impressão digital do arquivo.', details: null, hint: null }, 400) // como o banco de verdade
      return json({ importacao_id: corpo.p_importacao, status_importacao: 'concluida', status_conciliacao: d.status_conciliacao, criadas: d.compras.length, atualizadas: d.atualizar.length, movidas: d.mover.length, ids: [] })
    }
    if (rpc[1] === 'aplicar_conciliacao') {
      const d = corpo.p_dados
      return json({ importacao_id: corpo.p_importacao, operacao: corpo.p_operacao, status_conciliacao: d.status_conciliacao, criadas: (d.compras || []).length, atualizadas: (d.atualizar || []).length, movidas: (d.mover || []).length, ids: [] })
    }
    return json({})
  }
  const tabela = url.pathname.replace('/rest/v1/', '')
  if (req.method() === 'GET') {
    if (tabela === 'importacoes_fatura' && url.search.includes('concluida')) return json(globalThis.__mostrarConcluidas ? [{ id: 'lote-antigo', cartao_id: 'c1', mes, arquivo_nome: 'fatura.csv', origem_leitura: 'csv', total_banco: null, total_extraido: 305, status_importacao: 'concluida', status_conciliacao: 'parcial', concluida_em: '2026-10-01T12:00:00Z', decisoes: { pendencias: [{ x: 1 }] }, linhas: [{ data: dia(3), descricao: 'MERCADO EXTRA', valor: 100, cartao: 'Nubank' }, { data: dia(5), descricao: 'POSTO SHELL', valor: 205, cartao: 'Nubank' }] }] : [])
    if (tabela === 'importacoes_fatura') return json(rascunhoGuardado && url.search.includes('rascunho') && globalThis.__mostrarRascunho ? [{ id: rascunhoGuardado.p_importacao, cartao_id: 'c1', mes, arquivo_nome: 'fatura.csv', origem_leitura: 'csv', total_banco: null, linhas: [], decisoes: rascunhoGuardado.p_dados.decisoes, atualizado_em: new Date().toISOString() }] : [])
    return json(TABELAS[tabela] || [])
  }
  return json([])
})
const page = await ctx.newPage()
const erros = []
page.on('pageerror', (e) => erros.push(e.message))
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::ERR/.test(m.text())) erros.push(m.text()) })
await page.goto(`http://127.0.0.1:${PORTA}/`)
await page.waitForSelector('.imp-assistente', { timeout: 15000 }).catch(() => {})
ok(await page.locator('.imp-assistente').count() === 1, 'a tela Importar fatura abre com o assistente')
ok((await page.locator('.imp-progresso li').count()) === 4, 'indicador com 4 etapas')
ok(await page.getByText('Qual fatura você quer conferir?').count() === 1, 'etapa 1: escolher arquivo')
await page.screenshot({ path: join(TMP, '1-selecionar.png') })

// --- etapa 1: sobe o CSV
await page.locator('input[type=file][accept=".csv"]').setInputFiles(join(TMP, 'fatura.csv'))
await page.waitForSelector('.imp-config', { timeout: 10000 })
ok(await page.getByText('8', { exact: true }).first().isVisible(), 'resumo da leitura mostra 8 lançamentos')
const cartaoSel = await page.locator('.imp-config select').first().inputValue()
ok(cartaoSel === 'c1', 'cartão identificado automaticamente (Nubank)')
ok(/^\d{4}-\d{2}$/.test(await page.locator('.imp-config input[type=month]').inputValue()), 'mês da fatura inferido')
await page.screenshot({ path: join(TMP, '2-leitura.png') })
await page.getByRole('button', { name: /Analisar lançamentos/ }).click()

// --- etapa 2: análise
await page.waitForSelector('.imp-resumos')
const nums = await page.locator('.imp-resumo-n').allTextContents()
console.log('contadores (registradas, novas, revisão, só no app):', nums.join(', '))
ok(nums[0] === '1', 'já registradas = 1 (exata)')
ok(nums[3] === '1', 'só no aplicativo = 1')
ok(Number(nums[2]) >= 3, 'precisam de revisão >= 3 (parecida, valor diferente, parcelamento)')
ok(await page.getByText('Importação: ').count() === 0, 'etapa 2 ainda não fala de gravação')
ok(await page.locator('.imp-painel').count() === 1, 'painel de conciliação visível')
await page.screenshot({ path: join(TMP, '3-analise.png') })
await page.getByRole('button', { name: /Revisar pendências/ }).click()

// --- etapa 3: revisão
await page.waitForSelector('.imp-linha.revisao')
const textoPag = async () => await page.locator('.imp-assistente').innerText()
ok(/Parece já lançada/.test(await textoPag()), 'correspondência provável aparece como revisão')
ok(await page.locator('.imp-comp').count() >= 2, 'comparação lado a lado (fatura × aplicativo) aparece')
ok(/É a mesma compra/.test(await textoPag()) && /É outra compra/.test(await textoPag()) && /Revisar depois/.test(await textoPag()), 'as 3 ações da correspondência provável')
ok(/Manter o valor lançado/.test(await textoPag()) && /Atualizar para/.test(await textoPag()), 'as ações do valor diferente')
ok(/Esta é a parcela 3 de 10/.test(await textoPag()) && /Criar parcelamento completo/.test(await textoPag()) && /Registrar só esta parcela/.test(await textoPag()), 'parcela intermediária oferece as duas opções, com prévia')
ok(/Já existem lançamentos parecidos de meses anteriores/.test(await textoPag()), 'avisa que as parcelas anteriores podem já estar lançadas à parte')
ok(/data estimada/.test(await textoPag()) && /muda o total deles/.test(await textoPag()), 'explica a data estimada e o efeito nos meses passados')
await page.locator('.imp-linha.revisao', { hasText: 'Geladeira' }).locator('.imp-cronograma summary').click()
ok(await page.locator('.imp-linha.revisao', { hasText: 'Geladeira' }).locator('.imp-cronograma tr').count() === 10, 'cronograma lista as 10 parcelas')
ok(/recomendado/.test(await page.locator('.imp-linha.revisao', { hasText: 'Geladeira' }).locator('.imp-opcao').nth(1).innerText()), '"só esta parcela" é a recomendada quando há evidência de parcelas avulsas')
await page.screenshot({ path: join(TMP, '4-revisao.png'), fullPage: true })
const painel = async () => (await page.locator('.imp-painel').innerText()).replace(/\s+/g, ' ')
const pend0 = await painel()
console.log('painel inicial:', pend0)

// decisões: padaria = mesma; posto = atualizar; geladeira = confirmar parcelamento
await page.locator('.imp-linha.revisao', { hasText: 'Padaria' }).getByRole('button', { name: 'É a mesma compra' }).click()
await page.locator('.imp-linha.registrada, .imp-linha.revisao').first().waitFor()
await page.locator('.imp-linha.revisao', { hasText: 'POSTO' }).getByRole('button', { name: /Atualizar para/ }).click()
await page.locator('.imp-linha.revisao', { hasText: 'Geladeira' }).getByRole('button', { name: 'Criar parcelamento completo' }).click()
// a loja sem categoria (e sem histórico) fica bloqueada em revisão ("faltam dados"): só ela; as outras seguem
ok(/Faltam dados|Para importar, complete/.test(await page.locator('.imp-linha.revisao', { hasText: 'LOJA SEM CATEGORIA' }).innerText()), 'linha sem categoria fica bloqueada em revisão (só ela)')
ok(await page.locator('.imp-linha.revisao').count() === 1, 'só a linha incompleta continua bloqueando; as demais já estão resolvidas')
await page.locator('.imp-linha.revisao', { hasText: 'LOJA SEM CATEGORIA' }).locator('select').first().selectOption('Alimentação')
ok(await page.locator('.imp-linha.revisao', { hasText: 'LOJA SEM CATEGORIA' }).count() === 1, 'escolher só a categoria NÃO resolve: a linha continua em revisão esperando a subcategoria')
ok(await page.locator('.imp-linha.revisao', { hasText: 'LOJA SEM CATEGORIA' }).locator('select').nth(1).inputValue() === '', 'a subcategoria fica em branco para a pessoa escolher')
await page.locator('.imp-linha.revisao', { hasText: 'LOJA SEM CATEGORIA' }).locator('select').nth(1).selectOption('Mercado')
const pend1 = await painel()
console.log('painel depois das decisões:', pend1)
ok(pend0 !== pend1, 'o painel de conciliação se atualiza a cada decisão')
ok(await page.locator('.imp-linha.revisao').count() === 0, 'sem pendências de revisão depois das decisões')

ok(await page.locator('.imp-linha .imp-selos .badge', { hasText: 'Giovanna' }).count() > 0, 'cada lançamento mostra a pessoa (selo colorido) na lista')
// aba "Só no app": o cartão não pode esticar (a classe "app" colidia com o contêiner do app) e a aba explica o que é
await page.getByRole('button', { name: /Só no app/ }).click()
const cartaoApp = page.locator('.imp-linha.so-app').first()
await cartaoApp.waitFor()
ok((await cartaoApp.boundingBox()).height < 200, 'aba "Só no app": o cartão tem altura normal (não ocupa a tela)')
ok(/O que é esta aba/.test(await page.locator('.imp-so-app-explica').innerText()), 'aba "Só no app" explica o que ela mostra')

// desfazer uma decisão
await page.getByRole('button', { name: /Registradas/ }).click()
if (!(await page.locator('.imp-linha', { hasText: 'Padaria' }).getByRole('button', { name: 'desfazer minha decisão' }).isVisible())) await page.locator('.imp-linha', { hasText: 'Padaria' }).locator('.imp-linha-topo').click()
await page.locator('.imp-linha', { hasText: 'Padaria' }).getByRole('button', { name: 'desfazer minha decisão' }).click()
await page.getByRole('button', { name: /Revisão \(1\)/ }).waitFor()
ok(true, 'desfazer a decisão devolve a linha para a revisão')
// a linha resolvida na revisão continua na tela (marcada como pronta) em vez de sumir
await page.getByRole('button', { name: /Revisão/ }).click()
ok(await page.locator('.imp-linha.nova', { hasText: 'Loja Sem Categoria' }).count() === 1, 'linha resolvida continua visível na aba Revisão (não some como se tivesse sido lançada)')
ok(/Nada é gravado agora/.test(await page.locator('.imp-etapa').innerText()), 'a tela avisa que nada é gravado antes de confirmar')
await page.getByRole('button', { name: /Revisão/ }).click()
await page.locator('.imp-linha.revisao', { hasText: 'Padaria' }).getByRole('button', { name: 'Revisar depois' }).click()
ok(/Revisar depois/.test(await page.locator('.imp-linha.revisao', { hasText: 'Padaria' }).innerText()), '"Revisar depois" mantém a pendência')

// só no app
await page.getByRole('button', { name: /Só no app/ }).click()
ok(/LOJA SO NO APP/.test(await textoPag()), 'divergência só no aplicativo listada')
await page.screenshot({ path: join(TMP, '5-so-no-app.png'), fullPage: true })

// --- etapa 4: confirmar
await page.getByRole('button', { name: /Continuar para confirmar/ }).click()
await page.waitForSelector('.imp-confirmar-grade')
await page.locator('.imp-pendencias-btn').click()
const pend = await page.locator('.imp-pendencias').innerText()
ok(/LOJA SO NO APP/i.test(pend) && /Padaria/i.test(pend), 'o painel mostra as pendências (clicando em "N pendências") com nome e valor')
const aberto = await page.locator('.imp-aberto').innerText()
ok(/LOJA SO NO APP/i.test(aberto) && /Padaria/i.test(aberto), 'a confirmação lista QUAIS são as pendências e os lançamentos só no app (não só a contagem)')
ok(/ignorada/.test(await page.locator('.imp-diferenca').innerText()) && /Pagamento recebido/i.test(await page.locator('.imp-diferenca').innerText()), 'a explicação da diferença lista as linhas ignoradas (possível saldo que o banco cobrou)')
ok(await page.locator('.imp-diferenca').count() === 1 && /De onde vem a diferença/.test(await page.locator('.imp-diferenca').innerText()), 'mostra de onde vem a diferença')
const prev = await textoPag()
ok(/Será gravado/.test(prev) && /Continua em aberto/.test(prev), 'prévia separa o que será gravado do que continua em aberto')
ok(/1 valor atualizado/.test(prev) && /→/.test(prev), 'prévia mostra a atualização de valor (antes → depois)')
ok(/1 parcelamento reconstruído/.test(prev) && /data estimada/.test(prev) && /cria 10 parcelas/.test(prev), 'prévia mostra o parcelamento completo com data estimada')
ok(/Divergências não resolvidas não serão corrigidas automaticamente/.test(prev), 'aviso de que divergências não são corrigidas sozinhas')
ok(/Importação:/.test(prev) && /Conciliação depois de gravar:/.test(prev) && /Conciliação parcial/.test(prev), 'estados de importação e conciliação separados (parcial)')
await page.screenshot({ path: join(TMP, '6-confirmar.png'), fullPage: true })

// rascunho salvo
await page.waitForTimeout(2200)
ok(chamadas.rpc.some(([n]) => n === 'salvar_rascunho_importacao'), 'o rascunho foi salvo no banco (sem gravar compras)')
ok(!chamadas.rpc.some(([n]) => n === 'aplicar_importacao'), 'nada foi gravado antes da confirmação')

// voltar não perde decisões
await page.getByRole('button', { name: '← Voltar' }).click()
await page.waitForSelector('.imp-filtros')
ok(true, 'voltar para a etapa 3')
await page.locator('.imp-progresso li').nth(3).getByRole('button').click()
await page.waitForSelector('.imp-confirmar-grade')
ok(/1 parcelamento reconstruído/.test(await textoPag()), 'avançar de novo mantém as decisões')

// muda de ideia: registrar só esta parcela (nada nos meses passados)
await page.getByRole('button', { name: '← Voltar' }).click()
await page.getByRole('button', { name: /Novas/ }).click()
await page.locator('.imp-linha', { hasText: 'Geladeira' }).locator('.imp-linha-topo').click()
await page.getByRole('button', { name: 'alterar a escolha' }).click()
await page.getByRole('button', { name: /Revisão/ }).click()
await page.locator('.imp-linha.revisao', { hasText: 'Geladeira' }).getByRole('button', { name: 'Registrar só esta parcela' }).click()
await page.getByRole('button', { name: /Continuar para confirmar/ }).click()
await page.waitForSelector('.imp-confirmar-grade')
ok(/só esta parcela/.test(await textoPag()) && !/cria 10 parcelas/.test(await textoPag()), 'prévia reflete a escolha "só esta parcela"')

// confirma
await page.getByRole('button', { name: 'Confirmar importação' }).click()
await page.waitForSelector('text=Importação concluída', { timeout: 8000 })
const aplic = chamadas.rpc.filter(([n]) => n === 'aplicar_importacao')
ok(aplic.length === 1, 'confirmar chama a gravação exatamente uma vez')
const d = aplic[0][1].p_dados
console.log('payload: criar', d.compras.map((c) => c.descricao), 'atualizar', JSON.stringify(d.atualizar), 'mover', d.mover.length, 'status', d.status_conciliacao)
ok(d.compras.length === 4, 'cria 4 compras (delivery novo, geladeira só esta parcela, estorno, loja completada)')
ok(d.compras.some((c) => c.descricao.toLowerCase().includes('geladeira') && c.parcelas === 1 && c.valor_total === 250 && c.fatura_mes === mes), 'só esta parcela: 1 compra de 250 na fatura em tela (sem criar as 10 parcelas)')
ok(d.compras.some((c) => Number(c.valor_total) === -30), 'estorno entra como crédito (valor negativo)')
ok(!d.compras.some((c) => /pagamento/i.test(c.descricao)), 'pagamento da fatura anterior NÃO é importado')
ok(d.atualizar.length === 1 && d.atualizar[0].compra_id === 'v1' && d.atualizar[0].valor_anterior === 200 && d.atualizar[0].valor_total === 205, 'atualiza o POSTO de 200 para 205 com o valor anterior (controle de concorrência)')
ok(!d.compras.some((c) => /padaria/i.test(c.descricao)), 'a padaria (revisar depois) NÃO foi criada')
ok(d.status_conciliacao === 'parcial', 'status de conciliação enviado: parcial')
ok(typeof d.chave === 'string' && d.chave.length >= 16, 'a gravação leva a impressão digital do arquivo (o banco exige)')
ok(typeof aplic[0][1].p_importacao === 'string' && aplic[0][1].p_importacao.length === 36, 'a gravação leva o id do lote')
const fim = await textoPag()
ok(/Importação concluída: 4 lançamentos gravados, 1 valor atualizado/.test(fim) && /Conciliação parcial/.test(fim), 'resultado: importação concluída e conciliação parcial, separados')
ok(/pendências abertas/i.test(fim), 'resultado mostra as pendências abertas')
await page.screenshot({ path: join(TMP, '7-resultado.png'), fullPage: true })

// --- celular
await page.setViewportSize({ width: 390, height: 800 })
await page.getByRole('button', { name: 'Importar outra fatura' }).click()
await page.locator('input[type=file][accept=".csv"]').setInputFiles(join(TMP, 'fatura.csv'))
await page.waitForSelector('.imp-config')
await page.getByRole('button', { name: /Analisar lançamentos/ }).click()
await page.getByRole('button', { name: /Revisar pendências/ }).click()
await page.waitForSelector('.imp-linha.revisao')
const larg = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }))
ok(larg.sw <= larg.cw + 1, `sem rolagem horizontal no celular (${larg.sw} <= ${larg.cw})`)
await page.screenshot({ path: join(TMP, '8-celular-revisao.png'), fullPage: false })

// --- retomada: o rascunho aparece e continua de onde parou
globalThis.__mostrarRascunho = true
await page.reload()
await page.waitForSelector('.imp-assistente')
await page.waitForSelector('.imp-rascunhos', { timeout: 8000 }).catch(() => {})
ok(await page.locator('.imp-rascunhos').count() === 1, 'rascunho em andamento aparece ao reabrir a tela')
if (await page.locator('.imp-rascunhos').count()) {
  await page.getByRole('button', { name: 'Continuar' }).click()
  await page.waitForSelector('.imp-progresso')
  ok(await page.locator('.imp-linha, .imp-resumos, .imp-confirmar-grade').count() > 0, 'continuar retoma a análise com as decisões salvas')
  await page.screenshot({ path: join(TMP, '9-retomado.png') })
}

// --- falha durante a confirmação: nada se perde e tentar de novo usa o MESMO id de lote
await page.setViewportSize({ width: 1280, height: 900 })
globalThis.__mostrarRascunho = false
await page.reload()
await page.waitForSelector('.imp-assistente')
await page.locator('input[type=file][accept=".csv"]').setInputFiles(join(TMP, 'fatura.csv'))
await page.waitForSelector('.imp-config')
await page.getByRole('button', { name: /Analisar lançamentos/ }).click()
await page.getByRole('button', { name: /Revisar pendências/ }).click()
await page.getByRole('button', { name: /Continuar para confirmar/ }).click()
await page.waitForSelector('.imp-confirmar-grade')
const antes = chamadas.rpc.filter(([n]) => n === 'aplicar_importacao').length
modoAplicar = 'falha'
await page.getByRole('button', { name: 'Confirmar importação' }).click()
await page.waitForSelector('[role=alert]', { timeout: 8000 })
ok(/não existe|Não consegui|importar/i.test(await page.locator('[role=alert]').first().innerText()), 'falha na confirmação mostra o erro em português')
ok(await page.locator('.imp-confirmar-grade').count() === 1, 'depois da falha continua na prévia, com tudo preservado')
await page.getByRole('button', { name: 'Confirmar importação' }).click()
await page.waitForSelector('text=Importação concluída', { timeout: 8000 })
const duas = chamadas.rpc.filter(([n]) => n === 'aplicar_importacao').slice(antes)
ok(duas.length === 2 && duas[0][1].p_importacao === duas[1][1].p_importacao, 'tentar de novo reenvia o mesmo id de lote (idempotente)')

// --- arquivo já importado: o banco devolve "repetida" e a tela avisa sem dizer que gravou
await page.reload()
await page.waitForSelector('.imp-assistente')
await page.locator('input[type=file][accept=".csv"]').setInputFiles(join(TMP, 'fatura.csv'))
await page.waitForSelector('.imp-config')
await page.getByRole('button', { name: /Analisar lançamentos/ }).click()
await page.getByRole('button', { name: /Revisar pendências/ }).click()
await page.getByRole('button', { name: /Continuar para confirmar/ }).click()
modoAplicar = 'repetida'
await page.getByRole('button', { name: 'Confirmar importação' }).click()
await page.waitForSelector('text=já foi importada', { timeout: 8000 })
const rep = await page.locator('.imp-assistente').innerText()
ok(/Nada foi gravado de novo/.test(rep) && !/Importação concluída/.test(rep), 'arquivo repetido: avisa que nada foi gravado (e não diz "concluída")')

// --- lançamento que a leitura perdeu + linha ignorada que não é pagamento
await page.reload()
await page.waitForSelector('.imp-assistente')
await page.locator('input[type=file][accept=".csv"]').setInputFiles(join(TMP, 'fatura.csv'))
await page.waitForSelector('.imp-config')
await page.getByRole('button', { name: /Analisar lançamentos/ }).click()
await page.getByRole('button', { name: /Revisar pendências/ }).click()
await page.getByRole('button', { name: /Ignoradas/ }).click()
await page.locator('.imp-linha.ignorada', { hasText: 'Pagamento' }).locator('.imp-linha-topo').click()
await page.getByRole('button', { name: /Não é pagamento/ }).click()
ok(await page.locator('.imp-linha.ignorada').count() === 0, 'linha ignorada: "não é pagamento" a devolve para a fatura (sai das ignoradas)')
await page.getByRole('button', { name: /Adicionar lançamento que faltou/ }).click()
await page.locator('.imp-manual input[type=date]').fill(dia(20))
await page.locator('.imp-manual input[placeholder^="Ex."]').fill('Juros do rotativo')
await page.locator('.imp-manual input[inputmode=decimal]').fill('12,34')
await page.locator('.imp-manual select').nth(0).selectOption('Alimentação')
await page.locator('.imp-manual select').nth(1).selectOption('Mercado')
await page.getByRole('button', { name: 'Adicionar à fatura' }).click()
await page.waitForSelector('text=Juros do rotativo')
ok(await page.locator('.imp-linha.nova', { hasText: 'Juros do rotativo' }).count() === 1, 'lançamento adicionado à mão aparece como linha nova (vai ser gravado só na confirmação)')
await page.getByRole('button', { name: /Continuar para confirmar/ }).click()
await page.waitForSelector('.imp-confirmar-grade')
ok(/Juros do rotativo/.test(await page.locator('.imp-gravar').innerText()), 'o lançamento adicionado à mão entra em "Será gravado"')

// --- conciliação posterior: a fatura já importada volta para conferência, sem criar outro lote
globalThis.__mostrarConcluidas = true
await page.reload()
await page.waitForSelector('.imp-importadas', { timeout: 10000 })
const lista = await page.locator('.imp-importadas').innerText()
ok(/Importação concluída/.test(lista) && /Conciliação parcial/.test(lista) && /1 pendência/.test(lista), 'lista de faturas importadas mostra importação concluída e conciliação parcial, separadas')
const antesConc = chamadas.rpc.length
await page.getByRole('button', { name: 'Conferir de novo' }).click()
await page.waitForSelector('.imp-reconferir', { timeout: 8000 })
ok(/Reconferindo uma fatura já importada/.test(await page.locator('.imp-reconferir').innerText()), 'reconferir mostra aviso de que nada será duplicado')
ok(await page.locator('.imp-linha.revisao', { hasText: 'POSTO' }).count() === 1, 'a pendência (valor diferente) volta para revisão, comparada com o app de agora')
ok(await page.locator('.imp-linha.revisao', { hasText: 'MERCADO' }).count() === 0, 'a linha que já está registrada não vira pendência')
await page.locator('.imp-linha.revisao', { hasText: 'POSTO' }).getByRole('button', { name: /Atualizar para/ }).click()
await page.getByRole('button', { name: /Continuar para confirmar/ }).click()
await page.waitForSelector('.imp-confirmar-grade')
ok(await page.getByRole('button', { name: 'Confirmar conferência' }).isEnabled(), 'botão vira "Confirmar conferência"')
await page.getByRole('button', { name: 'Confirmar conferência' }).click()
await page.waitForSelector('text=Conferência aplicada', { timeout: 8000 })
const conc = chamadas.rpc.filter(([n]) => n === 'aplicar_conciliacao')
ok(conc.length === 1 && conc[0][1].p_importacao === 'lote-antigo' && typeof conc[0][1].p_operacao === 'string' && conc[0][1].p_operacao.length === 36, 'a conferência usa o mesmo lote e uma rodada própria')
ok(conc[0][1].p_dados.atualizar?.length === 1 && conc[0][1].p_dados.atualizar[0].valor_anterior === 200 && conc[0][1].p_dados.compras.length === 0, 'só o valor é atualizado (nada é criado de novo)')
ok(!chamadas.rpc.slice(antesConc).some(([n]) => n === 'aplicar_importacao' || n === 'salvar_rascunho_importacao'), 'conferência não cria outro lote nem rascunho')
ok(erros.length === 0, `sem erros no console/página ${erros.length ? '→ ' + erros.slice(0, 3).join(' | ') : ''}`)
await browser.close()
servidor.close()
console.log(falhas.length ? `\n${falhas.length} FALHA(S)` : '\nTUDO OK')
process.exit(falhas.length ? 1 : 0)
