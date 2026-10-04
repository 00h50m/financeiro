import { describe, it, expect } from 'vitest'
import { limparDescricao, normHistorico, normNome, extrairParcela, construirHistoricoCategorias } from '../normalizacao'
import { chaveEstabelecimento, indexarAliases, similaridadeEstabelecimento } from '../estabelecimento'

describe('normalização herdada do import de fatura (comportamento preservado)', () => {
  it('tira o trecho da parcela do nome e o devolve nos campos próprios', () => {
    expect(limparDescricao('Netflix - Parcela 2/6')).toBe('Netflix')
    expect(extrairParcela('Mercado Livre Parc. 3 de 10')).toEqual({ atual: '3', total: '10' })
  })
  it('junta nomes que só diferem em asterisco, número e data', () => {
    expect(normHistorico('*NETFLIX 03/09')).toBe(normHistorico('NETFLIX 12/08'))
    expect(normNome('Açaí da Vó – parcela 1/3:')).toBe('acai da vo')
  })
  it('histórico por descrição usa a categoria mais frequente', () => {
    const h = construirHistoricoCategorias([
      { descricao: 'DROGASIL 1', categoria: 'Saúde', subcategoria: 'Farmácia' },
      { descricao: 'DROGASIL 2', categoria: 'Saúde', subcategoria: 'Farmácia' },
      { descricao: 'DROGASIL 3', categoria: 'Diversos', subcategoria: 'Outros' },
    ])
    expect(h.drogasil).toEqual({ categoria: 'Saúde', subcategoria: 'Farmácia' })
  })
})

describe('chave do estabelecimento', () => {
  it.each(['IFOOD *IFOOD', 'IFOOD.COM', 'PG *IFOOD', 'iFood', 'IFOOD 1234'])('"%s" -> ifood', (t) => {
    expect(chaveEstabelecimento(t).chave).toBe('ifood')
  })
  it('mantém o que identifica o estabelecimento', () => {
    expect(chaveEstabelecimento('Uber *TRIP 123').chave).toBe('uber trip')
    expect(chaveEstabelecimento('www.amazon.com.br').chave).toBe('amazon')
  })
  it('um alias aponta para a chave canônica e dá o nome de exibição', () => {
    const indice = indexarAliases([{ alias: 'uber trip', chave: 'uber', nome_exibicao: 'Uber' }])
    expect(chaveEstabelecimento('UBER *TRIP', indice)).toEqual({ chave: 'uber', nome: 'Uber' })
  })
  it('similaridade: igual, mesma coisa sem espaço, contido, diferente', () => {
    expect(similaridadeEstabelecimento('ifood', 'ifood')).toBe(1)
    expect(similaridadeEstabelecimento('mercado livre', 'mercadolivre')).toBe(0.95)
    expect(similaridadeEstabelecimento('uber', 'uber trip')).toBe(0.8)
    expect(similaridadeEstabelecimento('ifood', 'drogasil')).toBe(0)
  })
})
