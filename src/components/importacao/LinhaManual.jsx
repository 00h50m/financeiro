import { useState } from 'react'
import { fmt } from '../../lib/utils'
import { reaisParaCentavos } from '../../lib/aulas'

// Valor digitado ("1.234,56", "-30" para crédito) -> número, ou null se não der para entender.
export function lerValorManual(texto) {
  const t = String(texto ?? '').trim()
  const negativo = t.startsWith('-')
  const c = reaisParaCentavos(t.replace(/^-/, ''))
  return c == null || c === 0 ? null : (negativo ? -c : c) / 100
}

// Formulário para incluir um lançamento que a leitura da fatura perdeu (encargo, compra, crédito). Entra como linha nova do arquivo.
export default function LinhaManual({ a, valorSugerido = null, aoAdicionar }) {
  const hoje = new Date().toISOString().slice(0, 10)
  const dataInicial = a.mesFatura && !hoje.startsWith(a.mesFatura) ? `${a.mesFatura}-15` : hoje
  const cartao = a.cartoes.find((c) => c.id === a.cartaoId)
  const [aberto, setAberto] = useState(false)
  const [f, setF] = useState({ data: dataInicial, descricao: '', valor: valorSugerido != null ? String(valorSugerido).replace('.', ',') : '', categoria: '', subcategoria: '', pessoa: cartao?.titular || a.pessoas[0]?.nome || '' })
  const [erro, setErro] = useState('')
  const subs = a.categorias.find((c) => c.nome === f.categoria)?.subcategorias || []
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  function adicionar() {
    const valor = lerValorManual(f.valor)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.data)) return setErro('Informe a data.')
    if (!f.descricao.trim()) return setErro('Informe uma descrição (por exemplo: Juros, Anuidade, nome da loja).')
    if (valor == null) return setErro('Informe o valor (use o sinal de menos para um crédito).')
    if (!f.categoria || !f.subcategoria) return setErro('Escolha a categoria e a subcategoria.')
    setErro('')
    a.adicionarLinha({ data: f.data, descricao: f.descricao.trim(), valor: String(valor), categoria: f.categoria, subcategoria: f.subcategoria, pessoa: f.pessoa })
    setF((x) => ({ ...x, descricao: '', valor: '', categoria: '', subcategoria: '' }))
    setAberto(false)
    aoAdicionar?.()
  }

  if (!aberto) {
    return (
      <div className="imp-manual-topo">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAberto(true)}>+ Adicionar lançamento que faltou</button>
        {valorSugerido != null && <span className="cad-sub"> Faltam {fmt(valorSugerido)} no arquivo em relação ao banco.</span>}
      </div>
    )
  }
  return (
    <section className="card imp-manual" aria-label="Adicionar lançamento que faltou">
      <h3>Adicionar lançamento que faltou</h3>
      <p className="cad-sub">Para uma linha da fatura que a leitura não trouxe (juros, anuidade, uma compra). Ela entra como as demais e só é gravada quando você confirmar.</p>
      <div className="imp-grade-campos">
        <label>Data<input type="date" value={f.data} onChange={set('data')} /></label>
        <label>Descrição<input value={f.descricao} onChange={set('descricao')} placeholder="Ex.: Juros, Anuidade, Loja X" /></label>
        <label>Valor<input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="0,00" /></label>
        <label>Categoria<select value={f.categoria} onChange={(e) => setF((x) => ({ ...x, categoria: e.target.value, subcategoria: (a.categorias.find((c) => c.nome === e.target.value)?.subcategorias || []).length === 1 ? a.categorias.find((c) => c.nome === e.target.value).subcategorias[0] : '' }))}><option value="">Selecione…</option>{a.categorias.map((c) => <option key={c.id}>{c.nome}</option>)}</select></label>
        <label>Subcategoria<select value={f.subcategoria} disabled={!f.categoria} onChange={set('subcategoria')}><option value="">{f.categoria ? 'Escolha a subcategoria…' : 'Escolha a categoria antes'}</option>{subs.map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>Pessoa<select value={f.pessoa} onChange={set('pessoa')}>{a.pessoas.map((p) => <option key={p.id}>{p.nome}</option>)}</select></label>
      </div>
      {erro && <div className="alert alert-red" role="alert" style={{ marginTop: 8 }}>{erro}</div>}
      <div className="imp-acoes" style={{ marginTop: 10 }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={adicionar}>Adicionar à fatura</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setAberto(false); setErro('') }}>Cancelar</button>
      </div>
    </section>
  )
}
