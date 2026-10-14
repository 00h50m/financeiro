import { lerHorario } from '../../lib/aulas'

// Horário em UMA lista: "Sem horário", de 06:00 a 22:00 de 30 em 30 minutos, e "Outro horário…" para qualquer outro.
// Sem teclado numérico nem relógio nativo. Valor: 'HH:MM' ou ''.
const OPCOES = Array.from({ length: 33 }, (_, i) => { const m = 6 * 60 + i * 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` })

export default function CampoHorario({ valor, onChange, rotulo = 'Horário (opcional)' }) {
  const lista = valor && !OPCOES.includes(valor) ? [...OPCOES, valor].sort() : OPCOES // preserva horário fora da grade
  function aoEscolher(e) {
    const v = e.target.value
    if (v !== 'outro') { onChange(v); return }
    const t = window.prompt('Horário (ex.: 15:20, 1520 ou 9h45):', valor || '')
    if (t == null) return
    const h = lerHorario(t)
    if (!h) { window.alert('Não entendi esse horário. Use, por exemplo, 15:20.'); return }
    onChange(h)
  }
  return (
    <select aria-label={rotulo} value={valor || ''} onChange={aoEscolher}>
      <option value="">Sem horário</option>
      {lista.map((h) => <option key={h} value={h}>{h}</option>)}
      <option value="outro">Outro horário…</option>
    </select>
  )
}
