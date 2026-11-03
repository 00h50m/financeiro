// Ações do dia a dia, a um toque do Início.
export default function AcoesRapidas({ cls = '', aoNovaCompra, semCartao, irPara, compacta = false }) {
  return (
    <div className={`ini-acoes ${cls}`} role="group" aria-label="Ações rápidas">
      <button type="button" className="ini-btn ini-btn-gasto" onClick={aoNovaCompra} disabled={semCartao}>+ Gasto</button>
      <button type="button" className="ini-btn ini-btn-entrada" onClick={() => irPara('renda')}>+ Entrada</button>
      <button type="button" className="ini-btn ini-btn-sec" onClick={() => irPara('pagamentos')}>Registrar pagamento</button>
      <button type="button" className="ini-btn ini-btn-sec" onClick={() => irPara('importar')}>Importar fatura</button>
      {!compacta && <button type="button" className="ini-btn ini-btn-sec" onClick={() => irPara('inbox')}>Conferir pendências</button>}
    </div>
  )
}
