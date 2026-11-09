import { useEffect, useState } from 'react'
import { canonicoDinheiro, limparDinheiro, paraCampoDinheiro } from '../../lib/dinheiroCampo'

// Campo de valor: texto com teclado numérico, aceita vírgula ou ponto, sem setinhas de "number".
// Troca direta de <input type="number">: `value` e `onChange` usam o número em texto simples ("777.24", ou "" se vazio),
// então quem já fazia Number(value) continua funcionando. O que a pessoa vê é "777,24" (formata ao sair do campo).
// `prefixo`: "R$" (padrão) ou null (ex.: percentuais) · `casas`: casas decimais · `negativo`: aceita "−".
export default function CampoDinheiro({ value, onChange, placeholder = '0,00', id, autoFocus, disabled, prefixo = 'R$', casas = 2, negativo = false, className = '', style, onKeyDown, ...resto }) {
  const op = { casas, negativo }
  const valorTxt = typeof value === 'number' ? value.toFixed(casas) : value // número vindo do banco (59.9) → "59.90"
  const [texto, setTexto] = useState(() => paraCampoDinheiro(canonicoDinheiro(valorTxt, op)))
  // se o valor mudou por fora (abrir outro registro, limpar o formulário), mostra o novo; não mexe enquanto digita
  useEffect(() => {
    if (canonicoDinheiro(texto, op) !== canonicoDinheiro(valorTxt, op)) setTexto(paraCampoDinheiro(canonicoDinheiro(valorTxt, op)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valorTxt])
  return (
    <span className={`campo-dinheiro ${prefixo ? '' : 'sem-prefixo'} ${className}`} style={style}>
      {prefixo && <span className="campo-dinheiro-rs" aria-hidden="true">{prefixo}</span>}
      <input
        {...resto} id={id} type="text" inputMode={negativo ? 'text' : 'decimal'} autoComplete="off" autoFocus={autoFocus} disabled={disabled}
        placeholder={placeholder} value={texto} onKeyDown={onKeyDown}
        onChange={(e) => { const t = limparDinheiro(e.target.value, op); setTexto(t); onChange(canonicoDinheiro(t, op)) }}
        onBlur={() => { const c = canonicoDinheiro(texto, op); if (c !== '') setTexto(paraCampoDinheiro(c)) }}
      />
    </span>
  )
}
