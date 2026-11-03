import { describe, it, expect } from 'vitest'
import { grupoDaAba, AREAS, areasVisiveis, areaDaAba, hashDaAba, hashDaRota, abaDoHash, rotaDoHash, resolverRota, abaInicial, rotaInicial, destinoDaArea, atalhoDaArea, ATALHOS, lerLembradas } from '../navegacao'

// Todas as telas que existem no app (ids de src/App.jsx). Se uma tela nova for criada sem área, este teste avisa.
const TODAS = ['inicio', 'analises', 'busca', 'inbox', 'compras', 'parcelamentos', 'faturas', 'pagamentos', 'divididos', 'importar',
  'meuplano', 'renda', 'aulas', 'atendimentos', 'cenario', 'dividas', 'fixos', 'orcamento', 'fechamento', 'metas', 'reserva', 'simulador', 'emprestimos',
  'cartoes', 'categorias', 'pessoas', 'regras', 'automacoes', 'config', 'backup']

describe('áreas de navegação', () => {
  it('toda tela pertence a exatamente uma área (nenhuma some, nenhuma repete)', () => {
    const todas = AREAS.flatMap((a) => a.abas)
    expect([...todas].sort()).toEqual([...TODAS].sort())
    expect(new Set(todas).size).toBe(todas.length)
  })
  it('são 6 áreas e o padrão de cada uma pertence a ela', () => {
    expect(AREAS.map((a) => a.id)).toEqual(['inicio', 'movimentacoes', 'cartoes', 'planejamento', 'analises', 'mais'])
    AREAS.forEach((a) => expect(a.abas).toContain(a.padrao))
  })
  it('perfil esteticista: "aulas" some e a área segue funcionando; perfil padrão esconde "atendimentos"', () => {
    const est = areasVisiveis(['aulas'])
    expect(est.find((a) => a.id === 'planejamento').abas).not.toContain('aulas')
    expect(est.find((a) => a.id === 'planejamento').abas).toContain('atendimentos')
    const pad = areasVisiveis(['atendimentos'])
    expect(pad.find((a) => a.id === 'planejamento').abas).not.toContain('atendimentos')
    expect(pad.find((a) => a.id === 'planejamento').abas).toContain('aulas')
  })
  it('área que perde a tela padrão passa a usar a primeira que sobrou; área vazia some', () => {
    const v = areasVisiveis(['meuplano'])
    expect(v.find((a) => a.id === 'planejamento').padrao).toBe('renda')
    expect(areasVisiveis(AREAS.find((a) => a.id === 'inicio').abas).some((a) => a.id === 'inicio')).toBe(false)
  })
  it('areaDaAba encontra a área; tela desconhecida não tem área', () => {
    expect(areaDaAba('faturas').id).toBe('cartoes')
    expect(areaDaAba('analises').id).toBe('analises')
    expect(areaDaAba('nao-existe')).toBeNull()
  })
})

describe('endereço por tela (#/pagamentos)', () => {
  it('formata e lê de volta', () => {
    expect(hashDaAba('pagamentos')).toBe('#/pagamentos')
    expect(abaDoHash('#/pagamentos', TODAS)).toBe('pagamentos')
    expect(abaDoHash('#/faturas/', TODAS)).toBe('faturas')
  })
  it('ignora endereço inválido, de tela escondida ou vazio', () => {
    expect(abaDoHash('#/nao-existe', TODAS)).toBeNull()
    expect(abaDoHash('#/aulas', TODAS.filter((x) => x !== 'aulas'))).toBeNull()
    expect(abaDoHash('', TODAS)).toBeNull()
    expect(abaDoHash('#pagamentos', TODAS)).toBeNull()
    expect(abaDoHash('#/<script>', TODAS)).toBeNull()
  })
  it('abaInicial: link direto vence a última tela salva; sem nenhum dos dois, Início', () => {
    expect(abaInicial({ hash: '#/inbox', salva: 'compras', validas: TODAS })).toBe('inbox')
    expect(abaInicial({ hash: '', salva: 'compras', validas: TODAS })).toBe('compras')
    expect(abaInicial({ hash: '#/xxx', salva: 'yyy', validas: TODAS })).toBe('inicio')
  })
})

describe('tocar numa área e atalhos do celular', () => {
  const mov = AREAS.find((a) => a.id === 'movimentacoes')
  it('abre a última tela usada na área, se ainda existir; senão a principal', () => {
    expect(destinoDaArea(mov, { movimentacoes: 'compras' })).toBe('compras')
    expect(destinoDaArea(mov, { movimentacoes: 'faturas' })).toBe('pagamentos') // guardada em outra área: ignora
    expect(destinoDaArea(mov, {})).toBe('pagamentos')
  })
  it('barra inferior tem 5 atalhos e Análises fica sob "Mais"', () => {
    expect(ATALHOS).toHaveLength(5)
    expect(atalhoDaArea('analises')).toBe('mais')
    expect(atalhoDaArea('mais')).toBe('mais')
    expect(atalhoDaArea('cartoes')).toBe('cartoes')
  })
  it('lerLembradas aguenta lixo no armazenamento', () => {
    expect(lerLembradas('{"mais":"backup"}')).toEqual({ mais: 'backup' })
    expect(lerLembradas('nao é json')).toEqual({})
    expect(lerLembradas('[1,2]')).toEqual({})
    expect(lerLembradas(null)).toEqual({})
  })
})

describe('telas que viraram abas (atalhos antigos continuam funcionando)', () => {
  it('resolve os ids antigos para a tela e a aba novas', () => {
    expect(resolverRota('dashboard')).toEqual({ aba: 'analises', sub: 'visao' })
    expect(resolverRota('graficos')).toEqual({ aba: 'analises', sub: 'evolucao' })
    expect(resolverRota('evolucao')).toEqual({ aba: 'analises', sub: 'evolucao' })
    expect(resolverRota('porpessoa')).toEqual({ aba: 'analises', sub: 'pessoas' })
    expect(resolverRota('calendario')).toEqual({ aba: 'pagamentos', sub: 'calendario' })
    expect(resolverRota('faturas')).toEqual({ aba: 'faturas', sub: null })
    expect(resolverRota('analises', 'categorias')).toEqual({ aba: 'analises', sub: 'categorias' })
  })
  it('endereços antigos e novos abrem a tela certa', () => {
    expect(rotaDoHash('#/dashboard', TODAS)).toEqual({ aba: 'analises', sub: 'visao' })
    expect(rotaDoHash('#/analises/orcado', TODAS)).toEqual({ aba: 'analises', sub: 'orcado' })
    expect(rotaDoHash('#/calendario', TODAS)).toEqual({ aba: 'pagamentos', sub: 'calendario' })
    expect(rotaDoHash('#/pagamentos/calendario/', TODAS)).toEqual({ aba: 'pagamentos', sub: 'calendario' })
    expect(abaDoHash('#/porpessoa', TODAS)).toBe('analises')
  })
  it('endereço inválido ou de tela escondida pelo perfil é ignorado', () => {
    expect(rotaDoHash('#/aulas', TODAS.filter((x) => x !== 'aulas'))).toBeNull()
    expect(rotaDoHash('#/analises/<x>', TODAS)).toBeNull()
    expect(rotaDoHash('#/a/b/c', TODAS)).toBeNull()
  })
  it('última tela guardada com id antigo também é reconhecida', () => {
    expect(rotaInicial({ hash: '', salva: 'dashboard', validas: TODAS })).toEqual({ aba: 'analises', sub: 'visao' })
    expect(abaInicial({ hash: '', salva: 'porpessoa', validas: TODAS })).toBe('analises')
    expect(hashDaRota('analises', 'evolucao')).toBe('#/analises/evolucao')
    expect(hashDaRota('faturas')).toBe('#/faturas')
  })
})

describe('grupos do Planejamento', () => {
  const plan = AREAS.find((a) => a.id === 'planejamento')
  it('as 13 telas ficam em 4 grupos por jornada, sem repetir nem perder nenhuma', () => {
    expect(plan.grupos.map(([t]) => t)).toEqual(['Planejar', 'Dívidas', 'Fechar o mês', 'Negócios'])
    expect(plan.grupos.flatMap(([, ids]) => ids)).toEqual(plan.abas)
  })
  it('perfil esconde telas dentro do grupo; grupo que esvazia some', () => {
    const est = areasVisiveis(['aulas']).find((a) => a.id === 'planejamento')
    expect(est.grupos.find(([t]) => t === 'Negócios')[1]).toEqual(['atendimentos'])
    const sem = areasVisiveis(['aulas', 'atendimentos']).find((a) => a.id === 'planejamento')
    expect(sem.grupos.map(([t]) => t)).not.toContain('Negócios')
  })
  it('grupoDaAba devolve o título do grupo de cada tela', () => {
    const g = grupoDaAba(plan)
    expect(g.renda).toBe('Planejar'); expect(g.emprestimos).toBe('Dívidas'); expect(g.fechamento).toBe('Fechar o mês'); expect(g.aulas).toBe('Negócios')
    expect(grupoDaAba(AREAS.find((a) => a.id === 'cartoes'))).toEqual({})
  })
})
