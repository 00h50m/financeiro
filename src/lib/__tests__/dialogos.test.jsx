import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { Dialogo } from '../../components/ui/Dialogos'

describe('diálogos do app', () => {
  it('confirmar: título, texto e os dois botões; perigoso usa o botão de perigo', () => {
    const html = renderToString(<Dialogo titulo="Marcar 3 contas como pagas?" texto={'Total: R$ 900\nVocê pode desfazer.'} confirmar="Marcar como pagas" onResposta={() => {}} />)
    expect(html).toContain('Marcar 3 contas como pagas?')
    expect(html).toContain('Cancelar'); expect(html).toContain('Marcar como pagas'); expect(html).toContain('btn-primary')
    expect(html).toContain('class="overlay"'); expect(html).toContain('class="modal"')
    expect(renderToString(<Dialogo perigoso confirmar="Apagar" onResposta={() => {}} />)).toContain('btn-danger')
  })
  it('avisar: só um botão "Entendi", sem cancelar', () => {
    const html = renderToString(<Dialogo tipo="avisar" texto="Mês fechado." onResposta={() => {}} />)
    expect(html).toContain('Entendi'); expect(html).not.toContain('Cancelar')
  })
  it('pedir: campo com o valor inicial e rótulo acessível', () => {
    const html = renderToString(<Dialogo tipo="pedir" titulo="Valor real da Luz" valor="312,40" onResposta={() => {}} />)
    expect(html).toContain('value="312,40"'); expect(html).toContain('aria-label="Valor real da Luz"'); expect(html).toContain('Cancelar')
  })
})
