import { useEffect, useRef, useState } from 'react'
import { Dialogo } from './Dialogos'
import { registrarHost } from '../../lib/dialogos'

// Montado uma vez no App: desenha os diálogos pedidos por lib/dialogos.js (confirmar, avisar, pedir).
export default function DialogoGlobal() {
  const [pedido, setPedido] = useState(null)
  const atual = useRef(null)
  useEffect(() => registrarHost((p) => {
    atual.current?.resolve(atual.current.tipo === 'pedir' ? null : atual.current.tipo === 'confirmar' ? false : true) // um diálogo novo cancela o anterior
    atual.current = p
    setPedido(p)
  }), [])
  if (!pedido) return null
  const responder = (v) => { const p = atual.current; atual.current = null; setPedido(null); p?.resolve(v) }
  const { resolve: _r, ...props } = pedido // eslint-disable-line no-unused-vars
  return <Dialogo key={JSON.stringify(props)} {...props} onResposta={responder} />
}
