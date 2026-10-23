import { useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'
import { FORMAS } from '../../lib/atendimentos'

// Venda de produto: tira do estoque e entra na renda do mês (a receber, se ainda não pagou).
export default function ModalVenda({ produtoInicial = '', produtos, clientes, onSalvar, onClose }) {
  const [f, setF] = useState(() => { const p = produtos.find((x) => x.id === produtoInicial); return { produto_id: produtoInicial, cliente_id: '', data: hojeSP(), quantidade: 1, valor: p ? String(p.preco).replace('.', ',') : '', pago: true, forma: 'Pix' } })
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const produto = produtos.find((p) => p.id === f.produto_id)
  const cent = reaisParaCentavos(f.valor)
  const qtd = Math.floor(Number(f.quantidade))
  const valido = produto && cent != null && qtd >= 1
  function escolher(e) { const p = produtos.find((x) => x.id === e.target.value); setF((x) => ({ ...x, produto_id: p?.id || '', valor: p ? String(p.preco).replace('.', ',') : x.valor })) }
  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const ok = await onSalvar({ produto_id: produto.id, produto_nome: produto.nome, cliente_id: f.cliente_id || null, data: f.data, quantidade: qtd, valor_unit: cent / 100, custo_unit: Number(produto.custo) || 0, pago: f.pago, forma_pagamento: f.pago ? f.forma : null, data_pagamento: f.pago ? f.data : null })
    setSalvando(false)
    if (ok) onClose()
  }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-title">Vender produto</div>
        <div className="form-group"><label>Produto</label>
          <select value={f.produto_id} onChange={escolher}><option value="">Escolha…</option>{produtos.filter((p) => p.ativo !== false).map((p) => <option key={p.id} value={p.id}>{p.nome} · {fmt(p.preco)} · estoque {p.estoque}</option>)}</select>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Quantidade</label><input type="number" min="1" step="1" value={f.quantidade} onChange={set('quantidade')} /></div>
          <div className="form-group"><label>Valor por unidade (R$)</label><input inputMode="decimal" value={f.valor} onChange={set('valor')} /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Cliente <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label>
            <select value={f.cliente_id} onChange={set('cliente_id')}><option value="">—</option>{clientes.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
          </div>
          <div className="form-group"><label>Data</label><input type="date" value={f.data} onChange={set('data')} /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group" style={{ justifyContent: 'flex-end' }}><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.pago} onChange={(e) => setF((x) => ({ ...x, pago: e.target.checked }))} /> Já recebi</label></div>
          {f.pago && <div className="form-group"><label>Forma de pagamento</label><select value={f.forma} onChange={set('forma')}>{FORMAS.map((x) => <option key={x}>{x}</option>)}</select></div>}
        </div>
        {produto && qtd > Number(produto.estoque) && <div className="alert alert-amber">Só há {produto.estoque} em estoque. Dá para vender mesmo assim (o estoque fica negativo até você repor).</div>}
        {valido && <div className="cad-sub">Total: <b>{fmt((cent * qtd) / 100)}</b></div>}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : 'Registrar venda'}</button>
        </div>
      </div>
    </div>
  )
}
