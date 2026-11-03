// Diálogos do app chamados de qualquer lugar (substitui confirm/alert/prompt nativos):
//   if (await confirmar('Apagar?')) …       if (await confirmar({ titulo, texto, confirmar: 'Apagar', perigoso: true })) …
//   await avisar('Mês fechado.')            const v = await pedir('Valor (R$):', '312,40')   // texto ou null se cancelou
// Quem desenha é <DialogoGlobal /> (montado uma vez no App). Sem ele (testes/SSR) cai nos diálogos nativos.
let host = null
export function registrarHost(fn) { host = fn; return () => { if (host === fn) host = null } }

const nativo = (tipo, texto, valor) => {
  if (typeof window === 'undefined') return tipo === 'confirmar' ? false : tipo === 'pedir' ? null : true
  if (tipo === 'confirmar') return window.confirm(texto)
  if (tipo === 'pedir') return window.prompt(texto, valor)
  window.alert(texto); return true
}
const abrir = (tipo, dados, texto, valor) => new Promise((resolve) => { if (host) host({ tipo, ...dados, resolve }); else resolve(nativo(tipo, texto, valor)) })
const comoOpcoes = (x) => (typeof x === 'string' ? { texto: x } : x || {})

export const confirmar = (x) => { const o = comoOpcoes(x); return abrir('confirmar', o, o.texto) }
export const avisar = (x) => { const o = comoOpcoes(x); return abrir('avisar', o, o.texto) }
// pedir('pergunta', 'valor inicial') ou pedir({ titulo, texto, valor, teclado })
export const pedir = (x, valor = '') => { const o = typeof x === 'string' ? { texto: x, valor } : { valor, ...(x || {}) }; return abrir('pedir', o, o.texto, o.valor) }
