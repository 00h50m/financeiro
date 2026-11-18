import { useState } from 'react'
import { fmt, mesLabel } from '../../lib/utils'
import { Pilulas } from '../NavMes'
import CampoDinheiro from '../ui/CampoDinheiro'
import { calcularAjusteLivre } from '../../lib/inicio'

// Ajuste manual do "Livre para gastar": quando algo se perde nos lançamentos e o número fica irreal, a pessoa diz quanto ELE deveria ser
// (ou quanto tem de verdade na conta) e o app guarda a diferença como acerto do mês (a mesma tabela do "Acerte aqui" de Pagamentos).
// Não mexe em nenhum lançamento: só soma ou tira um valor no resultado do mês (aparece sempre como "ajuste manual").
export default function AjusteLivre({ d, mes, aoSalvar, aoFechar }) {
  const ajusteAtual = Number(d.ajuste) || 0
  const [modo, setModo] = useState('livre') // 'livre' | 'saldo'
  const [valor, setValor] = useState('')
  const [salvando, setSalvando] = useState(false)
  const v = Number(valor) || 0 // o campo entrega o número em texto simples (pode ser negativo)
  const preenchido = valor !== '' && Number.isFinite(Number(valor))
  // diferença que falta para o número ficar como a pessoa quer; soma ao ajuste que já existe
  const alvoAtual = modo === 'livre' ? d.podeGastar : d.disponivel
  const { delta, novoAjuste, livreDepois } = calcularAjusteLivre({ modo, valor: v, podeGastar: d.podeGastar, disponivel: d.disponivel, ajusteAtual })
  const mudou = preenchido && Math.abs(delta) >= 0.005

  async function salvar(ajuste) {
    setSalvando(true)
    const ok = await aoSalvar(ajuste)
    setSalvando(false)
    if (ok !== false) aoFechar()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') aoFechar() }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Ajustar o livre para gastar">
        <div className="modal-title">Ajustar o livre para gastar · {mesLabel(mes)}</div>
        <p className="cad-sub" style={{ marginTop: 0 }}>Use quando algum lançamento se perdeu e o valor ficou irreal. O app guarda só a diferença como um <b>ajuste manual</b> deste mês: nenhum lançamento é alterado e dá para desfazer.</p>
        <Pilulas rotulo="O que você sabe" valor={modo} onChange={(m) => { setModo(m); setValor('') }} opcoes={[['livre', 'Quanto deveria ser o livre'], ['saldo', 'Quanto tenho na conta']]} />
        <div className="form-group" style={{ marginTop: 8 }}>
          <label htmlFor="aj-valor">{modo === 'livre' ? 'O livre para gastar deveria ser (R$)' : 'Tenho na conta agora (R$)'}</label>
          <CampoDinheiro id="aj-valor" value={valor} onChange={setValor} negativo autoFocus placeholder={String(Math.round(alvoAtual * 100) / 100).replace('.', ',')} />
        </div>
        <div className="aj-resumo" aria-live="polite">
          <div><span>{modo === 'livre' ? 'Livre para gastar hoje' : 'Disponível hoje no app'}</span><b className="mono">{fmt(alvoAtual)}</b></div>
          {mudou && <div><span>Ajuste que será somado</span><b className="mono">{delta > 0 ? '+' : '−'} {fmt(Math.abs(delta))}</b></div>}
          {mudou && <div><span>Livre para gastar depois</span><b className="mono">{fmt(livreDepois)}</b></div>}
          <div><span>Ajuste manual total do mês</span><b className="mono">{mudou ? fmt(novoAjuste) : fmt(ajusteAtual)}</b></div>
        </div>
        <div className="modal-footer">
          {Math.abs(ajusteAtual) >= 0.005 && <button type="button" className="btn btn-ghost" disabled={salvando} onClick={() => salvar(0)} style={{ marginRight: 'auto' }}>Remover o ajuste ({fmt(ajusteAtual)})</button>}
          <button type="button" className="btn btn-ghost" onClick={aoFechar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={!mudou || salvando} onClick={() => salvar(novoAjuste)}>{salvando ? 'Salvando…' : 'Aplicar ajuste'}</button>
        </div>
      </div>
    </div>
  )
}
