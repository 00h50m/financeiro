import { useEffect, useState } from 'react'
import { lerHorario } from '../../lib/aulas'

// Horário digitado (15:30, 1530, 9h30): evita o seletor nativo do Android, que corta os botões em telas com fonte grande.
export default function CampoHorario({ valor, onChange, rotulo = 'Horário (opcional)' }) {
  const [texto, setTexto] = useState(valor || '')
  const [invalido, setInvalido] = useState(false)
  useEffect(() => { setTexto(valor || '') }, [valor])
  function fechar() {
    if (!texto.trim()) { setInvalido(false); onChange(''); return }
    const h = lerHorario(texto)
    setInvalido(!h)
    if (h) { setTexto(h); onChange(h) }
  }
  return (
    <input
      inputMode="numeric" autoComplete="off" placeholder="Hora (15:30)" aria-label={rotulo} aria-invalid={invalido || undefined}
      value={texto} onChange={(e) => setTexto(e.target.value)} onBlur={fechar} style={invalido ? { borderColor: 'var(--red)' } : undefined}
    />
  )
}
