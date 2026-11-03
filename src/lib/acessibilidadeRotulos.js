// Garante nome acessível para campos de formulário em TODAS as telas:
//  - <label>Texto</label> seguido do campo, sem ligação: liga os dois (for/id);
//  - campo só com placeholder: usa o placeholder como rótulo para leitor de tela.
// Roda quando a tela muda (agrupado em um quadro de animação) e nunca altera o que está visível.
let contador = 0
const CAMPOS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea'
const ehCampo = (el) => el?.matches?.(CAMPOS)

function ligarRotulos(raiz = document) {
  raiz.querySelectorAll('label:not([for])').forEach((label) => {
    if (label.querySelector(CAMPOS)) return // o campo está dentro do rótulo: já está ligado
    const alvo = ehCampo(label.nextElementSibling) ? label.nextElementSibling : label.nextElementSibling?.querySelectorAll?.(CAMPOS)?.length === 1 ? label.nextElementSibling.querySelector(CAMPOS) : null
    if (!alvo) return
    if (!alvo.id) alvo.id = `rot-${++contador}`
    label.setAttribute('for', alvo.id)
  })
  raiz.querySelectorAll(CAMPOS).forEach((c) => {
    if (c.labels?.length || c.getAttribute('aria-label') || c.getAttribute('aria-labelledby') || c.closest('label') || c.title) return
    const dica = c.getAttribute('placeholder')
    if (dica) c.setAttribute('aria-label', dica)
  })
}

export function ativarRotulosAcessiveis() {
  let agendado = false
  const rodar = () => { agendado = false; ligarRotulos() }
  const pedir = () => { if (!agendado) { agendado = true; requestAnimationFrame(rodar) } }
  const obs = new MutationObserver(pedir)
  obs.observe(document.body, { childList: true, subtree: true })
  pedir()
  return () => obs.disconnect()
}
