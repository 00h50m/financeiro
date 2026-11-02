import { describe, it, expect } from 'vitest'
import { analisarLinhas } from '../importacao'
import { naturezaDaLinha, decisaoPatch, classificarLinha, analisarFatura, detalheDiferenca } from '../conciliacaoFatura'

const categorias = [{ nome: 'Alimentação', subcategorias: ['Mercado', 'Delivery'] }, { nome: 'Transporte', subcategorias: ['Uber/99/Táxi'] }]
const cartoes = [{ id: 'c1', nome: 'Nubank' }]
const MES = '2026-09'
let seq = 0
const compra = (o) => ({ id: 'k' + ++seq, data_compra: '2026-09-12', descricao: 'Mercado Extra', cartao_id: 'c1', valor_total: 100, parcelas: 1, origem: 'manual', ...o })
let idl = 0
const linha = (o) => ({ _id: ++idl, data: '2026-09-12', descricao: 'Mercado Extra', descricaoOriginal: 'MERCADO EXTRA', valor: 100, cartao_id: 'c1', parcela_atual: '', parcela_total: '', categoria: 'Alimentação', subcategoria: 'Mercado', pessoa: 'Giovanna', identificacao: '', incluir: true, ...o })

// Faz o que a tela faz antes de classificar: casa cada linha com as compras lançadas e liga/desliga "incluir".
function preparar(ls, compras, extra = {}) {
  const decididas = ls.map((_, i) => i).filter((i) => ls[i].decisao !== 'outra')
  const parciais = analisarLinhas(decididas.map((i) => ls[i]), { compras, cartoes, mesFatura: MES, ...extra })
  const achados = ls.map(() => ({ correspondencia: null }))
  decididas.forEach((i, j) => { achados[i] = parciais[j] })
  return ls.map((l, i) => {
    const tipo = achados[i].correspondencia?.tipo
    const ja = ['exata', 'parecida', 'valor_diferente', 'parcelamento'].includes(tipo)
    return { ...l, correspondencia: achados[i].correspondencia, incluir: l.incluirManual ? l.incluir : l.decisao === 'outra' || !ja }
  })
}
const analisar = (ls, compras, extra = {}) => analisarFatura({ linhas: preparar(ls, compras), compras, cartoes, cartaoId: 'c1', mes: MES, categorias, ...extra })
const grupos = (a) => a.linhas.map((l) => l.grupo)

describe('natureza da linha', () => {
  it('compra, estorno/crédito, encargo e pagamento da fatura', () => {
    expect(naturezaDaLinha(linha())).toBe('compra')
    expect(naturezaDaLinha(linha({ valor: -45.9, descricao: 'Estorno Loja X' }))).toBe('credito')
    expect(naturezaDaLinha(linha({ descricao: 'IOF compra internacional', valor: 3.2 }))).toBe('encargo')
    expect(naturezaDaLinha(linha({ descricao: 'Juros rotativo', valor: 40 }))).toBe('encargo')
    expect(naturezaDaLinha(linha({ descricao: 'Pagamento recebido', valor: -2000 }))).toBe('pagamento')
    expect(naturezaDaLinha(linha({ descricao: 'Anuidade 3/12', valor: 25 }))).toBe('encargo')
  })
})

describe('grupos da análise', () => {
  it('importação de CSV válido: novas, já registradas e revisão, com contadores', () => {
    const lancadas = [compra({ descricao: 'Mercado Extra', valor_total: 100 }), compra({ descricao: 'Uber Trip', data_compra: '2026-09-05', valor_total: 25 })]
    const ls = [
      linha({ descricao: 'Mercado Extra', valor: 100 }),
      linha({ descricao: 'Uber Trip', data: '2026-09-05', valor: 25, categoria: 'Transporte', subcategoria: 'Uber/99/Táxi' }),
      linha({ descricao: 'Padaria Nova', data: '2026-09-14', valor: 18 }),
      linha({ descricao: 'Delivery X', data: '2026-09-15', valor: 60, subcategoria: 'Delivery' }),
      linha({ descricao: 'Sem categoria', data: '2026-09-16', valor: 10, categoria: '', subcategoria: '' }),
    ]
    const a = analisar(ls, lancadas)
    expect(grupos(a)).toEqual(['registrada', 'registrada', 'nova', 'nova', 'revisao'])
    expect(a.contadores).toMatchObject({ identificadas: 5, registradas: 2, novas: 2, selecionadas: 2, revisao: 1, bloqueadas: 1 })
    expect(a.linhas[4].motivos).toEqual(['dados_incompletos'])
    expect(a.linhas[4].bloqueios).toContain('falta a categoria')
  })
  it('categoria ausente bloqueia só a linha afetada: as outras continuam importáveis', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18 }), linha({ descricao: 'Sem cat', valor: 9, categoria: '', subcategoria: '' })], [])
    expect(a.linhas.map((l) => l.selecionada)).toEqual([true, false])
    expect(a.painel.novasSelecionadas).toBe(18)
  })
  it('duas compras iguais no mesmo dia: com uma lançada, uma é registrada e a outra nova', () => {
    const a = analisar([linha(), linha()], [compra()])
    expect(grupos(a)).toEqual(['registrada', 'nova'])
    const dois = analisar([linha(), linha()], [])
    expect(grupos(dois)).toEqual(['nova', 'nova'])
    expect(dois.linhas.every((l) => l.repetidaNoArquivo)).toBe(true)
  })
  it('arquivo repetido (tudo já lançado): nada novo, tudo registrado', () => {
    const ls = [linha({ descricao: 'A Loja', valor: 10 }), linha({ descricao: 'B Loja', valor: 20, data: '2026-09-13' })]
    const lancadas = ls.map((l) => compra({ descricao: l.descricao, data_compra: l.data, valor_total: l.valor }))
    const a = analisar(ls, lancadas)
    expect(a.contadores).toMatchObject({ registradas: 2, novas: 0, revisao: 0, pendencias: 0 })
  })
})

describe('correspondência provável exige revisão (nada é vinculado só por semelhança)', () => {
  const lancadas = () => [compra({ descricao: 'Mercado Extra Ltda', data_compra: '2026-09-14', valor_total: 100 })]
  const ls = () => [linha({ descricao: 'Mercado Extra', data: '2026-09-12', valor: 100 })]
  it('sem decisão: fica em revisão e não é importada', () => {
    const a = analisar(ls(), lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'revisao', motivos: ['correspondencia_provavel'], acao: 'comparar', selecionada: false })
  })
  it('é a mesma compra: vira registrada confirmada, sem criar outra', () => {
    const a = analisar([{ ...ls()[0], ...decisaoPatch('mesma') }], lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'registrada', confirmada: true, selecionada: false })
    expect(a.painel.novasSelecionadas).toBe(0)
  })
  it('é outra compra: vira nova e entra na prévia', () => {
    const a = analisar([{ ...ls()[0], ...decisaoPatch('outra') }], lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'nova', selecionada: true })
    expect(a.painel.novasSelecionadas).toBe(100)
  })
  it('revisar depois: continua pendente e não impede as outras', () => {
    const a = analisar([{ ...ls()[0], ...decisaoPatch('depois') }, linha({ descricao: 'Padaria', valor: 18 })], lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'revisao', adiada: true })
    expect(a.linhas[1].selecionada).toBe(true)
    expect(a.contadores).toMatchObject({ revisao: 1, adiadas: 1, selecionadas: 1 })
  })
  it('desfazer a decisão volta ao que o app sugeriu', () => {
    const decidida = { ...ls()[0], ...decisaoPatch('mesma') }
    const desfeita = { ...decidida, ...decisaoPatch(null) }
    expect(analisar([desfeita], lancadas()).linhas[0].grupo).toBe('revisao')
  })
})

describe('valor divergente nunca é pareado sozinho', () => {
  const lancadas = () => [compra({ descricao: 'Mercado Extra', valor_total: 100 })]
  const ls = (o = {}) => [linha({ descricao: 'Mercado Extra', valor: 103, ...o })]
  it('vira revisão "valor diferente" com a ação de comparar o valor', () => {
    const a = analisar(ls(), lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'revisao', motivos: ['valor_diferente'], acao: 'comparar_valor', selecionada: false })
  })
  it('manter o valor existente: vinculada, e a diferença continua aparecendo na conciliação', () => {
    const a = analisar(ls(decisaoPatch('manter')), lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'registrada', confirmada: true, divergenciaValor: true })
    expect(a.painel.diferenca).toBe(-3) // projetado 100 contra a fatura 103
    expect(a.statusProjetado).toBe('parcial')
  })
  it('atualizar o valor existente: o projetado já considera o valor da fatura e a conciliação fecha', () => {
    const a = analisar(ls(decisaoPatch('atualizar')), lancadas())
    expect(a.painel.ajusteAtualizar).toBe(3)
    expect(a.painel.projetado).toBe(103)
    expect(a.painel.diferenca).toBe(0)
    expect(a.statusProjetado).toBe('conciliada')
  })
  it('tratar como compra diferente: nova, e a compra existente vira divergência no app', () => {
    const a = analisar(ls(decisaoPatch('outra')), lancadas())
    expect(a.linhas[0]).toMatchObject({ grupo: 'nova', selecionada: true })
    expect(a.grupos.divergenciasApp).toHaveLength(1)
    expect(a.statusProjetado).toBe('parcial')
  })
})

describe('compra em outra fatura e conta fixa', () => {
  it('já lançada, mas em outro mês: revisão "outra fatura"', () => {
    const a = analisar([linha({ descricao: 'Mercado Extra', data: '2026-09-12', valor: 100 })], [compra({ data_compra: '2026-09-12', fatura_mes: '2026-10' })])
    expect(a.linhas[0]).toMatchObject({ grupo: 'revisao', motivos: ['outra_fatura'], acao: 'mover_fatura' })
  })
  it('linha que é conta fixa no cartão (recorrente) conta como registrada', () => {
    const fixos = [{ id: 'f1', nome: 'Netflix', valor: 55.9, ativo: true, cartao_id: 'c1', mes_inicio: '2026-01' }]
    const a = analisarFatura({ linhas: preparar([linha({ descricao: 'Netflix', valor: 55.9, categoria: 'Alimentação', subcategoria: 'Mercado' })], []), compras: [], cartoes, fixos, cartaoId: 'c1', mes: MES, categorias })
    expect(a.linhas[0].grupo).toBe('registrada')
    expect(a.grupos.divergenciasApp).toHaveLength(0)
  })
})

describe('parcelamentos', () => {
  it('parcela em andamento com parcelamento existente: registrada', () => {
    const parcelada = compra({ descricao: 'Notebook Dell', data_compra: '2026-07-01', valor_total: 3000, parcelas: 10 })
    const a = analisar([linha({ descricao: 'Notebook Dell', data: '2026-09-02', valor: 300, parcela_atual: '3', parcela_total: '10' })], [parcelada])
    expect(a.linhas[0].grupo).toBe('registrada')
  })
  it('parcela intermediária sem parcelamento no app: pede confirmação específica antes de criar', () => {
    const l = linha({ descricao: 'Geladeira', valor: 250, parcela_atual: '3', parcela_total: '10' })
    const a = analisar([l], [])
    expect(a.linhas[0]).toMatchObject({ grupo: 'revisao', motivos: ['parcelamento_sem_registro'], acao: 'confirmar_parcelamento', selecionada: false })
    const b = analisar([{ ...l, parcelamentoConfirmado: true }], [])
    expect(b.linhas[0]).toMatchObject({ grupo: 'nova', selecionada: true })
  })
  it('primeira parcela (1/3) é uma compra nova normal', () => {
    const a = analisar([linha({ descricao: 'Sofá', valor: 400, parcela_atual: '1', parcela_total: '3' })], [])
    expect(a.linhas[0].grupo).toBe('nova')
  })
})

describe('estorno, crédito, encargos e pagamento', () => {
  it('pagamento da fatura anterior não entra no total nem na importação', () => {
    const a = analisar([linha({ descricao: 'Pagamento recebido', valor: -2000 }), linha({ descricao: 'Padaria', valor: 18 })], [])
    expect(a.linhas[0]).toMatchObject({ grupo: 'ignorada', natureza: 'pagamento', selecionada: false })
    expect(a.painel.totalExtraido).toBe(18)
    expect(a.painel.naturezas.pagamento).toEqual({ qtd: 1, valor: -2000 })
  })
  it('estorno e crédito: separados das compras no painel, importáveis como crédito, e reduzem o total', () => {
    const a = analisar([linha({ descricao: 'Loja Y', valor: 200 }), linha({ descricao: 'Estorno Loja Y', valor: -45.9, data: '2026-09-20' })], [])
    expect(a.linhas[1].natureza).toBe('credito')
    expect(a.painel.naturezas.credito).toEqual({ qtd: 1, valor: -45.9 })
    expect(a.painel.naturezas.compra.valor).toBe(200)
    expect(a.painel.totalExtraido).toBe(154.1)
  })
  it('estorno não é pareado com a compra original só por semelhança', () => {
    const a = analisar([linha({ descricao: 'Loja Y', valor: -200 })], [compra({ descricao: 'Loja Y', valor_total: 200 })])
    expect(a.linhas[0].grupo).not.toBe('registrada')
  })
  it('encargos (juros, IOF, tarifa) aparecem à parte', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18 }), linha({ descricao: 'IOF compra internacional', valor: 3.2 })], [])
    expect(a.painel.naturezas.encargo).toEqual({ qtd: 1, valor: 3.2 })
    expect(a.painel.totalExtraido).toBe(21.2)
  })
})

describe('painel e status de conciliação', () => {
  it('total do banco: o projetado depois de importar fecha com o banco → conciliada; antes de importar, parcial', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18 }), linha({ descricao: 'Loja', valor: 82, data: '2026-09-13' })], [], { totalBanco: 100 })
    expect(a.painel).toMatchObject({ totalBanco: 100, totalExtraido: 100, totalApp: 0, novasSelecionadas: 100, projetado: 100, diferenca: 0, baseDiferenca: 'banco' })
    expect(a.painel.valores).toEqual({ confirmado: 0, estimado: 100, projetado: 100 })
    expect(a.statusProjetado).toBe('conciliada')
    expect(a.statusAtual).toBe('parcial') // enquanto não importa, as novas ainda não estão no app
  })
  it('diferença com o banco impede "conciliada" mesmo com tudo resolvido', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18 })], [], { totalBanco: 25 })
    expect(a.painel.diferenca).toBe(-7)
    expect(a.statusProjetado).toBe('parcial')
  })
  it('importação parcial com pendências: o que é válido entra e a conciliação fica parcial', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18 }), linha({ descricao: 'Mercado Extra', data: '2026-09-14', valor: 100 })], [compra({ descricao: 'Mercado Extra Ltda', data_compra: '2026-09-16', valor_total: 100 })])
    expect(a.contadores).toMatchObject({ selecionadas: 1, revisao: 1, pendencias: 1 })
    expect(a.statusProjetado).toBe('parcial')
  })
  it('sem total do banco: compara com o arquivo e avisa', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18 })], [])
    expect(a.painel).toMatchObject({ semTotalBanco: true, baseDiferenca: 'arquivo', diferenca: 0 })
  })
  it('tudo já registrado e totais fecham: conciliada também agora (sem importar nada)', () => {
    const l = linha({ descricao: 'Padaria', valor: 18 })
    const a = analisar([l], [compra({ descricao: 'Padaria', valor_total: 18 })], { totalBanco: 18 })
    expect(a.statusAtual).toBe('conciliada')
  })
  it('nada resolvido: pendente', () => {
    expect(analisar([linha({ categoria: '', subcategoria: '' })], []).statusProjetado).toBe('pendente')
  })
  it('TOTAIS IGUAIS COM LANÇAMENTOS DIFERENTES não conciliam', () => {
    // o app tem A=100 e B=50; o arquivo tem C=100 e D=50: somam 150 nos dois lados, mas nada casa
    const lancadas = [compra({ descricao: 'Loja A', valor_total: 100, data_compra: '2026-09-02' }), compra({ descricao: 'Loja B', valor_total: 50, data_compra: '2026-09-03' })]
    const a = analisar([linha({ descricao: 'Restaurante C', valor: 100, data: '2026-09-20' }), linha({ descricao: 'Cinema D', valor: 50, data: '2026-09-21' })], lancadas, { totalBanco: 150 })
    expect(a.painel.totalApp).toBe(150)
    expect(a.painel.totalExtraido).toBe(150)
    expect(a.grupos.divergenciasApp).toHaveLength(2)
    expect(a.statusAtual).not.toBe('conciliada')
    expect(a.statusProjetado).toBe('parcial')
  })
  it('linha deixada de fora (desmarcada) mantém a fatura parcial', () => {
    const a = analisar([linha({ descricao: 'Padaria', valor: 18, incluir: false, incluirManual: true }), linha({ descricao: 'Loja', valor: 5, data: '2026-09-13' })], [])
    expect(a.contadores).toMatchObject({ deixadasDeFora: 1, selecionadas: 1 })
    expect(a.statusProjetado).toBe('parcial')
  })
})

describe('decisaoPatch', () => {
  it('traduz cada decisão para o estado da linha', () => {
    expect(decisaoPatch('mesma')).toEqual({ decisao: 'mesma', incluir: false, incluirManual: true })
    expect(decisaoPatch('outra')).toEqual({ decisao: 'outra', incluir: true, incluirManual: true })
    expect(decisaoPatch('depois').incluir).toBe(false)
    expect(decisaoPatch('manter').incluir).toBe(false)
    expect(decisaoPatch(undefined)).toEqual({ decisao: undefined, incluirManual: false })
  })
  it('classificarLinha é pura (não altera a entrada)', () => {
    const l = linha({ correspondencia: null })
    const copia = JSON.stringify(l)
    classificarLinha(l, { categorias })
    expect(JSON.stringify(l)).toBe(copia)
  })
})

describe('colocar na fatura (mover)', () => {
  it('compra lançada em outra fatura: mover conta no projetado e vira registrada', () => {
    const c = compra({ data_compra: '2026-09-12', fatura_mes: '2026-10', valor_total: 100 })
    const a = analisar([{ ...linha({ descricao: 'Mercado Extra', valor: 100 }), ...decisaoPatch('mover') }], [c], { totalBanco: 100 })
    expect(a.linhas[0]).toMatchObject({ grupo: 'registrada', moverParaEstaFatura: true })
    expect(a.painel).toMatchObject({ totalApp: 0, ajusteMover: 100, projetado: 100, diferenca: 0 })
    expect(a.statusProjetado).toBe('conciliada')
    expect(a.statusAtual).toBe('parcial') // enquanto o movimento não é gravado, a compra ainda está na outra fatura
  })
})

describe('detalhe da diferença', () => {
  it('lista o que está em aberto, soma cada grupo e explica a diferença com o total do banco', () => {
    const compras = [compra({ id: 'so-app', descricao: 'Loja só no app', valor_total: 77, data_compra: '2026-09-08' })]
    const ls = [linha({ descricao: 'Compra nova qualquer', descricaoOriginal: 'COMPRA NOVA', valor: 60, incluirManual: true, incluir: false })]
    const a = analisar(ls, compras, { totalBanco: 500 })
    const d = detalheDiferenca(a)
    expect(d.soNoApp.map((x) => x.nome)).toEqual(['Loja só no app'])
    expect(d.totais.soNoApp).toBe(77)
    expect(d.deixadas).toHaveLength(1)
    expect(d.totais.deixadas).toBe(60)
    expect(d.totais.leitura).toBe(60 - 500) // arquivo (60) − banco (500)
    expect(d.diferenca).toBe(a.painel.diferenca)
    // importando a deixada e tirando a que só está no app, a diferença muda exatamente por esses valores
    expect(d.seResolvido).toBe(Math.round((a.painel.diferenca + 60 - 77) * 100) / 100)
  })
})

describe('rede de segurança contra duplicidade', () => {
  it('avisa quando uma compra nova tem mesmo valor e data próxima de algo que só está no app', () => {
    const compras = [compra({ id: 'no-app', descricao: 'Livraria Cultura', valor_total: 88, data_compra: '2026-09-10' })]
    const a = analisar([linha({ descricao: 'Loja Outra Cidade', descricaoOriginal: 'LOJA OUTRA', valor: 88, data: '2026-09-11' })], compras)
    const d = detalheDiferenca(a)
    expect(d.possiveisDuplicadas).toHaveLength(1)
    expect(d.possiveisDuplicadas[0].noApp).toBe('Livraria Cultura')
  })
  it('não avisa com valor diferente, data distante ou linha que não será criada', () => {
    const compras = [compra({ id: 'no-app', descricao: 'Livraria Cultura', valor_total: 88, data_compra: '2026-09-02' })]
    expect(detalheDiferenca(analisar([linha({ descricao: 'Loja X', valor: 88, data: '2026-09-20' })], compras)).possiveisDuplicadas).toHaveLength(0)
    expect(detalheDiferenca(analisar([linha({ descricao: 'Loja X', valor: 90, data: '2026-09-03' })], compras)).possiveisDuplicadas).toHaveLength(0)
  })
})

describe('linhas ignoradas e natureza manual', () => {
  it('"não é pagamento" devolve a linha para a fatura e ela entra no total do arquivo', () => {
    const pag = linha({ descricao: 'Saldo restante da fatura anterior', descricaoOriginal: 'SALDO RESTANTE DA FATURA ANTERIOR', valor: 84.33 })
    const antes = analisar([pag], [], { totalBanco: 84.33 })
    expect(antes.contadores.ignoradas).toBe(1)
    expect(antes.painel.totalExtraido).toBe(0)
    expect(detalheDiferenca(antes).ignoradas[0].bateComFalta).toBe(true) // o valor da linha ignorada é exatamente o que falta
    const depois = analisar([{ ...pag, naturezaManual: 'encargo' }], [], { totalBanco: 84.33 })
    expect(depois.contadores.ignoradas).toBe(0)
    expect(depois.painel.totalExtraido).toBe(84.33)
  })
})
