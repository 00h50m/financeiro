import { useState } from 'react'
import { fmt, mesLabel, corPessoa, tituloCompra, subtituloCompra, valorParcelaBase } from '../../lib/utils'
import { rotuloOrigem } from '../../lib/origem'
import { parcelasPagas } from '../../lib/financeiro'

const dm = (d) => String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/')

// Uma compra na lista: o essencial numa olhada (descrição, data, valor, categoria, pessoa, forma de pagamento); o resto fica nos detalhes.
export default function LinhaCompra({ c, cartao, cartoes, pessoas, categorias, comprasPagamentos, comprasPagamentosOk, tamanhoGrupo, selecionavel, selecionada, aoSelecionar, aberta, aoAlternar, acoes }) {
  const parcelada = Number(c.parcelas) > 1
  const dividida = c.grupo_id && tamanhoGrupo > 1
  const titulo = tituloCompra(c)
  return (
    <li className={`cmp-lin ${aberta ? 'aberta' : ''}`}>
      <div className="cmp-lin-main">
        {selecionavel && <input type="checkbox" className="cmp-check" checked={!!selecionada} onChange={() => aoSelecionar(c.id)} aria-label={`Selecionar ${titulo}`} />}
        <button type="button" className="cmp-corpo" onClick={() => aoAlternar(c.id)} aria-expanded={!!aberta}>
          <span className="cmp-data mono">{dm(c.data_compra)}</span>
          <span className="cmp-desc">
            <span className="cmp-nome">{titulo}</span>
            {(parcelada || dividida) && <span className="cmp-marcas">{parcelada && <span className="badge badge-amber">{c.parcelas}x</span>}{dividida && <span className="badge badge-blue">dividida</span>}</span>}
          </span>
          <span className="cmp-meta">
            <span className="cmp-cat">{c.categoria}</span>
            <span className={`badge badge-${corPessoa(pessoas, c.pessoa)}`}>{c.pessoa}</span>
            <span className="cmp-pag">{cartao ? cartao.nome : 'Sem cartão'}</span>
          </span>
          <span className="cmp-valor mono">{fmt(c.valor_total)}</span>
        </button>
      </div>
      {aberta && <Detalhes c={c} cartao={cartao} cartoes={cartoes} categorias={categorias} comprasPagamentos={comprasPagamentos} comprasPagamentosOk={comprasPagamentosOk} tamanhoGrupo={tamanhoGrupo} acoes={acoes} />}
    </li>
  )
}

function Detalhes({ c, cartao, cartoes, categorias, comprasPagamentos, comprasPagamentosOk, tamanhoGrupo, acoes }) {
  const [cat, setCat] = useState(c.categoria)
  const [sub, setSub] = useState(c.subcategoria || '')
  const subs = categorias.find((x) => x.nome === cat)?.subcategorias || []
  const dividida = c.grupo_id && tamanhoGrupo > 1
  const mudou = (cat !== c.categoria || sub !== (c.subcategoria || '')) && cat && sub
  const origem = rotuloOrigem(c.origem)
  let statusSemCartao = null
  if (!cartao) {
    const { pagas, total } = parcelasPagas(c, cartoes, comprasPagamentos, comprasPagamentosOk)
    statusSemCartao = total > 1 && pagas > 0 && pagas < total ? `${pagas}/${total} pagas` : pagas === total ? 'paga' : 'a pagar'
  }
  return (
    <div className="cmp-detalhes">
      <dl className="cmp-dl">
        <div><dt>Categoria</dt><dd>{c.categoria}{c.subcategoria ? ` › ${c.subcategoria}` : ''}</dd></div>
        <div><dt>Pagamento</dt><dd>{cartao ? `${cartao.nome} · ${Number(c.parcelas) > 1 ? `${c.parcelas}x de ${fmt(valorParcelaBase(c))}` : 'à vista'}` : `Sem cartão · ${Number(c.parcelas) > 1 ? `${c.parcelas}x de ${fmt(valorParcelaBase(c))} · ` : ''}${statusSemCartao}`}</dd></div>
        {subtituloCompra(c) && <div><dt>No cartão</dt><dd>{subtituloCompra(c)}</dd></div>}
        {c.obs && <div><dt>Observação</dt><dd>{c.obs}</dd></div>}
        {origem && <div><dt>Origem</dt><dd>{origem}</dd></div>}
        {c.fatura_mes && cartao && <div><dt>Fatura</dt><dd>{mesLabel(c.fatura_mes)} (escolhida na compra)</dd></div>}
        {dividida && <div><dt>Divisão</dt><dd>Dividida em {tamanhoGrupo} categorias</dd></div>}
      </dl>
      {!dividida ? (
        <div className="cmp-rapida" role="group" aria-label="Trocar a categoria desta compra">
          <select value={cat} onChange={(e) => { setCat(e.target.value); setSub('') }} aria-label="Categoria">
            {categorias.map((x) => <option key={x.id} value={x.nome}>{x.nome}</option>)}
          </select>
          <select value={sub} onChange={(e) => setSub(e.target.value)} aria-label="Subcategoria">
            <option value="">Escolha a subcategoria…</option>
            {subs.map((x) => <option key={x}>{x}</option>)}
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={!mudou} onClick={() => acoes.trocarCategoria(c, cat, sub)}>Salvar categoria</button>
        </div>
      ) : <p className="cad-sub">Compra dividida em categorias: use "Editar" para mexer nas partes.</p>}
      <div className="cmp-acoes">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => acoes.editar(c)}>Editar</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => acoes.renomear(c)}>Renomear</button>
        <button type="button" className="btn btn-ghost btn-sm cmp-excluir" onClick={() => acoes.excluir(c)}>Excluir</button>
      </div>
    </div>
  )
}
