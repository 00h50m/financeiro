import { useState } from 'react'
import Papa from 'papaparse'
import { CATEGORIAS, PESSOAS, fmt } from '../lib/utils'

const COLUNAS_ESPERADAS = ['data', 'descricao', 'valor', 'categoria', 'parcela_atual', 'parcela_total', 'cartao', 'observacao']

function linhaValida(l) {
  return !!l.data
    && !!l.descricao
    && l.valor !== '' && !isNaN(Number(l.valor))
    && !!l.categoria && !!CATEGORIAS[l.categoria]
    && !!l.subcategoria
    && !!l.pessoa
    && !!l.cartao_id
}

export default function ImportarFatura({ store }) {
  const { cartoes, importarTransacoes } = store
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

        const enriquecidas = res.data
          .filter((r) => Object.values(r).some((v) => (v || '').toString().trim() !== ''))
          .map((r, i) => {
            const categoria = CATEGORIAS[r.categoria?.trim()] ? r.categoria.trim() : ''
            const cartaoNome = (r.cartao || '').trim()
            const cartao = resolverCartao(cartaoNome)
            const parcelaAtual = (r.parcela_atual || '').trim()
            const parcelaTotal = (r.parcela_total || '').trim()
            return {
              _id: i,
              data: (r.data || '').trim(),
              descricao: (r.descricao || '').trim(),
              valor: (r.valor || '').trim(),
              categoria,
              subcategoria: categoria ? CATEGORIAS[categoria][0] : '',
              parcela_atual: parcelaAtual,
              parcela_total: parcelaTotal,
              cartaoNome,
              cartao_id: cartao?.id || '',
              pessoa: cartao?.titular || PESSOAS[0],
              observacao: (r.observacao || '').trim(),
              incluir: !parcelaAtual || Number(parcelaAtual) <= 1,
            }
          })

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
    atualizarLinha(id, { categoria, subcategoria: CATEGORIAS[categoria]?.[0] || '' })
  }

  const selecionadas = linhas.filter((l) => l.incluir)
  const prontas = selecionadas.filter(linhaValida)
  const comProblema = selecionadas.length - prontas.length

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
        Linhas de parcela em andamento (parcela atual maior que 1) vêm desmarcadas por padrão, para não duplicar
        um parcelamento já lançado — marque manualmente só se for a primeira vez que essa compra aparece no app.
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
                  const emAndamento = atual > 1
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
                      <td style={{ minWidth: 160 }}>
                        <input value={l.descricao} onChange={(e) => atualizarLinha(l._id, { descricao: e.target.value })} />
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
                          {Object.keys(CATEGORIAS).map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </td>
                      <td style={{ minWidth: 140 }}>
                        <select
                          value={l.subcategoria}
                          disabled={!l.categoria}
                          onChange={(e) => atualizarLinha(l._id, { subcategoria: e.target.value })}
                        >
                          {(CATEGORIAS[l.categoria] || []).map((s) => <option key={s}>{s}</option>)}
                        </select>
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
                      <td style={{ textAlign: 'center', minWidth: 90 }}>
                        {total > 1 ? (
                          <span className="badge badge-amber">{atual}/{total}</span>
                        ) : (
                          <span className="badge badge-gray">à vista</span>
                        )}
                        {emAndamento && (
                          <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>em andamento</div>
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
        </>
      )}
    </div>
  )
}
