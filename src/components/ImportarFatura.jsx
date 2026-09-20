import { useState, useMemo } from 'react'
import Papa from 'papaparse'
import { PESSOAS, fmt, mesLabel, calcMesInicio, addMonths, normalizarTexto, normalizarDescricao } from '../lib/utils'

const COLUNAS_ESPERADAS = ['data', 'descricao', 'valor', 'categoria', 'parcela_atual', 'parcela_total', 'cartao', 'observacao']
const TOLERANCIA_FATURA = 0.05

function linhaValida(l, categorias) {
  return !!l.data
    && !!l.descricao
    && l.valor !== '' && !isNaN(Number(l.valor))
    && !!l.categoria && categorias.some((c) => c.nome === l.categoria)
    && !!l.subcategoria
    && !!l.pessoa
    && !!l.cartao_id
}

// chave usada tanto para achar duplicata já lançada em `compras` quanto duplicata dentro do próprio CSV
const chaveLinha = (data, cartaoId, valor, descricao) =>
  `${(data || '').toString().slice(0, 10)}|${cartaoId || ''}|${Number(valor || 0).toFixed(2)}|${normalizarTexto(descricao)}`

function buildHistorico(compras) {
  const map = new Map()
  compras.forEach((c) => {
    const key = normalizarDescricao(c.descricao)
    if (!key) return
    if (!map.has(key)) map.set(key, [])
    map.get(key).push({ categoria: c.categoria, subcategoria: c.subcategoria })
  })
  return map
}

// categoria+subcategoria mais frequentes no histórico para a mesma descrição normalizada
function sugerirCategoriaCompleta(historico, normDesc, categorias) {
  const registros = historico.get(normDesc)
  if (!registros?.length) return null
  const contagem = new Map()
  registros.forEach(({ categoria, subcategoria }) => {
    const key = categoria + '\u0000' + subcategoria
    contagem.set(key, (contagem.get(key) || 0) + 1)
  })
  let melhorKey = null, melhorN = 0
  contagem.forEach((n, key) => { if (n > melhorN) { melhorN = n; melhorKey = key } })
  if (!melhorKey) return null
  const [categoria, subcategoria] = melhorKey.split('\u0000')
  const catObj = categorias.find((c) => c.nome === categoria)
  if (!catObj || !catObj.subcategorias.includes(subcategoria)) return null
  return { categoria, subcategoria }
}

// subcategoria mais frequente no histórico para a mesma descrição normalizada + categoria já definida
function sugerirSubcategoria(historico, normDesc, categoriaNome, categorias) {
  const registros = (historico.get(normDesc) || []).filter((r) => r.categoria === categoriaNome)
  if (!registros.length) return null
  const contagem = new Map()
  registros.forEach(({ subcategoria }) => contagem.set(subcategoria, (contagem.get(subcategoria) || 0) + 1))
  let melhor = null, melhorN = 0
  contagem.forEach((n, sub) => { if (n > melhorN) { melhorN = n; melhor = sub } })
  const catObj = categorias.find((c) => c.nome === categoriaNome)
  if (!melhor || !catObj?.subcategorias.includes(melhor)) return null
  return melhor
}

// procura, em `compras`, uma compra parcelada já lançada compatível com a linha (mesma descrição
// normalizada, cartão, quantidade de parcelas e valor de parcela)
function buscarCompraParcelada(compras, normDesc, cartaoId, parcelaTotal, valorParcela) {
  return compras.find((c) =>
    Number(c.parcelas) === parcelaTotal &&
    c.cartao_id === cartaoId &&
    normalizarDescricao(c.descricao) === normDesc &&
    Math.abs((Number(c.valor_total) / Number(c.parcelas || 1)) - valorParcela) <= 0.02
  ) || null
}

function statusConferencia(item) {
  if (item.valorReal === null) return { cls: 'badge-gray', label: 'fatura não cadastrada' }
  if (Math.abs(item.diff) <= TOLERANCIA_FATURA) return { cls: 'badge-green', label: '✓ bate' }
  const pctDiff = item.valorReal > 0 ? Math.abs(item.diff) / item.valorReal : 1
  const cls = pctDiff <= 0.05 ? 'badge-amber' : 'badge-red'
  return { cls, label: (item.diff > 0 ? '+' : '') + fmt(item.diff) }
}

export default function ImportarFatura({ store }) {
  const { cartoes, categorias, compras, faturas, importarTransacoes } = store
  const [linhas, setLinhas] = useState([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)

  function resolverCartao(nome) {
    const n = (nome || '').trim().toLowerCase()
    return cartoes.find((c) => c.nome.trim().toLowerCase() === n)
  }

  function handleFile(e) {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return

    setErroArquivo('')
    setResultado(null)
    setLinhas([])

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (res) => {
        const faltando = COLUNAS_ESPERADAS.filter((c) => !res.meta.fields?.includes(c))
        if (faltando.length > 0) {
          setErroArquivo(`CSV inválido — faltam colunas: ${faltando.join(', ')}`)
          return
        }

        const chavesExistentes = new Set(
          compras.map((c) => chaveLinha(c.data_compra, c.cartao_id, c.valor_total, c.descricao))
        )
        const historico = buildHistorico(compras)

        const enriquecidas = res.data
          .filter((r) => Object.values(r).some((v) => (v || '').toString().trim() !== ''))
          .map((r, i) => {
            const nomeCategoria = (r.categoria || '').trim()
            const catObj = categorias.find((c) => c.nome === nomeCategoria)
            const cartaoNome = (r.cartao || '').trim()
            const cartao = resolverCartao(cartaoNome)
            const parcelaAtual = (r.parcela_atual || '').trim()
            const parcelaTotal = (r.parcela_total || '').trim()
            const data = (r.data || '').trim()
            const descricao = (r.descricao || '').trim()
            const valor = (r.valor || '').trim()
            const normDescBase = normalizarDescricao(descricao)

            let categoria = catObj ? nomeCategoria : ''
            let subcategoria = ''
            let categoriaSugerida = false

            if (categoria) {
              const subHist = sugerirSubcategoria(historico, normDescBase, categoria, categorias)
              if (subHist) { subcategoria = subHist; categoriaSugerida = true }
              else subcategoria = catObj.subcategorias[0] || ''
            } else {
              const sugestao = sugerirCategoriaCompleta(historico, normDescBase, categorias)
              if (sugestao) { categoria = sugestao.categoria; subcategoria = sugestao.subcategoria; categoriaSugerida = true }
            }

            const atual = Number(parcelaAtual) || 1
            const total = Number(parcelaTotal) || 1
            let parcelaMatch = null
            if (atual > 1) {
              const encontrada = cartao
                ? buscarCompraParcelada(compras, normDescBase, cartao.id, total, Number(valor) || 0)
                : null
              parcelaMatch = encontrada ? 'encontrada' : 'nao_encontrada'
            }

            const chave = chaveLinha(data, cartao?.id, valor, descricao)
            const duplicataExistente = chavesExistentes.has(chave)

            return {
              _id: i,
              _chave: chave,
              data,
              descricao,
              valor,
              categoria,
              subcategoria,
              categoriaSugerida,
              parcela_atual: parcelaAtual,
              parcela_total: parcelaTotal,
              cartaoNome,
              cartao_id: cartao?.id || '',
              pessoa: cartao?.titular || PESSOAS[0],
              observacao: (r.observacao || '').trim(),
              incluir: !duplicataExistente && atual <= 1,
              duplicataExistente,
              duplicataCsv: false,
              parcelaMatch,
            }
          })

        const contagemCsv = new Map()
        enriquecidas.forEach((l) => contagemCsv.set(l._chave, (contagemCsv.get(l._chave) || 0) + 1))
        enriquecidas.forEach((l) => { l.duplicataCsv = contagemCsv.get(l._chave) > 1 })

        setLinhas(enriquecidas)
        setNomeArquivo(file.name)
      },
      error: (err) => setErroArquivo('Erro ao ler CSV: ' + err.message),
    })
  }

  function atualizarLinha(id, patch) {
    setLinhas((ls) => ls.map((l) => (l._id === id ? { ...l, ...patch } : l)))
  }

  function mudarCategoria(id, categoria) {
    const subs = categorias.find((c) => c.nome === categoria)?.subcategorias || []
    atualizarLinha(id, { categoria, subcategoria: subs[0] || '', categoriaSugerida: false })
  }

  function mudarSubcategoria(id, subcategoria) {
    atualizarLinha(id, { subcategoria, categoriaSugerida: false })
  }

  const selecionadas = linhas.filter((l) => l.incluir)
  const prontas = selecionadas.filter((l) => linhaValida(l, categorias))
  const comProblema = selecionadas.length - prontas.length

  const duplicatasExistentes = linhas.filter((l) => l.duplicataExistente).length
  const duplicatasCsv = linhas.filter((l) => l.duplicataCsv).length
  const linhasNovas = linhas.length - duplicatasExistentes

  const conferencia = useMemo(() => {
    const grupos = new Map()
    selecionadas.forEach((l) => {
      if (!l.cartao_id || !/^\d{4}-\d{2}-\d{2}$/.test(l.data) || l.valor === '' || isNaN(Number(l.valor))) return
      const cartao = cartoes.find((c) => c.id === l.cartao_id)
      if (!cartao) return
      const atual = Number(l.parcela_atual) || 1
      const mes = addMonths(calcMesInicio(l.data, cartao), atual - 1)
      const key = l.cartao_id + '|' + mes
      grupos.set(key, (grupos.get(key) || 0) + Number(l.valor))
    })
    return [...grupos.entries()]
      .map(([key, soma]) => {
        const [cartao_id, mes] = key.split('|')
        const cartao = cartoes.find((c) => c.id === cartao_id)
        const fatura = faturas.find((f) => f.cartao_id === cartao_id && f.mes === mes)
        return {
          cartao_id,
          mes,
          nome: cartao?.nome || '—',
          soma,
          valorReal: fatura ? Number(fatura.valor_real) : null,
          diff: fatura ? soma - Number(fatura.valor_real) : null,
        }
      })
      .sort((a, b) => (a.mes === b.mes ? a.nome.localeCompare(b.nome) : b.mes.localeCompare(a.mes)))
  }, [selecionadas, cartoes, faturas])

  async function confirmar() {
    if (prontas.length === 0) return
    setImportando(true)
    setResultado(null)
    const payload = prontas.map((l) => ({
      data_compra: l.data,
      descricao: l.descricao,
      categoria: l.categoria,
      subcategoria: l.subcategoria,
      pessoa: l.pessoa,
      cartao_id: l.cartao_id,
      valor_total: Number(l.valor),
      parcelas: Number(l.parcela_total) || 1,
      obs: l.observacao || undefined,
    }))
    try {
      await importarTransacoes(payload)
      setResultado({ ok: true, n: payload.length })
      setLinhas([])
      setNomeArquivo('')
    } catch (e) {
      setResultado({ ok: false, msg: e.message || 'Erro ao importar' })
    }
    setImportando(false)
  }

  return (
    <div className="page">
      <div className="alert alert-blue">
        Suba o CSV já padronizado (gerado fora do app, a partir do PDF da fatura). Confira e ajuste as linhas
        abaixo antes de confirmar — nada é gravado até você clicar em "Confirmar importação".
        Linhas de parcela em andamento (parcela atual maior que 1) e linhas já lançadas anteriormente vêm
        desmarcadas por padrão — marque manualmente só depois de conferir.
      </div>

      <div className="toolbar">
        <input type="file" accept=".csv" onChange={handleFile} />
        {nomeArquivo && <span className="badge badge-gray">{nomeArquivo}</span>}
        {linhas.length > 0 && (
          <button
            className="btn btn-primary"
            onClick={confirmar}
            disabled={prontas.length === 0 || importando}
            style={{ marginLeft: 'auto' }}
          >
            {importando ? 'Importando...' : `Confirmar importação (${prontas.length})`}
          </button>
        )}
      </div>

      {erroArquivo && <div className="alert alert-red">{erroArquivo}</div>}

      {resultado?.ok && (
        <div className="alert alert-green">✓ {resultado.n} transaç{resultado.n === 1 ? 'ão importada' : 'ões importadas'} com sucesso.</div>
      )}
      {resultado && !resultado.ok && (
        <div className="alert alert-red">Erro ao importar: {resultado.msg}</div>
      )}

      {linhas.length === 0 ? (
        <div className="empty">
          Nenhum arquivo carregado.{'\n'}Selecione o CSV da fatura para começar a revisão.
        </div>
      ) : (
        <>
          <div className="alert alert-blue">
            {linhasNovas} linha{linhasNovas === 1 ? '' : 's'} nova{linhasNovas === 1 ? '' : 's'}, {duplicatasExistentes} possíve{duplicatasExistentes === 1 ? 'l' : 'is'} duplicata{duplicatasExistentes === 1 ? '' : 's'}.
          </div>

          {duplicatasCsv > 0 && (
            <div className="alert alert-amber">
              ⚠ {duplicatasCsv} linha{duplicatasCsv > 1 ? 's têm' : ' tem'} a mesma data, descrição, valor e cartão que outra linha
              deste próprio arquivo. Pode ser compra legítima repetida — não foram removidas, confira antes de importar.
            </div>
          )}

          {comProblema > 0 && (
            <div className="alert alert-amber">
              ⚠ {comProblema} linha{comProblema > 1 ? 's marcadas' : ' marcada'} para importar {comProblema > 1 ? 'estão' : 'está'} com
              dados incompletos (categoria ou cartão não identificados) — corrija ou desmarque antes de confirmar.
            </div>
          )}

          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Importar</th>
                  <th>Data</th>
                  <th>Descrição</th>
                  <th style={{ textAlign: 'right' }}>Valor</th>
                  <th>Categoria</th>
                  <th>Subcategoria</th>
                  <th>Pessoa</th>
                  <th>Cartão</th>
                  <th style={{ textAlign: 'center' }}>Parcela</th>
                  <th>Observação</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const total = Number(l.parcela_total) || 1
                  const atual = Number(l.parcela_atual) || 1
                  return (
                    <tr key={l._id} style={{ opacity: l.incluir ? 1 : 0.5 }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={l.incluir}
                          onChange={(e) => atualizarLinha(l._id, { incluir: e.target.checked })}
                        />
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <input type="date" value={l.data} onChange={(e) => atualizarLinha(l._id, { data: e.target.value })} />
                      </td>
                      <td style={{ minWidth: 170 }}>
                        <input value={l.descricao} onChange={(e) => atualizarLinha(l._id, { descricao: e.target.value })} />
                        {l.duplicataExistente && (
                          <div style={{ marginTop: 3 }}>
                            <span className="badge badge-red">Já lançada</span>
                          </div>
                        )}
                        {l.duplicataCsv && (
                          <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>
                            ⚠ duplicada no próprio arquivo
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 100 }}>
                        <input
                          type="number" step="0.01"
                          value={l.valor}
                          onChange={(e) => atualizarLinha(l._id, { valor: e.target.value })}
                          style={{ textAlign: 'right' }}
                        />
                        {l.valor !== '' && Number(l.valor) < 0 && (
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>estorno/crédito</div>
                        )}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <select value={l.categoria} onChange={(e) => mudarCategoria(l._id, e.target.value)}>
                          <option value="">Selecione...</option>
                          {categorias.map((c) => <option key={c.id}>{c.nome}</option>)}
                        </select>
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <select
                          value={l.subcategoria}
                          disabled={!l.categoria}
                          onChange={(e) => mudarSubcategoria(l._id, e.target.value)}
                        >
                          {(categorias.find((c) => c.nome === l.categoria)?.subcategorias || []).map((s) => <option key={s}>{s}</option>)}
                        </select>
                        {l.categoriaSugerida && (
                          <div style={{ marginTop: 3 }}>
                            <span className="badge badge-blue" title="Sugerida com base em compras já lançadas com descrição parecida">
                              sugerida
                            </span>
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select value={l.pessoa} onChange={(e) => atualizarLinha(l._id, { pessoa: e.target.value })}>
                          {PESSOAS.map((p) => <option key={p}>{p}</option>)}
                        </select>
                      </td>
                      <td style={{ minWidth: 150 }}>
                        <select value={l.cartao_id} onChange={(e) => atualizarLinha(l._id, { cartao_id: e.target.value })}>
                          <option value="">Selecione...</option>
                          {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                        </select>
                        {!l.cartao_id && l.cartaoNome && (
                          <div style={{ fontSize: 10, color: 'var(--red)' }}>não encontrado: {l.cartaoNome}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', minWidth: 120 }}>
                        {total > 1 ? (
                          <span className="badge badge-amber">{atual}/{total}</span>
                        ) : (
                          <span className="badge badge-gray">à vista</span>
                        )}
                        {l.parcelaMatch === 'encontrada' && (
                          <div style={{ fontSize: 10, color: 'var(--green)', marginTop: 2 }}>
                            parcela {atual}/{total} de compra já lançada
                          </div>
                        )}
                        {l.parcelaMatch === 'nao_encontrada' && (
                          <div
                            style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}
                            title="Se marcar esta linha, ela será gravada como uma compra parcelada nova."
                          >
                            compra parcelada não encontrada
                          </div>
                        )}
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <input value={l.observacao} onChange={(e) => atualizarLinha(l._id, { observacao: e.target.value })} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>
            {linhas.length} linha{linhas.length > 1 ? 's' : ''} no arquivo · {selecionadas.length} marcada{selecionadas.length !== 1 ? 's' : ''} para importar
            {comProblema > 0 && ` · ${comProblema} com pendência`}
            {prontas.length > 0 && ` · ${fmt(prontas.reduce((s, l) => s + Number(l.valor), 0))} no total`}
          </div>

          {conferencia.length > 0 && (
            <>
              <div className="section-label">conferência com a fatura</div>
              <div className="card" style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Cartão</th>
                      <th>Mês</th>
                      <th style={{ textAlign: 'right' }}>Linhas selecionadas</th>
                      <th style={{ textAlign: 'right' }}>Fatura real</th>
                      <th style={{ textAlign: 'right' }}>Diferença</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conferencia.map((item) => {
                      const status = statusConferencia(item)
                      return (
                        <tr key={item.cartao_id + item.mes}>
                          <td style={{ fontWeight: 500 }}>{item.nome}</td>
                          <td>{mesLabel(item.mes)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(item.soma)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>
                            {item.valorReal === null ? '—' : fmt(item.valorReal)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>
                            {item.diff === null ? '—' : (item.diff > 0 ? '+' : '') + fmt(item.diff)}
                          </td>
                          <td><span className={`badge ${status.cls}`}>{status.label}</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                A conferência é só informativa — compara o que está marcado para importar com o valor real já lançado em
                "Faturas" (por cartão e mês). Ela não bloqueia a importação.
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
