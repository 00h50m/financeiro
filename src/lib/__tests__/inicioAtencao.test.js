import { describe, it, expect } from 'vitest'
import { itensDeAtencao } from '../inicio'
import { GLOSSARIO } from '../glossario'

describe('"Precisa da sua atenção"', () => {
  it('sem nada pendente a lista é vazia (a tela mostra "tudo em dia")', () => {
    expect(itensDeAtencao({})).toEqual([])
  })
  it('ordena do mais urgente ao menos urgente: vencidas, avisos, informativos', () => {
    const itens = itensDeAtencao({
      proximos7: { n: 2, valor: 320 }, inboxPendentes: 3, atrasadas: { n: 1, valor: 1500 },
      faturasComDiferenca: [{ nome: 'Inter', diferenca: 150 }], aReceber: [{ valor: 400, rotulo: 'aulas ainda não recebidas', tela: 'aulas' }],
    })
    expect(itens.map((i) => i.chave)).toEqual(['vencidas', 'faturas', 'inbox', 'proximos7', 'receber-aulas'])
    expect(itens.map((i) => i.tom)).toEqual(['erro', 'aviso', 'aviso', 'info', 'info'])
  })
  it('cada item tem uma ação que leva a uma tela', () => {
    const itens = itensDeAtencao({ atrasadas: { n: 2, valor: 100 }, inboxPendentes: 1, faturasParaConciliar: 2, semRenda: true, dividasAtrasadas: 1 })
    expect(itens.every((i) => i.acao.rotulo && i.acao.tela)).toBe(true)
    expect(itens.find((i) => i.chave === 'vencidas').acao.tela).toBe('pagamentos')
    expect(itens.find((i) => i.chave === 'inbox').acao.tela).toBe('inbox')
    expect(itens.find((i) => i.chave === 'conciliar').acao.tela).toBe('importar')
    expect(itens.find((i) => i.chave === 'dividas').acao.tela).toBe('dividas')
  })
  it('singular e plural, e os valores em reais', () => {
    expect(itensDeAtencao({ atrasadas: { n: 1, valor: 1500 } })[0].titulo).toBe('1 conta vencida')
    expect(itensDeAtencao({ atrasadas: { n: 3, valor: 1500 } })[0].titulo).toBe('3 contas vencidas')
    expect(itensDeAtencao({ atrasadas: { n: 1, valor: 1500 } })[0].detalhe).toMatch(/R\$\s1\.500,00/)
    expect(itensDeAtencao({ faturasComDiferenca: [{ nome: 'Inter', diferenca: 150 }, { nome: 'Nubank', diferenca: -50 }] })[0].titulo).toBe('2 faturas com diferença')
  })
  it('a ordem é estável dentro do mesmo grau de urgência', () => {
    const itens = itensDeAtencao({ semRenda: true, faturasComDiferenca: [{ nome: 'X', diferenca: 1 }], inboxPendentes: 2 })
    expect(itens.map((i) => i.chave)).toEqual(['renda', 'faturas', 'inbox'])
  })
  it('valor a receber zerado não vira item', () => {
    expect(itensDeAtencao({ aReceber: [{ valor: 0, rotulo: 'x', tela: 'aulas' }] })).toEqual([])
  })
})

describe('cobranças recorrentes no Início', () => {
  it('aparece como item informativo que leva a Contas fixas, depois de "vence em 7 dias"', () => {
    const itens = itensDeAtencao({ recorrentes: 2, proximos7: { n: 1, valor: 100 }, aReceber: [{ valor: 50, rotulo: 'x', tela: 'aulas' }] })
    expect(itens.map((i) => i.chave)).toEqual(['proximos7', 'recorrentes', 'receber-aulas'])
    const r = itens.find((i) => i.chave === 'recorrentes')
    expect(r).toMatchObject({ tom: 'info', titulo: '2 cobranças recorrentes para virar conta fixa', acao: { tela: 'fixos' } })
    expect(itensDeAtencao({ recorrentes: 1 })[0].titulo).toBe('1 cobrança recorrente para virar conta fixa')
    expect(itensDeAtencao({ recorrentes: 0 })).toEqual([])
  })
})

describe('glossário dos indicadores', () => {
  it('cada conceito tem um nome e uma definição; os nomes não se repetem', () => {
    const rotulos = Object.values(GLOSSARIO).map((g) => g.rotulo)
    expect(new Set(rotulos).size).toBe(rotulos.length)
    Object.values(GLOSSARIO).forEach((g) => { expect(g.rotulo).toBeTruthy(); expect(g.ajuda.length).toBeGreaterThan(30) })
  })
  it('projeção nunca é chamada de dinheiro disponível', () => {
    expect(GLOSSARIO.sobraPrevista.ajuda).toMatch(/Projeção/)
    expect(GLOSSARIO.sobraPrevista.ajuda).toMatch(/Não é dinheiro disponível/)
    expect(GLOSSARIO.livreParaGastar.ajuda).toMatch(/projeção/)
  })
})
