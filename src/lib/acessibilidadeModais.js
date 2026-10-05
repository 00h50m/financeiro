// Dá a todas as janelas (.overlay/.modal) papel de diálogo para leitor de tela e deixa a tecla Esc fechá-las
// (clica no fundo, reaproveitando o fechamento que cada tela já tem).
export function ativarAcessibilidadeModais() {
  const marcar = () => {
    document.querySelectorAll('.modal:not([role])').forEach((m) => {
      m.setAttribute('role', 'dialog')
      m.setAttribute('aria-modal', 'true')
      const titulo = m.querySelector('.modal-title')
      if (titulo) m.setAttribute('aria-label', titulo.textContent)
    })
  }
  const obs = new MutationObserver(marcar)
  obs.observe(document.body, { childList: true, subtree: true })
  const teclado = (e) => {
    if (e.key !== 'Escape') return
    const fundos = document.querySelectorAll('.overlay')
    const topo = fundos[fundos.length - 1]
    if (topo) topo.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  }
  document.addEventListener('keydown', teclado)
  marcar()
  return () => { obs.disconnect(); document.removeEventListener('keydown', teclado) }
}
