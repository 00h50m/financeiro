import { useState } from 'react'
import { fmt, mesLabel } from '../lib/utils'

// Campo para informar o valor REAL de uma conta variável em um mês. Salva ao sair do campo (ou Enter); só aquele mês muda.
// `fixo` = conta já resolvida para o mês (fixosAtivos): traz valor, estimado.  `real` = valor real já informado (ou undefined).
export default function ValorDoMes({ fixo, mes, real, definirValorFixo, compacto = false, fechado = false }) {
  const [destravado, setDestravado] = useState(false)
  const inicial = real != null ? String(real).replace('.', ',') : ''
  const [texto, setTexto] = useState(inicial)
  const [estado, setEstado] = useState('') // '' | 'salvando' | 'salvo' | 'erro'
  const [ref, setRef] = useState(inicial)
  if (ref !== inicial) { setRef(inicial); setTexto(inicial) } // mudou por fora (outra tela/recarga): acompanha

  async function gravar(valor) {
    setEstado('salvando')
    const ok = await definirValorFixo(fixo.id, mes, valor)
    setEstado(ok ? 'salvo' : 'erro')
    if (ok) setTimeout(() => setEstado(''), 1500)
    else setTexto(inicial)
  }
  function confirmar() {
    const t = texto.trim()
    if (t === inicial) return
    if (t === '') { if (real != null) gravar(null); return }
    const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
    if (!Number.isFinite(n) || n < 0) { window.alert('Valor inválido.\n\nDigite só números, com vírgula nos centavos (ex.: 312,40).'); setTexto(inicial); return }
    gravar(n)
  }
  // Mês fechado: o valor fica travado; alterar exige destravar de propósito (e depois escrever o motivo ao salvar).
  if (fechado && !destravado) {
    return (
      <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
        <span className="mono" style={{ fontSize: 13 }}>{fmt(fixo.valor)}</span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          🔒 mês fechado{real == null ? ' · estimado' : ''} · <button className="link-btn" onClick={() => { if (window.confirm(`${mesLabel(mes)} já está fechado.\n\nAlterar muda os números dele e vai pedir um motivo, que fica registrado. Destravar mesmo assim?`)) setDestravado(true) }}>alterar</button>
        </span>
      </div>
    )
  }
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
      <input
        value={texto} inputMode="decimal" onChange={(e) => setTexto(e.target.value)} onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setTexto(inicial); e.currentTarget.blur() } }}
        placeholder={`estimado ${fmt(fixo.valor).replace('R$ ', '')}`} aria-label={`Valor real de ${fixo.nome} em ${mesLabel(mes)}`}
        style={{ width: compacto ? 118 : 140, textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}
      />
      <span style={{ fontSize: 11, color: estado === 'erro' ? 'var(--red)' : 'var(--text3)' }}>
        {estado === 'salvando' ? 'salvando…' : estado === 'salvo' ? 'salvo ✓' : estado === 'erro' ? 'não salvou' : real != null ? 'valor real' : 'digite o valor real'}
        {estado === '' && real != null && <> · <button className="link-btn" onClick={() => { setTexto(''); gravar(null) }}>usar estimativa</button></>}
      </span>
    </div>
  )
}
