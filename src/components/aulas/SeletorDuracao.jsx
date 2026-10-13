import { DURACOES, lerDuracao, textoDuracao } from '../../lib/aulas'

// Duração em minutos: opções práticas (30, 45, 60, 90, 120) e "Outra…" para digitar (90, 1h30, 1,5).
export default function SeletorDuracao({ valor, onChange, rotulo = 'Duração', className = '' }) {
  const lista = DURACOES.includes(Number(valor)) ? DURACOES : [...DURACOES, Number(valor)].filter(Boolean).sort((a, b) => a - b)
  return (
    <select
      className={className}
      aria-label={rotulo}
      value={Number(valor)}
      onChange={(e) => {
        if (e.target.value === 'outra') {
          const t = window.prompt('Duração (ex.: 75, 1h15 ou 1,25):', textoDuracao(valor))
          const min = lerDuracao(t)
          if (t != null && !min) window.alert('Não entendi essa duração. Use minutos (75), horas e minutos (1h15) ou horas (1,25).')
          if (min) onChange(min)
          return
        }
        onChange(Number(e.target.value))
      }}
    >
      {lista.map((m) => <option key={m} value={m}>{textoDuracao(m)}</option>)}
      <option value="outra">Outra…</option>
    </select>
  )
}
