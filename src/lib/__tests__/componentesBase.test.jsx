import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import Selo from '../../components/ui/Selo'
import Indicador from '../../components/ui/Indicador'
import EstadoVazio from '../../components/ui/EstadoVazio'
import Esqueleto from '../../components/ui/Esqueleto'

describe('componentes base do design system', () => {
  it('Selo: sempre traz texto e símbolo (não depende só da cor); o símbolo é escondido do leitor de tela', () => {
    const html = renderToString(<Selo tom="ok">Paga</Selo>)
    expect(html).toContain('selo-ok')
    expect(html).toContain('Paga')
    expect(html).toContain('✓')
    expect(html).toContain('aria-hidden="true"')
    expect(renderToString(<Selo tom="erro">Atrasada</Selo>)).toContain('✕')
    expect(renderToString(<Selo tom="aviso">Estimada</Selo>)).toContain('!')
  })
  it('Selo: tom desconhecido cai em neutro e a marca não tem símbolo', () => {
    expect(renderToString(<Selo tom="xyz">x</Selo>)).toContain('selo-neutro')
    expect(renderToString(<Selo tom="marca">Novo</Selo>)).not.toContain('selo-icone')
  })
  it('Indicador: rótulo, valor, subtítulo e a definição do número (ajuda) para mouse e leitor de tela', () => {
    const html = renderToString(<Indicador rotulo="A pagar" valor="R$ 1.200" sub="3 contas" tom="aviso" ajuda="Comprometido menos o que já foi pago" />)
    expect(html).toContain('A pagar')
    expect(html).toContain('R$ 1.200')
    expect(html).toContain('3 contas')
    expect(html).toContain('indicador-valor aviso')
    expect(html).toContain('title="Comprometido menos o que já foi pago"')
    expect(html).toContain('so-leitor')
    expect(html).toContain('role="group"')
  })
  it('Indicador sem ajuda não cria texto escondido', () => {
    expect(renderToString(<Indicador rotulo="Pago" valor="R$ 0" />)).not.toContain('so-leitor')
  })
  it('EstadoVazio: título, texto e ação só quando há o que fazer', () => {
    const com = renderToString(<EstadoVazio titulo="Nada a pagar" texto="Tudo em dia." acao="Nova conta" aoClicar={() => {}} />)
    expect(com).toContain('Nada a pagar'); expect(com).toContain('Tudo em dia.'); expect(com).toContain('Nova conta'); expect(com).toContain('role="status"')
    expect(renderToString(<EstadoVazio titulo="Vazio" />)).not.toContain('<button')
  })
  it('Esqueleto: quantidade de linhas e rótulo de carregamento', () => {
    const html = renderToString(<Esqueleto linhas={4} />)
    expect((html.match(/esqueleto-linha/g) || []).length).toBe(4)
    expect(html).toContain('aria-label="Carregando"')
  })
})
