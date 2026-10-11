import { useContext, useEffect } from 'react'
import { mesLabel, nowYM, addMonths } from '../lib/utils'
import { InicioContext } from '../lib/InicioContext'

// Navegação de mês padrão das telas: ‹ Out/26 › e, fora do mês atual, o atalho "Hoje".
export default function NavMes({ mes, onChange, fechado = false }) {
  const inicio = useContext(InicioContext)
  const noInicio = !!inicio && mes <= inicio
  // Se a tela abriu num mês anterior ao início do uso (ex.: Fechamento abre no mês passado), vai para o primeiro mês válido.
  useEffect(() => { if (inicio && mes < inicio) onChange(inicio) }, [mes, inicio]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nav-mes">
      <button className="icon-btn" onClick={() => onChange(addMonths(mes, -1))} disabled={noInicio} title={noInicio ? `O app começou em ${mesLabel(inicio)}` : undefined} aria-label="Mês anterior">‹</button>
      <div className="nav-mes-nome">{mesLabel(mes)}{fechado && <span className="badge badge-gray" style={{ marginLeft: 8 }}>fechado</span>}</div>
      <button className="icon-btn" onClick={() => onChange(addMonths(mes, 1))} aria-label="Próximo mês">›</button>
      {mes !== nowYM() && <button className="btn btn-ghost btn-sm" onClick={() => onChange(nowYM())}>Hoje</button>}
    </div>
  )
}

// Seletor de opções em "pílulas" (substitui selects de poucas opções).
export function Pilulas({ opcoes, valor, onChange, rotulo }) {
  return (
    <div className="pilulas" role="group" aria-label={rotulo}>
      {opcoes.map(([v, r]) => (
        <button key={v} className={valor === v ? 'ativo' : ''} onClick={() => onChange(v)} aria-pressed={valor === v}>{r}</button>
      ))}
    </div>
  )
}

export const PilulasPago = ({ valor, onChange }) => (
  <Pilulas rotulo="Filtrar por situação do pagamento" valor={valor} onChange={onChange} opcoes={[['', 'Todas'], ['apagar', 'A pagar'], ['pagas', 'Pagas']]} />
)
