import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'

// Produto à venda (cremes, séruns…): preço, custo e estoque. Vender tira do estoque; para repor, edite e some a quantidade que chegou.
export default function ModalProduto({ produto, onSalvar, onRemover, onClose }) {
  const [f, setF] = useState(() => ({ nome: produto?.nome || '', preco: produto ? String(produto.preco).replace('.', ',') : '', custo: produto ? String(produto.custo).replace('.', ',') : '', estoque: produto?.estoque ?? 0 }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const preco = reaisParaCentavos(f.preco), custo = f.custo.trim() ? reaisParaCentavos(f.custo) : 0
  const valido = f.nome.trim() && preco != null && custo != null && Number.isInteger(Number(f.estoque))
  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const ok = await onSalvar({ ...(produto?.id ? { id: produto.id } : {}), nome: f.nome.trim(), preco: preco / 100, custo: custo / 100, estoque: Number(f.estoque) })
    setSalvando(false)
    if (ok) onClose()
  }
  async function remover() {
    if (!window.confirm(`Remover "${produto.nome}"? As vendas já feitas continuam com o nome e o valor da época.`)) return
    if (await onRemover(produto.id)) onClose()
  }
  async function alternarAtivo() { if (await onSalvar({ id: produto.id, ativo: produto.ativo === false })) onClose() }
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-title">{produto?.id ? `Editar ${produto.nome}` : 'Novo produto'}</div>
        <div className="form-group"><label>Nome</label><input value={f.nome} onChange={set('nome')} autoFocus placeholder="Ex.: Creme hidratante 50 g" /></div>
        <div className="form-row cols2">
          <div className="form-group"><label>Preço de venda (R$)</label><input inputMode="decimal" value={f.preco} onChange={set('preco')} placeholder="Ex.: 89" /></div>
          <div className="form-group"><label>Quanto custou para você (R$)</label><input inputMode="decimal" value={f.custo} onChange={set('custo')} placeholder="Ex.: 40" /></div>
        </div>
        <div className="form-group" style={{ maxWidth: 200 }}><label>Em estoque</label><input type="number" step="1" value={f.estoque} onChange={set('estoque')} /></div>
        {preco != null && <div className="cad-sub">Lucro por unidade: <b>{fmt(Math.max(0, (preco - (custo || 0)) / 100))}</b></div>}
        <div className="modal-footer">
          {produto?.id && <span style={{ marginRight: 'auto', display: 'flex', gap: 6 }}><button className="btn btn-ghost" onClick={alternarAtivo}>{produto.ativo === false ? 'Reativar' : 'Inativar'}</button><button className="btn btn-ghost" onClick={remover}>Remover</button></span>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
