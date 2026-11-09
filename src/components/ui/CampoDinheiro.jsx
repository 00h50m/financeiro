// Campo de valor em reais: texto com teclado numérico, aceita vírgula ou ponto, sem setinhas de "number".
import { limparDinheiro, paraCampoDinheiro } from '../../lib/dinheiroCampo'

// `value` e `onChange` trabalham com o TEXTO digitado (ex.: "777,24"); quem usa converte com lerValorReal/lerNum.
export default function CampoDinheiro({ value, onChange, placeholder = '0,00', id, autoFocus, disabled, 'aria-label': ariaLabel, className = '' }) {
  return (
    <span className={`campo-dinheiro ${className}`}>
      <span className="campo-dinheiro-rs" aria-hidden="true">R$</span>
      <input
        id={id} type="text" inputMode="decimal" autoComplete="off" autoFocus={autoFocus} disabled={disabled} aria-label={ariaLabel}
        placeholder={placeholder} value={value ?? ''}
        onChange={(e) => onChange(limparDinheiro(e.target.value))}
        onBlur={(e) => { const t = limparDinheiro(e.target.value); if (/^\d+(,\d{1,2})?$/.test(t)) onChange(paraCampoDinheiro(t.replace(',', '.'))) }}
      />
    </span>
  )
}
