import { useState, useMemo } from 'react'
import { fmt, mesLabel, corPessoa, tituloCompra, subtituloCompra, valorParcelaBase } from '../lib/utils'
import { parcelasPagas } from '../lib/financeiro'
import ModalCompra from './ModalCompra'
import { rotuloOrigem } from '../lib/origem'
import { partesDoGrupo } from '../lib/divisaoCompra'
import { compilar } from '../lib/filtro'
import { paraCsv, baixarCsv } from '../lib/csvExport'
import { CampoBusca, ResumoFiltro } from './FiltroLista'

export default function Compras({ store }) {
  const { compras, cartoes, categorias, pessoas, comprasPagamentos, comprasPagamentosOk, addCompra, updateCompra, salvarDivisao, updateComprasLote, delCompra } = store
  const [modal, setModal] = useState(false)
  const [edicao, setEdicao] = useState(null) // { compra } ou { grupo: [partes] }
  const [filtro, setFiltro] = useState('')
  const [filtroPessoa, setFiltroPessoa] = useState('')
  const [filtroCartao, setFiltroCartao] = useState('') // id, 'sem' ou ''
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroMes, setFiltroMes] = useState('')
  const [filtroParcela, setFiltroParcela] = useState('') // 'vista' | 'parcelada'
  const [marcadas, setMarcadas] = useState([])
  const [novaCat, setNovaCat] = useState('')
  const [novaSub, setNovaSub] = useState('')

  // Sem a coluna grupo_id no banco (inbox/19 não rodou) a divisão funciona, mas as partes ficam soltas.
  const gruposOk = compras.some((c) => 'grupo_id' in c)
  const tamanhoGrupo = useMemo(() => {
    const m = {}
    compras.forEach((c) => { if (c.grupo_id) m[c.grupo_id] = (m[c.grupo_id] || 0) + 1 })
    return m
  }, [compras])
  function abrirEdicao(c) {
    const partes = partesDoGrupo(compras, c.grupo_id)
    setEdicao(partes.length >= 2 ? { grupo: partes } : { compra: c })
  }

  const mesesDasCompras = useMemo(() => [...new Set(compras.map((c) => String(c.data_compra).slice(0, 7)))].sort().reverse(), [compras])
  const filtroAtivo = !!(filtro.trim() || filtroPessoa || filtroCartao || filtroCategoria || filtroMes || filtroParcela)
  const limparFiltros = () => { setFiltro(''); setFiltroPessoa(''); setFiltroCartao(''); setFiltroCategoria(''); setFiltroMes(''); setFiltroParcela('') }
  const lista = useMemo(() => {
    const { combina } = compilar(filtro)
    return compras.filter((c) => {
      if (filtroPessoa && c.pessoa !== filtroPessoa) return false
      if (filtroCartao === 'sem' ? !!cartoes.find((x) => x.id === c.cartao_id) : filtroCartao && c.cartao_id !== filtroCartao) return false
      if (filtroCategoria && c.categoria !== filtroCategoria) return false
      if (filtroMes && !String(c.data_compra).startsWith(filtroMes)) return false
      if (filtroParcela === 'vista' && Number(c.parcelas) > 1) return false
      if (filtroParcela === 'parcelada' && !(Number(c.parcelas) > 1)) return false
      return combina({
        texto: [c.descricao, c.identificacao, c.categoria, c.subcategoria, c.obs, c.pessoa, cartoes.find((x) => x.id === c.cartao_id)?.nome, rotuloOrigem(c.origem)].filter(Boolean).join(' '),
        valor: [Number(c.valor_total), valorParcelaBase(c)],
        data: c.data_compra,
      })
    })
  }, [compras, cartoes, filtro, filtroPessoa, filtroCartao, filtroCategoria, filtroMes, filtroParcela])

  const idsVisiveis = lista.map((c) => c.id)
  // Só vale o que está aparecendo: marcar, mudar a busca e aplicar nunca altera compras que a pessoa não vê.
  const selecionadas = marcadas.filter((id) => idsVisiveis.includes(id))
  const todasMarcadas = idsVisiveis.length > 0 && idsVisiveis.every((id) => marcadas.includes(id))
  const alternar = (id) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const subsNova = categorias.find((c) => c.nome === novaCat)?.subcategorias || []

  async function aplicarCategoria() {
    if (!novaCat || !selecionadas.length) return
    const sub = novaSub || subsNova[0] || 'Outros'
    if (!confirm(`Mudar ${selecionadas.length} compra${selecionadas.length > 1 ? 's' : ''} para ${novaCat} › ${sub}?`)) return
    const ok = await updateComprasLote(selecionadas, { categoria: novaCat, subcategoria: sub })
    if (ok) { setMarcadas([]); setNovaCat(''); setNovaSub('') }
  }

  function editarIdentificacao(c) {
    const novo = window.prompt(`Identificação de "${c.descricao}" (o que é essa compra). Deixe vazio para remover:`, c.identificacao || '')
    if (novo == null) return
    updateCompra(c.id, { identificacao: novo.trim() || null })
  }

  return (
    <div className="page">
      {(modal || edicao) && (
        <ModalCompra
          cartoes={cartoes}
          categorias={categorias}
          pessoas={pessoas}
          editar={edicao?.compra || null}
          grupo={edicao?.grupo || null}
          gruposOk={gruposOk}
          faturaMesOk={compras.some((c) => 'fatura_mes' in c)}
          comprasExistentes={compras}
          avisoPagamentos={!!edicao && (comprasPagamentos || []).some((p) => (edicao.grupo || [edicao.compra]).some((c) => c.id === p.compra_id))}
          onSave={edicao?.compra ? (dados) => updateCompra(edicao.compra.id, dados) : addCompra}
          onSaveDivisao={salvarDivisao}
          onClose={() => { setModal(false); setEdicao(null) }}
        />
      )}

      {cartoes.length === 0 && (
        <div className="alert alert-amber">⚠ Cadastre pelo menos um cartão antes de registrar compras.</div>
      )}

      <div className="toolbar">
        <CampoBusca valor={filtro} onChange={setFiltro} />
        <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} style={{ width: 160 }} aria-label="Filtrar por pessoa">
          <option value="">Todas as pessoas</option>
          {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
        </select>
        <select value={filtroCartao} onChange={(e) => setFiltroCartao(e.target.value)} style={{ width: 150 }} aria-label="Filtrar por cartão">
          <option value="">Todos os cartões</option>
          {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          <option value="sem">Sem cartão</option>
        </select>
        <select value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)} style={{ width: 175 }} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
        </select>
        <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} style={{ width: 140 }} aria-label="Filtrar por mês da compra">
          <option value="">Todos os meses</option>
          {mesesDasCompras.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
        </select>
        <select value={filtroParcela} onChange={(e) => setFiltroParcela(e.target.value)} style={{ width: 175 }} aria-label="À vista ou parcelada">
          <option value="">À vista e parceladas</option>
          <option value="vista">Só à vista</option>
          <option value="parcelada">Só parceladas</option>
        </select>
        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} disabled={!lista.length} title="Baixa a lista que está na tela (com os filtros) em CSV, para abrir no Excel"
          onClick={() => baixarCsv('compras', paraCsv([
            { titulo: 'Data', valor: (c) => String(c.data_compra).slice(0, 10).split('-').reverse().join('/') }, { titulo: 'Descrição', valor: (c) => c.descricao }, { titulo: 'Identificação', valor: (c) => c.identificacao || '' },
            { titulo: 'Pessoa', valor: (c) => c.pessoa }, { titulo: 'Categoria', valor: (c) => c.categoria }, { titulo: 'Subcategoria', valor: (c) => c.subcategoria },
            { titulo: 'Cartão', valor: (c) => cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão' }, { titulo: 'Valor total', valor: (c) => Number(c.valor_total) },
            { titulo: 'Parcelas', valor: (c) => Number(c.parcelas) || 1 }, { titulo: 'Valor da parcela', valor: (c) => valorParcelaBase(c) }, { titulo: 'Observação', valor: (c) => c.obs || '' },
          ], lista))}>Exportar CSV</button>
        <button className="btn btn-primary" onClick={() => setModal(true)}>
          + Nova compra
        </button>
      </div>

      <ResumoFiltro ativo={filtroAtivo} mostrando={lista.length} total={compras.length} onLimpar={limparFiltros} soma={lista.reduce((s, c) => s + Number(c.valor_total), 0)} fmt={fmt} />

      {selecionadas.length > 0 && (
        <div className="toolbar" style={{ background: 'var(--bg2, transparent)' }}>
          <span style={{ fontSize: 13 }}>{selecionadas.length} selecionada{selecionadas.length > 1 ? 's' : ''}</span>
          <select value={novaCat} onChange={(e) => { setNovaCat(e.target.value); setNovaSub('') }} style={{ width: 170 }}>
            <option value="">Nova categoria…</option>
            {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
          </select>
          {novaCat && (
            <select value={novaSub || subsNova[0] || ''} onChange={(e) => setNovaSub(e.target.value)} style={{ width: 170 }}>
              {subsNova.length ? subsNova.map((x) => <option key={x}>{x}</option>) : <option>Outros</option>}
            </select>
          )}
          <button className="btn btn-primary" disabled={!novaCat} onClick={aplicarCategoria}>Aplicar</button>
          <button className="btn" onClick={() => setMarcadas([])}>Limpar</button>
        </div>
      )}

      <div className="card">
        {lista.length === 0 ? (
          <div className="empty">
            {filtroAtivo ? 'Nenhuma compra com esses filtros.\nTente outro termo ou clique em "Limpar filtros".' : 'Nenhuma compra encontrada.\nClique em "+ Nova compra" para começar.'}
          </div>
        ) : (
          <table className="tabela-compacta lista-cartoes">
            <thead>
              <tr>
                <th style={{ width: 28 }}>
                  <input type="checkbox" checked={todasMarcadas} title="Marcar todas as que aparecem"
                    onChange={() => setMarcadas(todasMarcadas ? [] : idsVisiveis)} />
                </th>
                <th className="col-opc">Data</th>
                <th>Descrição</th>
                <th className="col-opc">Pessoa</th>
                <th className="col-opc">Categoria</th>
                <th className="col-opc">Cartão</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th className="col-opc" style={{ textAlign: 'center' }}>Parcelas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => {
                const cartao = cartoes.find((x) => x.id === c.cartao_id)
                const dd = c.data_compra.slice(0, 10).split('-')
                return (
                  <tr key={c.id}>
                    <td className="check-cel"><input type="checkbox" checked={marcadas.includes(c.id)} onChange={() => alternar(c.id)} /></td>
                    <td className="col-opc" style={{ fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                      {dd[2]}/{dd[1]}/{dd[0].slice(2)}
                    </td>
                    <td className="nome-cel">
                      <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                        {tituloCompra(c)}
                        <button
                          onClick={() => editarIdentificacao(c)}
                          title="Identificar / renomear (o que é essa compra)"
                          style={{ background: 'transparent', color: 'var(--text3)', fontSize: 12, padding: 0 }}
                        >✎</button>
                      </div>
                      {subtituloCompra(c) && <div style={{ fontSize: 11, color: 'var(--text3)' }}>no cartão: {subtituloCompra(c)}</div>}
                      {c.grupo_id && tamanhoGrupo[c.grupo_id] > 1 && (
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>dividida em {tamanhoGrupo[c.grupo_id]} categorias</span>
                        </div>
                      )}
                      {c.fatura_mes && c.cartao_id && <div style={{ fontSize: 11, color: 'var(--text3)' }}><span className="badge badge-blue" style={{ fontSize: 10 }}>fatura de {mesLabel(c.fatura_mes)} (escolhida)</span></div>}
                      {c.obs && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.obs}</div>}
                      {rotuloOrigem(c.origem) && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{rotuloOrigem(c.origem)}</div>}
                      <div className="so-mobile">
                        {dd[2]}/{dd[1]}/{dd[0].slice(2)} · {c.pessoa} · {cartao ? cartao.nome : 'Sem cartão'} · {c.categoria}{c.subcategoria ? ` › ${c.subcategoria}` : ''}{Number(c.parcelas) > 1 ? ` · ${c.parcelas}x de ${fmt(valorParcelaBase(c))}` : ' · à vista'}
                      </div>
                    </td>
                    <td className="col-opc">
                      <span className={`badge badge-${corPessoa(pessoas, c.pessoa)}`}>
                        {c.pessoa}
                      </span>
                    </td>
                    <td className="col-opc" style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {c.categoria}<br />
                      <span style={{ color: 'var(--text3)' }}>{c.subcategoria}</span>
                    </td>
                    <td className="col-opc">
                      {cartao ? (
                        <span className="badge badge-gray">{cartao.nome}</span>
                      ) : (
                        <div>
                          <span className="badge badge-gray">Sem cartão</span>
                          <div style={{ marginTop: 3 }}>
                            {(() => {
                              const { pagas, total } = parcelasPagas(c, cartoes, comprasPagamentos, comprasPagamentosOk)
                              if (total > 1 && pagas > 0 && pagas < total) {
                                return <span className="badge badge-amber" style={{ fontSize: 10 }}>{pagas}/{total} pagas</span>
                              }
                              return pagas === total
                                ? <span className="badge badge-green" style={{ fontSize: 10 }}>pago</span>
                                : <span className="badge badge-amber" style={{ fontSize: 10 }}>a pagar</span>
                            })()}
                          </div>
                        </div>
                      )}
                    </td>
                    <td className="valor-cel" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, whiteSpace: 'nowrap' }}>{fmt(c.valor_total)}</td>
                    <td className="col-opc" style={{ textAlign: 'center' }}>
                      {Number(c.parcelas) > 1 ? (
                        <div>
                          <span className="badge badge-amber">{c.parcelas}x</span>
                          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                            {fmt(valorParcelaBase(c))}/mês
                          </div>
                        </div>
                      ) : (
                        <span className="badge badge-gray">à vista</span>
                      )}
                    </td>
                    <td className="acoes-td" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(c)} style={{ marginRight: 6 }}>Editar</button>
                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          const parte = c.grupo_id && tamanhoGrupo[c.grupo_id] > 1
                          const msg = parte
                            ? `Remover só esta parte de "${c.descricao}" (${fmt(c.valor_total)})?\n\nAs outras partes da compra dividida continuam.`
                            : `Remover "${c.descricao}"?`
                          if (confirm(msg)) delCompra(c.id)
                        }}
                      >×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
