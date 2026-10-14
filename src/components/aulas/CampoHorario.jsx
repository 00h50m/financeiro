// Horário em dois seletores (hora e minuto): sem teclado, sem seletor nativo de relógio (que corta botões em telas com fonte grande).
// Valor: 'HH:MM' ou '' (sem horário).
const HORAS = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'))
const MINUTOS_BASE = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

export default function CampoHorario({ valor, onChange, rotulo = 'Horário (opcional)' }) {
  const [h, m] = /^\d{2}:\d{2}$/.test(valor || '') ? valor.split(':') : ['', '']
  const minutos = m && !MINUTOS_BASE.includes(m) ? [...MINUTOS_BASE, m].sort() : MINUTOS_BASE // preserva minuto antigo fora do passo de 5
  const mudarHora = (nh) => onChange(nh === '' ? '' : `${nh}:${m || '00'}`)
  const mudarMinuto = (nm) => onChange(h === '' ? '' : `${h}:${nm}`)
  return (
    <div className="campo-horario" role="group" aria-label={rotulo}>
      <select aria-label="Hora" value={h} onChange={(e) => mudarHora(e.target.value)}>
        <option value="">Hora</option>
        {HORAS.map((x) => <option key={x} value={x}>{x}h</option>)}
      </select>
      <select aria-label="Minuto" value={h === '' ? '' : m} onChange={(e) => mudarMinuto(e.target.value)} disabled={h === ''}>
        {h === '' && <option value="">:min</option>}
        {minutos.map((x) => <option key={x} value={x}>:{x}</option>)}
      </select>
    </div>
  )
}
