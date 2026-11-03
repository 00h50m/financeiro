import { useCallback, useEffect, useRef, useState } from 'react'

// Diálogos do app no lugar de confirm()/alert()/prompt() nativos (que no PWA são feios e bloqueiam a tela).
//   const { confirmar, avisar, pedir, dialogo } = useDialogos()
//   if (await confirmar({ titulo, texto, confirmar: 'Marcar como pagas' })) { ... }
//   await avisar('Mês fechado.')
//   const valor = await pedir({ titulo, texto, valor: '312,40' })   // texto digitado, ou null se cancelou
//   ...e renderize {dialogo} no JSX da tela.
// Usam .overlay/.modal: o botão voltar do celular, a tecla Esc e o role="dialog" já funcionam (useVoltar/acessibilidadeModais).
export function Dialogo({ tipo = 'confirmar', titulo, texto, confirmar = 'Confirmar', cancelar = 'Cancelar', perigoso = false, valor = '', onResposta }) {
  const [digitado, setDigitado] = useState(valor)
  const primario = useRef(null)
  useEffect(() => { primario.current?.focus() }, [])
  const cancelou = () => onResposta(tipo === 'pedir' ? null : false)
  const confirmou = () => onResposta(tipo === 'pedir' ? digitado : true)
  return (
    <div className="overlay" onClick={cancelou}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{titulo || (tipo === 'avisar' ? 'Aviso' : 'Confirmar')}</div>
        {texto && <p className="dialogo-texto">{texto}</p>}
        {tipo === 'pedir' && (
          <input className="dialogo-campo" inputMode="decimal" value={digitado} onChange={(e) => setDigitado(e.target.value)} aria-label={titulo || 'Valor'}
            onKeyDown={(e) => { if (e.key === 'Enter') confirmou() }} ref={primario} />
        )}
        <div className="modal-footer">
          {tipo !== 'avisar' && <button type="button" className="btn btn-ghost" onClick={cancelou}>{cancelar}</button>}
          <button type="button" ref={tipo === 'pedir' ? null : primario} className={`btn ${perigoso ? 'btn-danger' : 'btn-primary'}`} onClick={confirmou}>{tipo === 'avisar' ? 'Entendi' : confirmar}</button>
        </div>
      </div>
    </div>
  )
}

export function useDialogos() {
  const [pedido, setPedido] = useState(null)
  const resolver = useRef(null)
  const abrir = useCallback((dados, padrao) => new Promise((res) => {
    resolver.current?.(padrao) // um diálogo novo cancela o anterior
    resolver.current = res
    setPedido(dados)
  }), [])
  const responder = (v) => { const r = resolver.current; resolver.current = null; setPedido(null); r?.(v) }
  const confirmar = useCallback((o = {}) => abrir({ tipo: 'confirmar', ...o }, false), [abrir])
  const avisar = useCallback((texto, titulo) => abrir({ tipo: 'avisar', texto, titulo }, true), [abrir])
  const pedir = useCallback((o = {}) => abrir({ tipo: 'pedir', ...o }, null), [abrir])
  return { confirmar, avisar, pedir, dialogo: pedido ? <Dialogo key={JSON.stringify(pedido)} {...pedido} onResposta={responder} /> : null }
}
