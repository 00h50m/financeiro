// Acessibilidade das janelas (.overlay/.modal), valendo para TODAS as telas:
//  - papel de diálogo e rótulo para leitor de tela;
//  - a tecla Esc fecha a janela do topo (clica no fundo, reaproveitando o fechamento que cada tela já tem);
//  - o foco entra na janela ao abrir, fica preso nela (Tab/Shift+Tab) e volta para o botão que a abriu ao fechar.
const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const visivel = (el) => el.offsetParent !== null || el === document.activeElement
const focaveisDe = (modal) => [...modal.querySelectorAll(FOCAVEIS)].filter(visivel)

export function ativarAcessibilidadeModais() {
  const pilha = [] // [{ modal, abriu }]: janelas abertas, a do topo é a última
  let ultimoFora = null // último elemento focado FORA de janelas: é quem abre a próxima (o foco já pode ter entrado na janela quando ela aparece)
  const aoFocar = (e) => { if (!e.target.closest?.('.modal, .overlay')) ultimoFora = e.target }
  document.addEventListener('focusin', aoFocar)

  const marcar = () => {
    document.querySelectorAll('.modal:not([role])').forEach((m) => {
      m.setAttribute('role', 'dialog')
      m.setAttribute('aria-modal', 'true')
      const titulo = m.querySelector('.modal-title')
      if (titulo) m.setAttribute('aria-label', titulo.textContent)
    })
  }
  const sincronizar = () => {
    marcar()
    // janelas que fecharam: devolve o foco a quem abriu
    for (let i = pilha.length - 1; i >= 0; i--) {
      if (!document.contains(pilha[i].modal)) {
        const { abriu } = pilha.splice(i, 1)[0]
        if (i === pilha.length && abriu && document.contains(abriu) && typeof abriu.focus === 'function') abriu.focus()
      }
    }
    // janelas novas: guarda quem abriu e leva o foco para dentro
    document.querySelectorAll('.modal').forEach((modal) => {
      if (pilha.some((p) => p.modal === modal)) return
      const abriu = ultimoFora && document.contains(ultimoFora) ? ultimoFora : null
      pilha.push({ modal, abriu })
      if (!modal.contains(document.activeElement)) (focaveisDe(modal)[0] || modal).focus?.()
    })
  }
  const obs = new MutationObserver(sincronizar)
  obs.observe(document.body, { childList: true, subtree: true })

  const teclado = (e) => {
    if (e.key === 'Escape') {
      const fundos = document.querySelectorAll('.overlay')
      const topo = fundos[fundos.length - 1]
      if (topo) topo.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      return
    }
    if (e.key !== 'Tab' || !pilha.length) return
    const { modal } = pilha[pilha.length - 1]
    const itens = focaveisDe(modal)
    if (!itens.length) { e.preventDefault(); return }
    const primeiro = itens[0]
    const ultimo = itens[itens.length - 1]
    const ativo = document.activeElement
    if (!modal.contains(ativo)) { e.preventDefault(); primeiro.focus() }
    else if (e.shiftKey && ativo === primeiro) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && ativo === ultimo) { e.preventDefault(); primeiro.focus() }
  }
  document.addEventListener('keydown', teclado)
  sincronizar()
  return () => { obs.disconnect(); document.removeEventListener('keydown', teclado); document.removeEventListener('focusin', aoFocar) }
}
