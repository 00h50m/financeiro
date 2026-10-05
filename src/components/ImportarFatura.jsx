import { normalizarData, normalizarValor } from '../lib/csvFormato'
import { useState } from 'react'
import Papa from 'papaparse'
import { fmt, mesLabel, calcMesInicio, addMonths, nowYM, gerarParcelas } from '../lib/utils'
import {
  round2, extrairParcela, limparDescricao, normBasico, normHistorico, normNome, construirHistoricoCategorias,
} from '../lib/normalizacao'
import { comprasComGruposSomados } from '../lib/divisaoCompra'

const COLUNAS_ESPERADAS = ['data', 'descricao', 'valor', 'categoria', 'parcela_atual', 'parcela_total', 'cartao', 'observacao']
const TOLERANCIA_VALOR = 0.02

// modo: 'parcela' = a coluna valor do CSV é o valor de UMA parcela (padrão de fatura de cartão);
//       'total'   = a coluna valor é o valor total da compra parcelada.
function valorParcelaLinha(l, modo) {
  const v = Number(l.valor)
  const n = Number(l.parcela_total) || 1
  return n > 1 && modo === 'total' ? v / n : v
}

function valorTotalLinha(l, modo) {
  const v = Number(l.valor)
  const n = Number(l.parcela_total) || 1
  return n > 1 && modo === 'parcela' ? round2(v * n) : v
}

function buscarDuplicataExistente(l, compras, modo) {
  const descNorm = normNome(l.descricao)
  const valorLinha = valorTotalLinha(l, modo)
  return compras.some((c) =>
    c.cartao_id === l.cartao_id &&
    (c.data_compra || '').slice(0, 10) === l.data &&
    normNome(c.descricao) === descNorm &&
    Math.abs(Number(c.valor_total) - valorLinha) < TOLERANCIA_VALOR
  )
}

function buscarParcelaExistente(l, compras, modo) {
  const total = Number(l.parcela_total) || 0
  if (!total || !l.cartao_id) return null
  const valorParcela = valorParcelaLinha(l, modo)
  const descNorm = normNome(l.descricao)
  return compras.find((c) => {
    if (Number(c.parcelas) !== total) return false
    if (c.cartao_id !== l.cartao_id) return false
    if (normNome(c.descricao) !== descNorm) return false
    const valorParcelaExistente = Number(c.valor_total) / Number(c.parcelas)
    return Math.abs(valorParcelaExistente - valorParcela) < TOLERANCIA_VALOR
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

// Reavalia os avisos (já lançada / parcelamento encontrado / repetida no arquivo)
// sem mexer no que a usuária já marcou ou editou.
function recalcular(linhas, comprasLancadas, modo) {
  // Compra dividida em categorias vale como UMA compra (soma das partes): a fatura traz a cobrança inteira.
  const compras = comprasComGruposSomados(comprasLancadas)
  const comFlags = linhas.map((l) => {
    const emAndamento = Number(l.parcela_atual) > 1
    const compraParcela = emAndamento ? buscarParcelaExistente(l, compras, modo) : null
    return {
      ...l,
      parcelaEmAndamento: emAndamento,
      duplicataExistente: buscarDuplicataExistente(l, compras, modo),
      parcelaEncontrada: emAndamento ? !!compraParcela : null,
      parcelaCompra: compraParcela,
    }
  })
  return marcarDuplicatasNoCsv(comFlags)
}

function linhaValida(l, categorias, mesFatura) {
  const atual = Number(l.parcela_atual) || 1
  const total = Number(l.parcela_total) || 1
  return !!normalizarData(l.data) && normalizarData(l.data) === l.data
    && atual >= 1 && atual <= total
    && !!l.descricao
    && l.valor !== '' && !isNaN(Number(l.valor))
    && !!l.categoria && categorias.some((c) => c.nome === l.categoria)
    && !!l.subcategoria
    && !!l.pessoa
    && !!l.cartao_id
    && (!(Number(l.parcela_atual) > 1) || !!mesFatura)
}

export default function ImportarFatura({ store }) {
  const { cartoes, categorias, compras, faturas, pessoas, importarTransacoes } = store
  const [linhas, setLinhas] = useState([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [modoValor, setModoValor] = useState('parcela')
  const [mesFatura, setMesFatura] = useState('')
  const [cartaoGlobal, setCartaoGlobal] = useState('')

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
    setCartaoGlobal('')

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

        // identificações já dadas a compras anteriores com o mesmo nome no cartão (compras vem da mais recente p/ mais antiga)
        const identificacoes = {}
        compras.forEach((c) => {
          const chave = normNome(c.descricao)
          if (c.identificacao && chave && !identificacoes[chave]) identificacoes[chave] = c.identificacao
        })

        const base = res.data
          .filter((r) => Object.values(r).some((v) => (v || '').toString().trim() !== ''))
          .map((r, i) => {
            const nomeCategoriaCsv = (r.categoria || '').trim()
            const catCsvObj = categorias.find((c) => c.nome === nomeCategoriaCsv)
            const cartaoNome = (r.cartao || '').trim()
            const cartao = resolverCartao(cartaoNome)
            const descricaoBruta = (r.descricao || '').trim()
            const noTexto = extrairParcela(descricaoBruta)
            const parcelaAtual = (r.parcela_atual || '').trim() || noTexto?.atual || ''
            const parcelaTotal = (r.parcela_total || '').trim() || noTexto?.total || ''
            const descricao = limparDescricao(descricaoBruta)

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

            return {
              _id: i,
              data: normalizarData(r.data) || (r.data || '').trim(),
              descricao,
              identificacao: identificacoes[normNome(descricao)] || '',
              valor: normalizarValor(r.valor),
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
          })

        // Mês da fatura: o mais comum entre as linhas que não são parcela em andamento
        const contarMeses = (incluirEmAndamento) => {
          const contagem = {}
          base.forEach((l) => {
            if (!l.cartao_id || !l.data) return
            if (!incluirEmAndamento && Number(l.parcela_atual) > 1) return
            const m = calcMesInicio(l.data, cartoes.find((c) => c.id === l.cartao_id))
            contagem[m] = (contagem[m] || 0) + 1
          })
          return Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]?.[0]
        }
        const inferido = contarMeses(false) || contarMeses(true) || nowYM()
        setMesFatura(inferido)

        const enriquecidas = recalcular(base, compras, modoValor).map((l) => ({
          ...l,
          incluir: !l.duplicataExistente && !(l.parcelaEmAndamento && l.parcelaEncontrada),
        }))

        setLinhas(enriquecidas)
        setNomeArquivo(file.name)
      },
      error: (err) => setErroArquivo('Erro ao ler CSV: ' + err.message),
    })
  }

  function atualizarLinha(id, patch) {
    const reavaliar = ['cartao_id', 'data', 'descricao', 'valor'].some((k) => k in patch)
    setLinhas((ls) => {
      const novo = ls.map((l) => (l._id === id ? { ...l, ...patch } : l))
      return reavaliar ? recalcular(novo, compras, modoValor) : novo
    })
  }

  function mudarCategoria(id, categoria) {
    const subs = categorias.find((c) => c.nome === categoria)?.subcategorias || []
    atualizarLinha(id, { categoria, subcategoria: subs[0] || '', sugerida: false })
  }

  function aplicarCartaoGlobal(id) {
    setCartaoGlobal(id)
    if (!id) return
    const cartao = cartoes.find((c) => c.id === id)
    setLinhas((ls) => recalcular(
      ls.map((l) => ({ ...l, cartao_id: id, pessoa: cartao?.titular || l.pessoa })),
      compras,
      modoValor,
    ))
  }

  function mudarModoValor(m) {
    setModoValor(m)
    setLinhas((ls) => recalcular(ls, compras, m))
  }

  const selecionadas = linhas.filter((l) => l.incluir)
  const prontas = selecionadas.filter((l) => linhaValida(l, categorias, mesFatura))
  const comProblema = selecionadas.length - prontas.length
  const duplicatasExistentesCount = linhas.filter((l) => l.duplicataExistente).length
  const duplicatasCsvCount = linhas.filter((l) => l.duplicataCsv).length
  const linhasNovas = linhas.length - duplicatasExistentesCount
  const parceladasEmAndamento = linhas.filter((l) => l.incluir && l.parcelaEmAndamento && !l.parcelaEncontrada).length

  const conferencia = (() => {
    const grupos = {}
    linhas.filter((l) => l.incluir && l.cartao_id && l.data && l.valor !== '').forEach((l) => {
      const cartaoObj = cartoes.find((c) => c.id === l.cartao_id)
      let mes
      if (l.parcelaEmAndamento) {
        if (!mesFatura) return
        mes = mesFatura
      } else {
        mes = cartaoObj ? calcMesInicio(l.data, cartaoObj) : l.data.slice(0, 7)
      }
      const key = `${l.cartao_id}|${mes}`
      if (!grupos[key]) grupos[key] = { cartao_id: l.cartao_id, mes, soma: 0 }
      grupos[key].soma += valorParcelaLinha(l, modoValor) || 0
    })
    return Object.values(grupos)
      .map((g) => {
        const cartaoObj = cartoes.find((c) => c.id === g.cartao_id)
        const fatura = faturas.find((f) => f.cartao_id === g.cartao_id && f.mes === g.mes)
        const valorReal = fatura && fatura.valor_real != null ? Number(fatura.valor_real) : null // fatura só marcada como paga não tem valor do banco
        const diff = valorReal != null ? valorReal - g.soma : null
        return { ...g, cartaoNome: cartaoObj?.nome || '—', valorReal, diff }
      })
      .sort((a, b) => (a.cartaoNome + a.mes).localeCompare(b.cartaoNome + b.mes))
  })()

  async function confirmar() {
    if (prontas.length === 0) return
    setImportando(true)
    setResultado(null)
    const payload = prontas.map((l) => {
      const n = Number(l.parcela_total) || 1
      const k = Number(l.parcela_atual) || 1
      // Parcela em andamento: a compra é registrada começando k-1 meses antes do mês da fatura,
      // então as parcelas já pagas ficam no passado e as demais (k..n) já caem nos meses certos.
      const dataCompra = k > 1 ? `${addMonths(mesFatura, -(k - 1))}-01` : l.data
      const nota = k > 1 ? `Parcela ${k}/${n} na importação (início estimado pela fatura de ${mesLabel(mesFatura)})` : ''
      return {
        data_compra: dataCompra,
        descricao: limparDescricao(l.descricao),
        ...(l.identificacao.trim() ? { identificacao: l.identificacao.trim() } : {}),
        categoria: l.categoria,
        subcategoria: l.subcategoria,
        pessoa: l.pessoa,
        cartao_id: l.cartao_id,
        valor_total: valorTotalLinha(l, modoValor),
        parcelas: n,
        obs: [l.observacao, nota].filter(Boolean).join(' · ') || undefined,
      }
    })
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
        Compras parceladas já em andamento (ex: parcela 3/10) entram com o parcelamento completo: as parcelas
        já pagas ficam no passado e as demais já são lançadas nos próximos meses daquele cartão. Possíveis
        duplicatas e parcelamentos que já existem em Compras vêm desmarcados.
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
          <div className="card" style={{ padding: 14 }}>
            <div className="form-row cols3" style={{ marginBottom: 8 }}>
              <div className="form-group">
                <label>Cartão desta fatura</label>
                <select value={cartaoGlobal} onChange={(e) => aplicarCartaoGlobal(e.target.value)}>
                  <option value="">Usar o cartão de cada linha</option>
                  {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Mês da fatura</label>
                <input type="month" value={mesFatura} onChange={(e) => setMesFatura(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Valor das parceladas no CSV</label>
                <select value={modoValor} onChange={(e) => mudarModoValor(e.target.value)}>
                  <option value="parcela">É o valor da parcela (padrão de fatura)</option>
                  <option value="total">É o valor total da compra</option>
                </select>
              </div>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
              "Cartão desta fatura" aplica o mesmo cartão a todas as linhas (e o titular dele como pessoa). O mês da
              fatura é usado para posicionar as parcelas em andamento no tempo certo.
              {parceladasEmAndamento > 0 && ` ${parceladasEmAndamento} parcelamento${parceladasEmAndamento > 1 ? 's' : ''} em andamento será${parceladasEmAndamento > 1 ? 'ão' : ''} lançado${parceladasEmAndamento > 1 ? 's' : ''} por inteiro.`}
            </div>
          </div>

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
              dados incompletos (categoria, cartão ou mês da fatura não identificados) — corrija ou desmarque antes de confirmar.
            </div>
          )}
          <div className="card" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'center' }}>Importar</th>
                  <th>Data</th>
                  <th>No cartão</th>
                  <th>Identificação</th>
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
                      <td style={{ minWidth: 150 }}>
                        <input
                          placeholder="o que é? (opcional)"
                          value={l.identificacao}
                          onChange={(e) => atualizarLinha(l._id, { identificacao: e.target.value })}
                        />
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
                        {total > 1 && l.valor !== '' && !isNaN(Number(l.valor)) && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                            {fmt(valorParcelaLinha(l, modoValor))}/mês · total {fmt(valorTotalLinha(l, modoValor))}
                          </div>
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
                      <td style={{ textAlign: 'center', minWidth: 130 }}>
                        {total > 1 ? (
                          <span className="badge badge-amber">{atual}/{total}</span>
                        ) : (
                          <span className="badge badge-gray">à vista</span>
                        )}
                        {l.parcelaEmAndamento && (
                          l.parcelaEncontrada ? (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge badge-green" style={{ fontSize: 10 }}>parcelamento já lançado</span>
                              {(() => {
                                if (!mesFatura || !l.parcelaCompra) return null
                                const esperada = gerarParcelas(l.parcelaCompra, cartoes).find((p) => p.mes === mesFatura)?.num
                                if (esperada === atual) return null
                                return (
                                  <div style={{ fontSize: 10, color: 'var(--amber)', marginTop: 2 }}>
                                    {esperada ? `⚠ no app, ${mesLabel(mesFatura)} seria a parcela ${esperada}/${total}` : `⚠ ${mesLabel(mesFatura)} fora do período previsto no app`}
                                  </div>
                                )
                              })()}
                              {l.parcelaCompra?.identificacao && (
                                <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{l.parcelaCompra.identificacao}</div>
                              )}
                            </div>
                          ) : (
                            <div style={{ marginTop: 4 }}>
                              <span className="badge badge-blue" style={{ fontSize: 10 }}>parcelamento novo</span>
                              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                                lança {atual} a {total} ({total - atual + 1} restantes)
                              </div>
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
            {prontas.length > 0 && ` · ${fmt(prontas.reduce((s, l) => s + valorParcelaLinha(l, modoValor), 0))} nesta fatura`}
          </div>
        </>
      )}
    </div>
  )
}
