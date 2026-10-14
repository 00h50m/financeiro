import { useEffect, useRef } from 'react'

// Botão voltar do celular (e do navegador): em vez de fechar o app, volta para a tela anterior ou fecha a janela aberta.
// Cada troca de aba empilha uma entrada no histórico; janelas (.overlay) e o menu lateral empilham uma entrada enquanto estão abertos.
export function useVoltar({ aba, setAba, menuAberto, fecharMenu }) {
  const camada = useRef(false) // há uma entrada de histórico representando uma janela/menu aberto
  const ignorar = useRef(0) // popstates provocados por nós mesmos
  const estado = useRef({})
  estado.current = { aba, setAba, menuAberto, fecharMenu }

  useEffect(() => {
    // Ao abrir direto numa aba que não é o Início, voltar leva ao Início (e só depois sai do app).
    if (aba !== 'inicio') { history.replaceState({ aba: 'inicio' }, ''); history.pushState({ aba }, '') } else history.replaceState({ aba }, '')

    const temCamada = () => estado.current.menuAberto || document.querySelector('.overlay') != null
    function verificar() {
      const aberta = temCamada()
      if (aberta && !camada.current) { history.pushState({ camada: true }, ''); camada.current = true }
      else if (!aberta && camada.current) {
        camada.current = false
        if (history.state?.camada) { ignorar.current += 1; history.back() } // fechou pelo botão da tela: tira a entrada que sobrou
      }
    }
    function aoVoltar(e) {
      if (ignorar.current > 0) { ignorar.current -= 1; return }
      if (camada.current || temCamada()) {
        camada.current = false
        const overlays = document.querySelectorAll('.overlay')
        if (estado.current.menuAberto) estado.current.fecharMenu()
        else if (overlays.length) overlays[overlays.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true }))
        setTimeout(verificar, 60) // sobrou outra janela: reempilha
        return
      }
      if (e.state?.camada) { history.back(); return } // entrada de janela que ficou para trás: pula
      if (e.state?.aba) estado.current.setAba(e.state.aba)
    }
    const obs = new MutationObserver(verificar)
    obs.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('popstate', aoVoltar)
    return () => { obs.disconnect(); window.removeEventListener('popstate', aoVoltar) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { // o menu lateral é estado do React, não elemento .overlay
    if (menuAberto && !camada.current) { history.pushState({ camada: true }, ''); camada.current = true }
    else if (!menuAberto && camada.current && !document.querySelector('.overlay')) {
      camada.current = false
      if (history.state?.camada) { ignorar.current += 1; history.back() }
    }
  }, [menuAberto])
}
