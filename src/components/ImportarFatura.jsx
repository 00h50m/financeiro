import { useState } from 'react'
import Papa from 'papaparse'
import { fmt, mesLabel, calcMesInicio } from '../lib/utils'

const COLUNAS_ESPERADAS = ['data', 'descricao', 'valor', 'categoria', 'parcela_atual', 'parcela_total', 'cartao', 'observacao']
const TOLERANCIA_VALOR = 0.02

function normBasico(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Normalização mais agressiva, usada só para casar descrições com o histórico de compras
// (remove *, números e datas — ex: "*NETFLIX 03/09" e "NETFLIX 12/08" viram a mesma chave).
function normHistorico(s) {
  return normBasico(s)
    .replace(/\*/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function construirHistoricoCategorias(compras) {
  const contagem = {}
  compras.forEach((c) => {
    const chave = normHistorico(c.descricao)
    if (!chave || !c.categoria || !c.subcategoria) return
    if (!contagem[chave]) contagem[chave] = {}
    const catChave = `${c.categoria}|||${c.subcategoria}`
    contagem[chave][catChave] = (contagem[chave][catChave] || 0) + 1
  })
  const melhor = {}
  Object.entries(contagem).forEach(([chave, opcoes]) => {
    let bestKey = null
    let bestN = 0
    Object.entries(opcoes).forEach(([k, n]) => { if (n > bestN) { bestN = n; bestKey = k } })
    if (bestKey) {
      const [categoria, subcategoria] = bestKey.split('|||')
      melhor[chave] = { categoria, subcategoria }
    }
  })
  return melhor
}

function buscarDuplicataExistente(l, compras) {
  const descNorm = normBasico(l.descricao)
  const valorLinha = Number(l.valor)
  return compras.some((c) =>
    c.cartao_id === l.cartao_id &&
    (c.data_compra || '').slice(0, 10) === l.data &&
    normBasico(c.descricao) === descNorm &&
    Math.abs(Number(c.valor_total) - valorLinha) < TOLERANCIA_VALOR
  )
}

function buscarParcelaExistente(l, compras) {
  const total = Number(l.parcela_total) || 0
  if (!total || !l.cartao_id) return null
  const valorLinha = Number(l.valor)
  const descNorm = normBasico(l.descricao)
  return compras.find((c) => {
    if (Number(c.parcelas) !== total) return false
    if (c.cartao_id !== l.cartao_id) return false
    if (normBasico(c.descricao) !== descNorm) return false
    const valorParcelaExistente = Number(c.valor_total) / Number(c.parcelas)
    return Math.abs(valorParcelaExistente - valorLinha) < TOLERANCIA_VALOR
  }) || null
}

function marcarDuplicatasNoCsv(linhas) {
  const contagem = {}
  const chaveDe = (l) => `${l.data}|${normBasico(l.descricao)}|${Number(l.valor)}|${l.cartao_id || normBasico(l.cartaoNome)}`
  linhas.forEach((l) => {
    const k = chaveDe(l)
    contagem[k] = (contagem[k] || 0) + 1
  })
  return linhas.map((l) => ({ ...l, duplicataCsv: contagem[chaveDe(l)] > 1 }))
}

function linhaValida(l, categorias) {
  return !!l.data
    && !!l.descricao
    && l.valor !== '' && !isNaN(Number(l.valor))
    && !!l.categoria && categorias.some((c) => c.nome === l.categoria)
    && !!l.subcategoria
    && !!l.pessoa
    && !!l.cartao_id
}

export default function ImportarFatura({ store }) {
  const { cartoes, categorias, compras, faturas, pessoas, importarTransacoes } = store
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

        const historico = construirHistoricoCategorias(compras)

        let enriquecidas = res.data
          .filter((r) => Object.values(r).some((v) => (v || '').toString().trim() !== ''))
          .map((r, i) => {
            const nomeCategoriaCsv = (r.categoria || '').trim()
            const catCsvObj = categorias.find((c) => c.nome === nomeCategoriaCsv)
            const cartaoNome = (r.cartao || '').trim()
            const cartao = resolverCartao(cartaoNome)
            const parcelaAtual = (r.parcela_atual || '').trim()
            const parcelaTotal = (r.parcela_total || '').trim()
            const descricao = (r.descricao || '').trim()

            const sugestao = historico[normHistorico(descricao)] || null
            let categoria = ''
            let subcategoria = ''
            let sugerida = false

            if (catCsvObj) {
              categoria = nomeCategoriaCsv
              if (sugestao && sugestao.categoria === categoria && catCsvObj.subcategorias.includes(sugestao.subcategoria)) {
                subcategoria = sugestao.subcategoria
                sugerida = true
              } else {
                subcategoria = catCsvObj.subcategorias[0] || ''
              }
            } else if (sugestao) {
              const catHist = categorias.find((c) => c.nome === sugestao.categoria)
              if (catHist) {
                categoria = catHist.nome
                subcategoria = catHist.subcategorias.includes(sugestao.subcategoria) ? sugestao.subcategoria : (catHist.subcategorias[0] || '')
                sugerida = true
              }
            }

            const linha = {
              _id: i,
              data: (r.data || '').trim(),
              descricao,
              valor: (r.valor || '').trim(),
              categoria,
              subcategoria,
              sugerida,
              parcela_atual: parcelaAtual,
              parcela_total: parcelaTotal,
              cartaoNome,
              cartao_id: cartao?.id || '',
              pessoa: cartao?.titular || pessoas[0]?.nome || '',
              observacao: (r.observacao || '').trim(),
            }

            const duplicataExistente = buscarDuplicataExistente(linha, compras)
            const parcelaExistente = Number(parcelaAtual) > 1 ? buscarParcelaExistente(linha, compras) : null
            const parcelaEmAndamento = Number(parcelaAtual) > 1

            let incluir = !parcelaEmAndamento
            if (duplicataExistente) incluir = false

            return {
              ...linha,
              duplicataExistente,
              parcelaEmAndamento,
              parcelaEncontrada: parcelaEmAndamento ? !!parcelaExistente : null,
              incluir,
            }
          })

        enriquecidas = marcarDuplicatasNoCsv(enriquecidas)

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
    atualizarLinha(id, { categoria, subcategoria: subs[0] || '', sugerida: false })
  }

  const selecionadas = linhas.filter((l) => l.incluir)
  const prontas = selecionadas.filter((l) => linhaValida(l, categorias))
  const comProblema = selecionadas.length - prontas.length
  const duplicatasExistentesCount = linhas.filter((l) => l.duplicataExistente).length
  const duplicatasCsvCount = linhas.filter((l) => l.duplicataCsv).length
  const linhasNovas = linhas.length - duplicatasExistentesCount

  const conferencia = (() => {
    const grupos = {}
    linhas.filter((l) => l.incluir && l.cartao_id && l.data && l.valor !== '').forEach((l) => {
      const cartaoObj = cartoes.find((c) => c.id === l.cartao_id)
      const mes = cartaoObj ? calcMesInicio(l.data, cartaoObj) : l.data.slice(0, 7)
      const key = `${l.cartao_id}|${mes}`
      if (!grupos[key]) grupos[key] = { cartao_id: l.cartao_id, mes, soma: 0 }
      grupos[key].soma += Number(l.valor) || 0
    })
    return Object.values(grupos)
      .map((g) => {
        const cartaoObj = cartoes.find((c) => c.id === g.cartao_id)
        const fatura = faturas.find((f) => f.cartao_id === g.cartao_id && f.mes === g.mes)
        const valorReal = fatura ? Number(fatura.valor_real) : null
        const diff = valorReal != null ? valorReal - g.soma : null
        return { ...g, cartaoNome: cartaoObj?.nome || '—', valorReal, diff }
      })
      .sort((a, b) => (a.cartaoNome + a.mes).localeCompare(b.cartaoNome + b.mes))
  })()

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
        Linhas de parcela em andamento (parcela atual maior que 1) e possíveis duplicatas vêm desmarcadas por
        padrão — marque manualmente só se tiver certeza de que a linha deve ser lançada.
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
            {linhasNovas} linha{linhasNovas !== 1 ? 's novas' : ' nova'}, {duplicatasExistentesCount} {duplicatasExistentesCount !== 1 ? 'possíveis duplicatas' : 'possível duplicata'} (já lançada{duplicatasExistentesCount !== 1 ? 's' : ''} em Compras)
            {duplicatasCsvCount > 0 && ` · ${duplicatasCsvCount} linha${duplicatasCsvCount !== 1 ? 's' : ''} repetida${duplicatasCsvCount !== 1 ? 's' : ''} dentro do próprio arquivo`}
          </div>

          {conferencia.length > 0 && (
            <>
              <div className="section-label">conferência com a fatura</div>
              <div className="card">
                <table>
                  <thead>
                    <tr>
                      <th>Cartão</th>
                      <th>Mês</th>
                      <th style={{ textAlign: 'right' }}>Soma selecionada</th>
                      <th style={{ textAlign: 'right' }}>Fatura real</th>
                      <th style={{ textAlign: 'right' }}>Diferença</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conferencia.map((g) => {
                      const bateu = g.valorReal != null && Math.abs(g.diff) <= 0.05
                      const semFatura = g.valorReal == null
                      return (
                        <tr key={g.cartao_id + g.mes}>
                          <td><span className="badge badge-gray">{g.cartaoNome}</span></td>
                          <td style={{ fontFamily: 'DM Mono', fontSize: 12 }}>{mesLabel(g.mes)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(g.soma)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>
                            {semFatura ? '—' : fmt(g.valorReal)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: semFatura ? 'var(--text3)' : bateu ? 'var(--text3)' : g.diff > 0 ? 'var(--red)' : 'var(--amber)' }}>
                            {semFatura ? '—' : bateu ? '—' : (g.diff > 0 ? '+' : '') + fmt(g.diff)}
                          </td>
                          <td>
                            {semFatura ? (
                              <span className="badge badge-gray">fatura não cadastrada</span>
                            ) : bateu ? (
                              <span className="badge badge-green">✓ bate</span>
                            ) : g.diff > 0 ? (
                              <span className="badge badge-red">falta {fmt(g.diff)}</span>
                            ) : (
                              <span className="badge badge-amber">excede {fmt(Math.abs(g.diff))}</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </>
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
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {l.duplicataExistente && <span className="badge badge-amber">já lançada</span>}
                          {l.duplicataCsv && <span className="badge badge-gray">repetida no arquivo</span>}
                        </div>
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
                          onChange={(e) => atualizarLinha(l._id, { subcategoria: e.target.value, sugerida: false })}
                        >
                          {(categorias.find((c) => c.nome === l.categoria)?.subcategorias || []).map((s) => <option key={s}>{s}</option>)}
                        </select>
                        {l.sugerida && <div style={{ marginTop: 4 }}><span className="badge badge-blue">sugerida</span></div>}
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <select value={l.pessoa} onChange={(e) => atualizarLinha(l._id, { pessoa: e.target.value })}>
                          {pessoas.map((p) => <option key={p.id}>{p.nome}</option>)}
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
                      <td style={{ textAlign: 'center', minWidth: 110 }}>
                        {total > 1 ? (
                          <span className="badge badge-amber">{atual}/{total}</span>
                        ) : (
                          <span className="badge badge-gray">à vista</span>
                        )}
                        {l.parcelaEmAndamento && (
                          l.parcelaEncontrada ? (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge badge-green" style={{ fontSize: 10 }}>parcela de compra já lançada</span>
                            </div>
                          ) : (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge badge-red" style={{ fontSize: 10 }}>parcelamento não encontrado</span>
                              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>se marcar, vira compra nova</div>
                            </div>
                          )
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
