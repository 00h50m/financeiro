import { useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'
import { FORMAS } from '../../lib/atendimentos'

// Pacote de sessões: a cliente compra N sessões por um valor. A receita é a venda do pacote; cada sessão marcada depois vale 0 na renda.
export default function ModalPacote({ pacote, clienteInicial = '', clientes, servicos, onSalvar, onRemover, onClose }) {
  const [f, setF] = useState(() => ({
    cliente_id: pacote?.cliente_id || clienteInicial, nome: pacote?.nome || '', servico_id: pacote?.servico_id || '', sessoes: pacote?.sessoes_total || 5,
    valor: pacote ? String(pacote.valor).replace('.', ',') : '', data_venda: pacote?.data_venda || hojeSP(), validade: pacote?.validade || '',
    pago: pacote ? !!pacote.pago : true, forma: pacote?.forma_pagamento || 'Pix',
  }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const cent = reaisParaCentavos(f.valor)
  const sessoes = Math.floor(Number(f.sessoes))
  const valido = f.cliente_id && f.nome.trim() && cent != null && sessoes >= 1 && sessoes <= 200
  function escolherServico(e) {
    const s = servicos.find((x) => x.id === e.target.value)
    setF((x) => ({ ...x, servico_id: s?.id || '', nome: x.nome.trim() || !s ? x.nome : `${x.sessoes} × ${s.nome}` }))
  }
  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const ok = await onSalvar({
      ...(pacote?.id ? { id: pacote.id } : {}), cliente_id: f.cliente_id, nome: f.nome.trim(), servico_id: f.servico_id || null, sessoes_total: sessoes, valor: cent / 100,
      data_venda: f.data_venda, validade: f.validade || null, pago: f.pago, forma_pagamento: f.pago ? f.forma : null, data_pagamento: f.pago ? (pacote?.data_pagamento || f.data_venda) : null,
    })
    setSalvando(false)
    if (ok) onClose()
  }
  async function remover() {
    if (!window.confirm('Apagar este pacote? As sessões já marcadas continuam, mas deixam de estar ligadas a ele.')) return
    if (await onRemover(pacote.id)) onClose()
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">{pacote?.id ? 'Editar pacote' : 'Novo pacote de sessões'}</div>
        <div className="form-row cols2">
          <div className="form-group"><label>Cliente</label>
            <select value={f.cliente_id} onChange={set('cliente_id')}><option value="">Escolha…</option>{clientes.filter((c) => c.ativo !== false || c.id === pacote?.cliente_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </div>
          <div className="form-group"><label>Serviço <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label>
            <select value={f.servico_id} onChange={escolherServico}><option value="">Qualquer</option>{servicos.filter((s) => s.ativo !== false).map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select>
          </div>
        </div>
        <div className="form-group"><label>Nome do pacote</label><input value={f.nome} onChange={set('nome')} placeholder="Ex.: 5 limpezas de pele" /></div>
        <div className="form-row cols2">
          <div className="form-group"><label>Quantas sessões</label><input type="number" min="1" max="200" value={f.sessoes} onChange={set('sessoes')} /></div>
          <div className="form-group"><label>Valor do pacote (R$)</label><input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="Ex.: 600" /></div>
        </div>
        {cent != null && sessoes >= 1 && <div className="cad-sub" style={{ marginBottom: 8 }}>Cada sessão sai por <b>{fmt(cent / 100 / sessoes)}</b>.</div>}
        <div className="form-row cols2">
          <div className="form-group"><label>Data da venda</label><input type="date" value={f.data_venda} onChange={set('data_venda')} /></div>
          <div className="form-group"><label>Validade <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input type="date" value={f.validade} onChange={set('validade')} /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group" style={{ justifyContent: 'flex-end' }}><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.pago} onChange={(e) => setF((x) => ({ ...x, pago: e.target.checked }))} /> Já recebi o pacote</label></div>
          {f.pago && <div className="form-group"><label>Forma de pagamento</label><select value={f.forma} onChange={set('forma')}>{FORMAS.map((x) => <option key={x}>{x}</option>)}</select></div>}
        </div>
        <div className="modal-footer">
          {pacote?.id && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={remover}>Apagar</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
