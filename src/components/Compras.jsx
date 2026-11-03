import { useState, useMemo } from 'react'
import { fmt, mesLabel, valorParcelaBase } from '../lib/utils'
import ModalCompra from './ModalCompra'
import { rotuloOrigem } from '../lib/origem'
import { partesDoGrupo } from '../lib/divisaoCompra'
import { compilar } from '../lib/filtro'
import { paraCsv, baixarCsv } from '../lib/csvExport'
import { CampoBusca, ResumoFiltro, BotaoFiltros } from './FiltroLista'
import { useDialogos } from './ui/Dialogos'
import EstadoVazio from './ui/EstadoVazio'
import LinhaCompra from './compras/LinhaCompra'
import { ORDENACOES, ordenarCompras, origensDasCompras, origemDaCompra, fatiar, LIMITE_POR_MES } from '../lib/comprasLista'

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
  const [filtroOrigem, setFiltroOrigem] = useState('')
  const [ordem, setOrdem] = useState('data_desc')
  const [modoSelecao, setModoSelecao] = useState(false)
  const [abertas, setAbertas] = useState(() => new Set()) // compras com os detalhes abertos
  const [limites, setLimites] = useState({}) // mês → quantas compras mostrar (paginação)
  const { confirmar, pedir, dialogo } = useDialogos()
  const [marcadas, setMarcadas] = useState([])
  const [novaCat, setNovaCat] = useState('')
  const [novaSub, setNovaSub] = useState('')
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [mesesAbertos, setMesesAbertos] = useState({}) // mês → aberto; sem valor: só o mês mais recente (ou todos, se há filtro)

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
  const filtroAtivo = !!(filtro.trim() || filtroPessoa || filtroCartao || filtroCategoria || filtroMes || filtroParcela || filtroOrigem)
  const limparFiltros = () => { setFiltro(''); setFiltroPessoa(''); setFiltroCartao(''); setFiltroCategoria(''); setFiltroMes(''); setFiltroParcela(''); setFiltroOrigem('') }
  const origens = useMemo(() => origensDasCompras(compras), [compras])
  const lista = useMemo(() => {
    const { combina } = compilar(filtro)
    return compras.filter((c) => {
      if (filtroPessoa && c.pessoa !== filtroPessoa) return false
      if (filtroCartao === 'sem' ? !!cartoes.find((x) => x.id === c.cartao_id) : filtroCartao && c.cartao_id !== filtroCartao) return false
      if (filtroCategoria && c.categoria !== filtroCategoria) return false
      if (filtroMes && !String(c.data_compra).startsWith(filtroMes)) return false
      if (filtroParcela === 'vista' && Number(c.parcelas) > 1) return false
      if (filtroParcela === 'parcelada' && !(Number(c.parcelas) > 1)) return false
      if (filtroOrigem && origemDaCompra(c) !== filtroOrigem) return false
      return combina({
        texto: [c.descricao, c.identificacao, c.categoria, c.subcategoria, c.obs, c.pessoa, cartoes.find((x) => x.id === c.cartao_id)?.nome, rotuloOrigem(c.origem)].filter(Boolean).join(' '),
        valor: [Number(c.valor_total), valorParcelaBase(c)],
        data: c.data_compra,
      })
    })
  }, [compras, cartoes, filtro, filtroPessoa, filtroCartao, filtroCategoria, filtroMes, filtroParcela, filtroOrigem])

  // Lista agrupada por mês da compra, do mais recente para o mais antigo.
  const grupos = useMemo(() => {
    const porMes = new Map()
    for (const c of ordenarCompras(lista, ordem)) {
      const m = String(c.data_compra).slice(0, 7)
      if (!porMes.has(m)) porMes.set(m, [])
      porMes.get(m).push(c)
    }
    return [...porMes.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([mes, itens]) => ({
      mes, itens, total: itens.reduce((t, c) => t + Number(c.valor_total), 0),
    }))
  }, [lista, ordem])
  const mesAberto = (mes, i) => mesesAbertos[mes] ?? (filtroAtivo || i === 0)
  const todosAbertos = grupos.length > 0 && grupos.every((g, i) => mesAberto(g.mes, i))
  const alternarMes = (mes, i) => setMesesAbertos((a) => ({ ...a, [mes]: !mesAberto(mes, i) }))
  const alternarTodosMeses = () => setMesesAbertos(Object.fromEntries(grupos.map((g) => [g.mes, !todosAbertos])))
  const nFiltros = [filtroPessoa, filtroCartao, filtroCategoria, filtroMes, filtroParcela, filtroOrigem].filter(Boolean).length

  const idsVisiveis = lista.map((c) => c.id)
  // Só vale o que está aparecendo: marcar, mudar a busca e aplicar nunca altera compras que a pessoa não vê.
  const selecionadas = marcadas.filter((id) => idsVisiveis.includes(id))
  const alternar = (id) => setMarcadas((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))
  const subsNova = categorias.find((c) => c.nome === novaCat)?.subcategorias || []

  async function aplicarCategoria() {
    if (!novaCat || !selecionadas.length) return
    const sub = novaSub || subsNova[0] || 'Outros'
    if (!(await confirmar({ titulo: 'Trocar categoria', texto: `Mudar ${selecionadas.length} compra${selecionadas.length > 1 ? 's' : ''} para ${novaCat} › ${sub}?`, confirmar: 'Trocar categoria' }))) return
    const ok = await updateComprasLote(selecionadas, { categoria: novaCat, subcategoria: sub })
    if (ok) { setMarcadas([]); setNovaCat(''); setNovaSub('') }
  }
  async function renomear(c) {
    const novo = await pedir({ titulo: 'Renomear compra', texto: `Identificação de "${c.descricao}" (o que é essa compra). Deixe vazio para remover.`, valor: c.identificacao || '', teclado: 'text' })
    if (novo == null) return
    updateCompra(c.id, { identificacao: novo.trim() || null })
  }
  async function excluir(c) {
    const parte = c.grupo_id && tamanhoGrupo[c.grupo_id] > 1
    const texto = parte ? `Remover só esta parte de "${c.descricao}" (${fmt(c.valor_total)})? As outras partes da compra dividida continuam.` : `Remover "${c.descricao}" (${fmt(c.valor_total)})? Dá para desfazer logo depois.`
    if (await confirmar({ titulo: 'Excluir compra', texto, confirmar: 'Excluir', perigoso: true })) delCompra(c.id)
  }
  const trocarCategoria = (c, categoria, subcategoria) => updateCompra(c.id, { categoria, subcategoria })
  const alternarDetalhes = (id) => setAbertas((a) => { const n = new Set(a); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const acoesLinha = { editar: abrirEdicao, renomear, excluir, trocarCategoria }
  const selecaoVisivel = modoSelecao || selecionadas.length > 0
  const totalSelecionadas = selecionadas.reduce((t, id) => t + Number(compras.find((c) => c.id === id)?.valor_total || 0), 0)

  return (
    <div className="page">
      {dialogo}
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
        <BotaoFiltros aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} ativos={nFiltros} />
        <select value={ordem} onChange={(e) => setOrdem(e.target.value)} aria-label="Ordenar compras" className="cmp-ordem">
          {ORDENACOES.map(([k, rotulo]) => <option key={k} value={k}>{rotulo}</option>)}
        </select>
        <button type="button" className={`btn btn-sm ${selecaoVisivel ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={selecaoVisivel} onClick={() => { if (selecaoVisivel) { setModoSelecao(false); setMarcadas([]) } else setModoSelecao(true) }}>{selecaoVisivel ? 'Concluir seleção' : 'Selecionar'}</button>
        <button className="btn btn-ghost btn-sm tb-sec" style={{ marginLeft: 'auto' }} disabled={!lista.length} title="Baixa a lista que está na tela (com os filtros) em CSV, para abrir no Excel"
          onClick={() => baixarCsv('compras', paraCsv([
            { titulo: 'Data', valor: (c) => String(c.data_compra).slice(0, 10).split('-').reverse().join('/') }, { titulo: 'Descrição', valor: (c) => c.descricao }, { titulo: 'Identificação', valor: (c) => c.identificacao || '' },
            { titulo: 'Pessoa', valor: (c) => c.pessoa }, { titulo: 'Categoria', valor: (c) => c.categoria }, { titulo: 'Subcategoria', valor: (c) => c.subcategoria },
            { titulo: 'Cartão', valor: (c) => cartoes.find((x) => x.id === c.cartao_id)?.nome || 'Sem cartão' }, { titulo: 'Valor total', valor: (c) => Number(c.valor_total) },
            { titulo: 'Parcelas', valor: (c) => Number(c.parcelas) || 1 }, { titulo: 'Valor da parcela', valor: (c) => valorParcelaBase(c) }, { titulo: 'Observação', valor: (c) => c.obs || '' },
          ], lista))}>Exportar CSV</button>
        <button className="btn btn-primary tb-primario" onClick={() => setModal(true)}>
          + Nova compra
        </button>
      </div>
      {filtrosAbertos && (
        <div className="filtros-painel">
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
          {origens.length > 1 && (
            <select value={filtroOrigem} onChange={(e) => setFiltroOrigem(e.target.value)} style={{ width: 175 }} aria-label="Filtrar por origem">
              <option value="">Todas as origens</option>
              {origens.map(([k, rotulo]) => <option key={k} value={k}>{rotulo}</option>)}
            </select>
          )}
        </div>
      )}

      <ResumoFiltro ativo={filtroAtivo} mostrando={lista.length} total={compras.length} onLimpar={limparFiltros} soma={lista.reduce((s, c) => s + Number(c.valor_total), 0)} fmt={fmt} />

      {lista.length === 0 ? (
        <div className="card">
          <EstadoVazio
            titulo={filtroAtivo ? 'Nenhuma compra com esses filtros' : 'Nenhuma compra ainda'}
            texto={filtroAtivo ? 'Tente outro termo ou limpe os filtros.' : 'Registre a primeira compra para começar.'}
            acao={filtroAtivo ? 'Limpar filtros' : cartoes.length ? '+ Nova compra' : undefined}
            aoClicar={filtroAtivo ? limparFiltros : () => setModal(true)}
          />
        </div>
      ) : (
        <>
          {grupos.length > 1 && (
            <div className="grupos-barra">
              <span>{grupos.length} meses</span>
              <button className="link-btn" onClick={alternarTodosMeses}>{todosAbertos ? 'Recolher todos' : 'Expandir todos'}</button>
            </div>
          )}
          {grupos.map((grupo, i) => {
            const aberto = mesAberto(grupo.mes, i)
            const ids = grupo.itens.map((c) => c.id)
            const todas = ids.every((id) => marcadas.includes(id))
            const { visiveis, restantes } = fatiar(grupo.itens, limites[grupo.mes] || LIMITE_POR_MES)
            return (
              <section key={grupo.mes} className="card grupo-mes">
                <div className="cmp-grupo-cab">
                  {selecaoVisivel && aberto && (
                    <input type="checkbox" className="cmp-check" checked={todas} aria-label={`Selecionar todas as compras de ${mesLabel(grupo.mes)}`} style={{ marginLeft: 12 }}
                      onChange={() => setMarcadas((m) => (todas ? m.filter((x) => !ids.includes(x)) : [...new Set([...m, ...ids])]))} />
                  )}
                  <button className="grupo-cab" style={{ flex: 1 }} onClick={() => alternarMes(grupo.mes, i)} aria-expanded={aberto}>
                    <span className="grupo-seta" aria-hidden="true">▾</span>
                    <span className="grupo-nome">{mesLabel(grupo.mes)}</span>
                    <span className="grupo-info">{grupo.itens.length} {grupo.itens.length === 1 ? 'compra' : 'compras'}</span>
                    <span className="grupo-total mono">{fmt(grupo.total)}</span>
                  </button>
                </div>
                {aberto && (
                  <>
                    <ul className="cmp-lista" aria-label={`Compras de ${mesLabel(grupo.mes)}`}>
                      {visiveis.map((c) => (
                        <LinhaCompra
                          key={c.id} c={c} cartao={cartoes.find((x) => x.id === c.cartao_id)} cartoes={cartoes} pessoas={pessoas} categorias={categorias}
                          comprasPagamentos={comprasPagamentos} comprasPagamentosOk={comprasPagamentosOk} tamanhoGrupo={c.grupo_id ? tamanhoGrupo[c.grupo_id] || 0 : 0}
                          selecionavel={selecaoVisivel} selecionada={marcadas.includes(c.id)} aoSelecionar={alternar}
                          aberta={abertas.has(c.id)} aoAlternar={alternarDetalhes} acoes={acoesLinha}
                        />
                      ))}
                    </ul>
                    {restantes > 0 && <button type="button" className="cmp-mais" onClick={() => setLimites((l) => ({ ...l, [grupo.mes]: (l[grupo.mes] || LIMITE_POR_MES) + LIMITE_POR_MES }))}>Mostrar mais {Math.min(restantes, LIMITE_POR_MES)} ({restantes} restantes)</button>}
                  </>
                )}
              </section>
            )
          })}
        </>
      )}

      {selecionadas.length > 0 && (
        <div className="barra-flutuante" role="region" aria-label="Ações em lote">
          <span><b>{selecionadas.length}</b> {selecionadas.length === 1 ? 'selecionada' : 'selecionadas'} · {fmt(totalSelecionadas)}</span>
          <span className="pag-lote-acoes">
            <select value={novaCat} onChange={(e) => { setNovaCat(e.target.value); setNovaSub('') }} aria-label="Nova categoria">
              <option value="">Nova categoria…</option>
              {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
            {novaCat && (
              <select value={novaSub || subsNova[0] || ''} onChange={(e) => setNovaSub(e.target.value)} aria-label="Nova subcategoria">
                {subsNova.length ? subsNova.map((x) => <option key={x}>{x}</option>) : <option>Outros</option>}
              </select>
            )}
            <button className="btn btn-primary btn-sm" disabled={!novaCat} onClick={aplicarCategoria}>Aplicar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMarcadas([])}>Limpar</button>
          </span>
        </div>
      )}
    </div>
  )
}
