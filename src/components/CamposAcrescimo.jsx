// Multa e juros como vêm no boleto: multa em % ou em R$; juros em % ao mês, R$ ao mês ou R$ por dia.
export default function CamposAcrescimo({ multa, juros, onMulta, onJuros, desabilitado = false }) {
  return (
    <div className="campos-acrescimo">
      <div className="form-group">
        <label>Multa (uma vez)</label>
        <div className="acrescimo-linha">
          <input inputMode="decimal" aria-label="Valor da multa" value={multa.texto} onChange={(e) => onMulta({ ...multa, texto: e.target.value })} disabled={desabilitado} />
          <select aria-label="Tipo da multa" value={multa.tipo} onChange={(e) => onMulta({ ...multa, tipo: e.target.value })} disabled={desabilitado}>
            <option value="pct">% do valor</option>
            <option value="valor">R$ fixo</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label>Juros</label>
        <div className="acrescimo-linha">
          <input inputMode="decimal" aria-label="Valor dos juros" value={juros.texto} onChange={(e) => onJuros({ ...juros, texto: e.target.value })} disabled={desabilitado} />
          <select aria-label="Tipo dos juros" value={juros.tipo} onChange={(e) => onJuros({ ...juros, tipo: e.target.value })} disabled={desabilitado}>
            <option value="pct_mes">% ao mês</option>
            <option value="valor_mes">R$ ao mês</option>
            <option value="valor_dia">R$ por dia</option>
          </select>
        </div>
      </div>
    </div>
  )
}
