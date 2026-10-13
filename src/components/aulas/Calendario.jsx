import { DIAS_CURTOS, diaDaSemana, somarDias, ultimoDiaDoMes } from '../../lib/aulas'

const COR = { prevista: 'azul', realizada: 'verde', cancelada: 'cinza', nao_realizada: 'ambar' }

// Grade do mês (domingo a sábado). Cada dia mostra suas aulas; tocar no dia seleciona; o detalhe aparece embaixo.
export default function Calendario({ mes, aulas, alunoPorId, hoje, dia, onDia, mostrarAluno }) {
  const primeiro = `${mes}-01`
  const vazios = diaDaSemana(primeiro)
  const n = ultimoDiaDoMes(mes)
  const celulas = [...Array(vazios).fill(null), ...Array.from({ length: n }, (_, i) => somarDias(primeiro, i))]
  const porDia = new Map()
  for (const a of aulas) porDia.set(a.data, [...(porDia.get(a.data) || []), a])
  return (
    <div className="cal-aulas" role="grid" aria-label="Calendário de aulas">
      {DIAS_CURTOS.map((d) => <div key={d} className="cal-cab">{d}</div>)}
      {celulas.map((d, i) => {
        if (!d) return <div key={`v${i}`} className="cal-vazio" />
        const lista = porDia.get(d) || []
        return (
          <button key={d} type="button" className={`cal-dia ${d === hoje ? 'hoje' : ''} ${d === dia ? 'sel' : ''}`} onClick={() => onDia(d === dia ? null : d)} aria-label={`${d.slice(8)}: ${lista.length} aula(s)`}>
            <span className="cal-num">{Number(d.slice(8))}</span>
            <span className="cal-aulas-dia">
              {lista.slice(0, 3).map((a) => (
                <span key={a.id} className={`cal-chip ${COR[a.status]}`}>
                  <i className="cal-ponto" />
                  <span className="cal-chip-txt">{a.horario ? `${a.horario} ` : ''}{mostrarAluno ? alunoPorId.get(a.aluno_id)?.nome?.split(' ')[0] : ''}</span>
                </span>
              ))}
              {lista.length > 3 && <span className="cal-mais">+{lista.length - 3}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
