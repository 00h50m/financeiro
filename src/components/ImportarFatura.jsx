import { normalizarData, normalizarValor } from '../lib/csvFormato'
import { useState, useEffect } from 'react'
import Papa from 'papaparse'
import { fmt, mesLabel, calcMesInicio, addMonths, nowYM, gerarParcelas, tituloCompra } from '../lib/utils'
import { extrairParcela, limparDescricao, normBasico } from '../lib/normalizacao'
import { chaveEstabelecimento, indexarAliases } from '../lib/estabelecimento'
import {
  analisarLinhas, prepararRegras, sugerirCategoriaLinha, sugerirNomeLinha, problemasDaLinha, resumirAnalise,
  resolverCartaoPorNome, valorParcelaLinha, valorTotalLinha, conferirFatura,
} from '../lib/importacao'
import EditarCompra from './EditarCompra'
import { rotuloOrigem } from '../lib/origem'
import { explicarErro } from '../lib/erros'

const COLUNAS_ESPERADAS = ['data', 'descricao', 'valor', 'categoria', 'parcela_atual', 'parcela_total', 'cartao', 'observacao']
const ROTULO_FONTE = { historico: 'pelo histórico', nome: 'pelo nome' }
const fmtData = (iso) => String(iso || '').slice(0, 10).split('-').reverse().join('/')

function marcarDuplicatasNoCsv(linhas) {
  const contagem = {}
  const chaveDe = (l) => `${l.data}|${normBasico(l.descricao)}|${Number(l.valor)}|${l.cartao_id || normBasico(l.cartaoNome)}`
  linhas.forEach((l) => {
    const k = chaveDe(l)
    contagem[k] = (contagem[k] || 0) + 1
  })
  return linhas.map((l) => ({ ...l, duplicataCsv: contagem[chaveDe(l)] > 1 }))
}

// Reavalia o que já está lançado (exata / parecida / parcelamento) e o que falta em cada linha,
// sem desfazer o que a pessoa marcou ou editou: linhas que ela mesma marcou/desmarcou mantêm a escolha.
function recalcular(linhas, compras, aliases, modo) {
  const achados = analisarLinhas(linhas, { compras, aliases }, modo)
  const comFlags = linhas.map((l, i) => {
    const { chave, correspondencia } = achados[i]
    const emAndamento = Number(l.parcela_atual) > 1
    const tipo = correspondencia?.tipo
    const jaLancada = tipo === 'exata' || tipo === 'parecida' || tipo === 'valor_diferente'
    const parcelamentoJa = tipo === 'parcelamento'
    return {
      ...l,
      chave,
      correspondencia,
      parcelaEmAndamento: emAndamento,
      duplicataExistente: jaLancada,
      parcelaEncontrada: emAndamento ? parcelamentoJa : null,
      parcelaCompra: parcelamentoJa ? correspondencia.compra : null,
      incluir: l.incluirManual ? l.incluir : !(jaLancada || parcelamentoJa),
    }
  })
  return marcarDuplicatasNoCsv(comFlags)
}


const fmtDia = (iso) => String(iso).slice(0, 10).split('-').reverse().slice(0, 2).join('/')

// "O que falta lançar?": compara o CSV com o que está lançado neste cartão e mês, nos dois sentidos.
function PainelConferencia({ conf, cartaoNome, faturaReal, onEditar, onMover, faturaMesOk }) {
  const [aberto, setAberto] = useState(true)
  const { totais, faltaLancar, sobrandoNoFinapp, valorDiferente, contaFixa, foraDoMes = [] } = conf
  const difAppBanco = faturaReal != null ? Math.round((conf.totalFinapp - faturaReal) * 100) / 100 : null
  const fechaComBanco = difAppBanco == null || Math.abs(difAppBanco) <= 0.1
  const bate = conf.bate && fechaComBanco
  const difCsvBanco = faturaReal != null ? Math.round((conf.totalCsv - faturaReal) * 100) / 100 : null
  const tabela = { width: '100%' }
  return (
    <div className="card" style={{ padding: 14, overflow: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 500 }}>
          O que falta lançar · {cartaoNome} · {mesLabel(conf.mes)}
          {bate ? <span className="badge badge-green" style={{ marginLeft: 8 }}>✓ tudo lançado</span> : <span className="badge badge-amber" style={{ marginLeft: 8 }}>há diferenças</span>}
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setAberto((a) => !a)}>{aberto ? 'Recolher' : 'Ver detalhes'}</button>
      </div>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '10px 0', fontSize: 13 }}>
        {faturaReal != null && <span>Banco (fatura real): <b className="mono">{fmt(faturaReal)}</b></span>}
        <span>Soma do CSV: <b className="mono">{fmt(conf.totalCsv)}</b></span>
        <span>Lançado no Finapp: <b className="mono">{fmt(conf.totalFinapp)}</b></span>
      </div>
      {difCsvBanco != null && Math.abs(difCsvBanco) > 0.05 && (
        <div className="alert alert-amber">
          O próprio CSV {difCsvBanco > 0 ? 'passa' : 'fica abaixo'} do valor do banco em <b>{fmt(Math.abs(difCsvBanco))}</b>: pode haver linha a mais ou a menos no CSV
          (ex.: IOF, juros de parcelamento, estorno ou compra de outro mês). Confira as linhas abaixo com o extrato do banco.
        </div>
      )}
      {conf.bate && !fechaComBanco && (
        <div className="alert alert-red">
          Atenção: as linhas parecem todas lançadas, mas o Finapp soma <b>{fmt(conf.totalFinapp)}</b> contra <b>{fmt(faturaReal)}</b> do banco
          ({difAppBanco > 0 ? 'passa' : 'falta'} <b>{fmt(Math.abs(difAppBanco))}</b>). Algo não está entrando nesta fatura — confira as datas, o cartão e o mês das compras.
        </div>
      )}
      {bate && <div className="alert alert-green" style={{ marginBottom: 0 }}>Tudo o que está no CSV já está lançado neste cartão e mês, e nada sobra no Finapp.</div>}
      {aberto && !bate && (
        <>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
            Para o Finapp ficar igual ao CSV: lançar <b>{fmt(totais.falta)}</b>
            {foraDoMes.length > 0 && <> · trazer para este mês (<b>{fmt(totais.fora)}</b>)</>}
            {valorDiferente.length > 0 && <> · corrigir valores (<b>{totais.valores > 0 ? '+' : ''}{fmt(totais.valores)}</b>)</>}
            {sobrandoNoFinapp.length > 0 && <> · rever o que sobra (<b>{fmt(totais.sobra)}</b>)</>}.
          </div>

          {faltaLancar.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 12 }}>falta lançar — está no CSV e não está em Compras ({faltaLancar.length})</div>
              <table style={tabela}>
                <tbody>
                  {faltaLancar.map(({ linha: l, valor }) => (
                    <tr key={l._id}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDia(l.data)}</td>
                      <td>{l.descricao}{Number(l.parcela_total) > 1 && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>{l.parcela_atual || 1}/{l.parcela_total}</span>}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Essas linhas ficam marcadas na lista abaixo; é só confirmar a importação.</div>
            </>
          )}

          {foraDoMes.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 12 }}>já lançada, mas em outra fatura — não conta neste mês ({foraDoMes.length})</div>
              <table style={tabela}>
                <tbody>
                  {foraDoMes.map((f) => (
                    <tr key={f.linha._id}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{fmtDia(f.linha.data)}</td>
                      <td>
                        {f.linha.descricao}
                        <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text3)' }}>
                          · está em {f.outroCartao && f.cartaoNome ? `${f.cartaoNome} · ` : ''}{mesLabel(f.mesDaCompra)} como "{tituloCompra(f.compra)}"
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(f.valor)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {!f.outroCartao && faturaMesOk && <button className="btn btn-primary btn-sm" onClick={() => onMover(f.compra, conf.mes)} style={{ marginRight: 6 }}>Colocar nesta fatura</button>}
                        <button className="btn btn-ghost btn-sm" onClick={() => onEditar(f.compra)}>Editar compra</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                A compra existe, mas cai em outra fatura (data depois do fechamento, cartão errado ou mês diferente).
                {faturaMesOk ? ' "Colocar nesta fatura" mantém a data e só escolhe em qual fatura ela entra.' : <> Para corrigir em um clique, rode <code>inbox/21_compras_fatura_mes.sql</code> no Supabase; por ora use "Editar compra" e acerte a data ou o cartão.</>}
              </div>
            </>
          )}

          {valorDiferente.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 12 }}>mesma compra, valor diferente ({valorDiferente.length})</div>
              <table style={tabela}>
                <thead><tr><th>Compra</th><th style={{ textAlign: 'right' }}>No CSV</th><th style={{ textAlign: 'right' }}>No Finapp</th><th style={{ textAlign: 'right' }}>Diferença</th><th /></tr></thead>
                <tbody>
                  {valorDiferente.map(({ linha: l, item, csv, app, diferenca }) => (
                    <tr key={l._id}>
                      <td>{l.descricao} <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {tituloCompra(item.compra)}</span></td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(csv)}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(app)}</td>
                      <td style={{ textAlign: 'right', color: diferenca > 0 ? 'var(--red)' : 'var(--amber)' }} className="mono">{diferenca > 0 ? '+' : ''}{fmt(diferenca)}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={() => onEditar(item.compra)}>Editar compra</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Essas linhas vêm desmarcadas na importação (já existe uma compra parecida). Corrija o valor da compra em vez de importar de novo.</div>
            </>
          )}

          {sobrandoNoFinapp.length > 0 && (
            <>
              <div className="section-label" style={{ marginTop: 12 }}>sobrando no Finapp — lançado neste cartão e mês, mas não está no CSV ({sobrandoNoFinapp.length})</div>
              <table style={tabela}>
                <tbody>
                  {sobrandoNoFinapp.map((x) => (
                    <tr key={x.compra?.id || x.fixo.id}>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{x.compra ? fmtDia(x.compra.data_compra) : ''}</td>
                      <td>
                        {x.compra ? tituloCompra(x.compra) : x.fixo.nome}
                        {x.fixo && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>conta fixa</span>}
                        {x.compra && rotuloOrigem(x.compra.origem) && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text3)' }}>{rotuloOrigem(x.compra.origem)}</span>}
                        {x.de > 1 && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>{x.parcela}/{x.de}</span>}
                      </td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(x.valor)}</td>
                      <td>{x.compra && <button className="btn btn-ghost btn-sm" onClick={() => onEditar(x.compra)}>Editar</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Pode ser compra lançada a mais, de outro mês, ou com nome muito diferente do que está no CSV.</div>
            </>
          )}

          {contaFixa.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
              Já cadastradas como conta fixa neste cartão (por isso não faltam): {contaFixa.map((c) => `${c.linha.descricao} → ${c.fixo.nome}`).join(' · ')}.
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default function ImportarFatura({ store }) {
  const { cartoes, categorias, compras, faturas, pessoas, regras = [], aliases = [], importarTransacoes, updateCompra } = store
  // Sem a coluna fatura_mes no banco (inbox/21 não rodou) a importação segue a regra do fechamento, como antes.
  const faturaMesOk = compras.some((c) => 'fatura_mes' in c)
  const [linhas, setLinhas] = useState([])
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [erroArquivo, setErroArquivo] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [modoValor, setModoValor] = useState('parcela')
  const [mesFatura, setMesFatura] = useState('')
  const [compraEditando, setCompraEditando] = useState(null)
  const [cartaoGlobal, setCartaoGlobal] = useState('')

  const reanalisar = (ls, m = modoValor) => recalcular(ls, compras, aliases, m)
  // Se uma compra for editada/lançada enquanto o arquivo está aberto, refaz a conferência com os dados novos.
  useEffect(() => { setLinhas((ls) => (ls.length ? recalcular(ls, compras, aliases, modoValor) : ls)) }, [compras])

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

        const indiceAliases = indexarAliases(aliases)
        const preparadas = prepararRegras({ regras, compras, aliases })

        const base = res.data
          .filter((r) => Object.values(r).some((v) => (v || '').toString().trim() !== ''))
          .map((r, i) => {
            const nomeCategoriaCsv = (r.categoria || '').trim()
            const catCsvObj = categorias.find((c) => c.nome === nomeCategoriaCsv)
            const cartaoNome = (r.cartao || '').trim()
            const cartao = resolverCartaoPorNome(cartaoNome, cartoes)
            const descricaoBruta = (r.descricao || '').trim()
            const noTexto = extrairParcela(descricaoBruta)
            const parcelaAtual = (r.parcela_atual || '').trim() || noTexto?.atual || ''
            const parcelaTotal = (r.parcela_total || '').trim() || noTexto?.total || ''
            const descricao = limparDescricao(descricaoBruta)

            const { chave } = chaveEstabelecimento(descricao, indiceAliases)
            const sugestao = sugerirCategoriaLinha(chave, { categorias, preparadas })
            let categoria = ''
            let subcategoria = ''
            let fonteSugestao = ''

            if (catCsvObj) {
              categoria = nomeCategoriaCsv
              if (sugestao && sugestao.categoria === categoria && catCsvObj.subcategorias.includes(sugestao.subcategoria)) {
                subcategoria = sugestao.subcategoria
                fonteSugestao = sugestao.fonte
              } else {
                subcategoria = catCsvObj.subcategorias[0] || ''
              }
            } else if (sugestao) {
              categoria = sugestao.categoria
              subcategoria = sugestao.subcategoria
              fonteSugestao = sugestao.fonte
            }

            // nome "de gente" sugerido para Identificação (o texto original da fatura continua em "No cartão")
            const nomeSug = sugerirNomeLinha(descricao, { compras, aliases })

            return {
              _id: i,
              data: normalizarData(r.data) || (r.data || '').trim(),
              descricao,
              descricaoOriginal: descricaoBruta,
              identificacao: nomeSug?.nome || '',
              identificacaoSugerida: !!nomeSug,
              valor: normalizarValor(r.valor),
              categoria,
              subcategoria,
              sugerida: !!fonteSugestao,
              fonteSugestao,
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

        const enriquecidas = reanalisar(base)

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
      return reavaliar ? reanalisar(novo) : novo
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
    setLinhas((ls) => reanalisar(ls.map((l) => ({ ...l, cartao_id: id, pessoa: cartao?.titular || l.pessoa }))))
  }

  function mudarModoValor(m) {
    setModoValor(m)
    setLinhas((ls) => reanalisar(ls, m))
  }

  const problemasDe = (l) => problemasDaLinha(l, categorias, mesFatura, { normalizarData })
  const selecionadas = linhas.filter((l) => l.incluir)
  const prontas = selecionadas.filter((l) => problemasDe(l).length === 0)
  const comProblema = selecionadas.length - prontas.length
  const resumo = resumirAnalise(linhas)
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
        // com a coluna fatura_mes, a linha entra na fatura do arquivo (mês escolhido), não na que o fechamento sugere
        mes = mesFatura && faturaMesOk && cartaoObj ? mesFatura : cartaoObj ? calcMesInicio(l.data, cartaoObj) : l.data.slice(0, 7)
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

  const conferenciasDetalhadas = mesFatura
    ? [...new Set(linhas.filter((l) => l.cartao_id && l.data).map((l) => l.cartao_id))].map((cartaoId) => ({
      conf: conferirFatura({ linhas, compras, cartoes, fixos: store.fixos, cartaoId, mes: mesFatura, aliases }, modoValor),
      cartao: cartoes.find((c) => c.id === cartaoId),
      fatura: faturas.find((f) => f.cartao_id === cartaoId && f.mes === mesFatura),
    }))
    : []

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
        origem: 'csv',
        descricao_original: l.descricaoOriginal || l.descricao,
        data_compra: dataCompra,
        descricao: limparDescricao(l.descricao),
        ...(l.identificacao.trim() ? { identificacao: l.identificacao.trim() } : {}),
        categoria: l.categoria,
        subcategoria: l.subcategoria,
        pessoa: l.pessoa,
        cartao_id: l.cartao_id,
        valor_total: valorTotalLinha(l, modoValor),
        parcelas: n,
        ...(faturaMesOk && mesFatura && k === 1 && cartoes.find((c) => c.id === l.cartao_id) && calcMesInicio(l.data, cartoes.find((c) => c.id === l.cartao_id)) !== mesFatura ? { fatura_mes: mesFatura } : {}),
        obs: [l.observacao, nota].filter(Boolean).join(' · ') || undefined,
      }
    })
    try {
      await importarTransacoes(payload)
      setResultado({ ok: true, n: payload.length })
      setLinhas([])
      setNomeArquivo('')
    } catch (e) {
      setResultado({ ok: false, msg: explicarErro(e, 'importar as compras') })
    }
    setImportando(false)
  }

  return (
    <div className="page">
      {compraEditando && <EditarCompra store={store} compra={compraEditando} onClose={() => setCompraEditando(null)} />}
      <div className="alert alert-blue">
        Suba o CSV já padronizado (gerado fora do app, a partir do PDF da fatura). Confira e ajuste as linhas
        abaixo antes de confirmar — nada é gravado até você clicar em "Confirmar importação".
        Compras parceladas já em andamento (ex: parcela 3/10) entram com o parcelamento completo: as parcelas
        já pagas ficam no passado e as demais já são lançadas nos próximos meses daquele cartão. O app
        reconhece o que já está em Compras (mesmo as que você lançou à mão, pelo Telegram ou por notificação, mesmo
        com nome ou data um pouco diferentes) e deixa essas linhas desmarcadas.
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
        <div className="alert alert-red" style={{ whiteSpace: "pre-line" }}>{resultado.msg}</div>
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

          {resumo.pareceJaImportado ? (
            <div className="alert alert-amber">
              <b>⚠ Este arquivo parece já ter sido importado:</b> {resumo.jaLancadas} de {resumo.total} linhas já estão em Compras.
              {resumo.novas === 0
                ? ' Não há nada novo para importar. Se alguma linha for mesmo outra compra, marque-a manualmente.'
                : ` Elas vieram desmarcadas: importar agora lançaria só as ${resumo.novas} restante${resumo.novas !== 1 ? 's' : ''}.`}
            </div>
          ) : (
            <div className="alert alert-blue">
              {resumo.novas} linha{resumo.novas !== 1 ? 's novas' : ' nova'}
              {resumo.jaLancadas > 0 && ` · ${resumo.jaLancadas} já lançada${resumo.jaLancadas !== 1 ? 's' : ''} em Compras (desmarcada${resumo.jaLancadas !== 1 ? 's' : ''})`}
              {resumo.parecidas > 0 && ` · ${resumo.parecidas} só parecida${resumo.parecidas !== 1 ? 's' : ''} — confira`}
              {resumo.valoresDiferentes > 0 && ` · ${resumo.valoresDiferentes} com valor diferente do lançado — veja em "O que falta lançar"`}
              {resumo.repetidasNoArquivo > 0 && ` · ${resumo.repetidasNoArquivo} linha${resumo.repetidasNoArquivo !== 1 ? 's' : ''} repetida${resumo.repetidasNoArquivo !== 1 ? 's' : ''} dentro do próprio arquivo`}
            </div>
          )}

          {conferenciasDetalhadas.map(({ conf, cartao, fatura }) => (
            <PainelConferencia
              key={conf.cartaoId}
              conf={conf}
              cartaoNome={cartao?.nome || '—'}
              faturaReal={fatura && fatura.valor_real != null ? Number(fatura.valor_real) : null}
              onEditar={setCompraEditando}
              faturaMesOk={faturaMesOk}
              onMover={(compra, mes) => updateCompra(compra.id, { fatura_mes: mes })}
            />
          ))}

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
                  const problemas = l.incluir ? problemasDe(l) : []
                  const c = l.correspondencia?.compra
                  return (
                    <tr key={l._id} style={{ opacity: l.incluir ? 1 : 0.5, background: problemas.length ? 'rgba(239, 68, 68, 0.06)' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={l.incluir}
                          onChange={(e) => atualizarLinha(l._id, { incluir: e.target.checked, incluirManual: true })}
                        />
                      </td>
                      <td style={{ minWidth: 130 }}>
                        <input type="date" value={l.data} onChange={(e) => atualizarLinha(l._id, { data: e.target.value })} />
                      </td>
                      <td style={{ minWidth: 230 }}>
                        <input value={l.descricao} onChange={(e) => atualizarLinha(l._id, { descricao: e.target.value })} />
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                          {l.correspondencia?.tipo === 'exata' && <span className="badge badge-amber">já lançada</span>}
                          {l.correspondencia?.tipo === 'parecida' && <span className="badge badge-amber" title="Mesmo valor e cartão, com nome ou data um pouco diferentes">parece já lançada</span>}
                          {l.correspondencia?.tipo === 'valor_diferente' && <span className="badge badge-red" title="Parece a mesma compra, mas o valor lançado é diferente. Corrija a compra em vez de importar de novo.">valor diferente do lançado</span>}
                          {l.duplicataCsv && <span className="badge badge-gray" title="Há outra linha igual neste arquivo (pode ser uma compra repetida de verdade)">repetida no arquivo</span>}
                        </div>
                        {c && (
                          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3, lineHeight: 1.4 }}>
                            {l.correspondencia.tipo === 'parcelamento' ? 'parcelamento em Compras' : 'em Compras'}: {tituloCompra(c)} · {fmtData(c.data_compra)} · {fmt(c.valor_total)}
                            {Number(c.parcelas) > 1 ? ` (${c.parcelas}x)` : ''}{rotuloOrigem(c.origem) ? ` · ${rotuloOrigem(c.origem)}` : ''}
                          </div>
                        )}
                        {problemas.length > 0 && (
                          <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 3 }}>⚠ {problemas.join(' · ')}</div>
                        )}
                      </td>
                      <td style={{ minWidth: 150 }}>
                        <input
                          placeholder="o que é? (opcional)"
                          value={l.identificacao}
                          onChange={(e) => atualizarLinha(l._id, { identificacao: e.target.value, identificacaoSugerida: false })}
                        />
                        {l.identificacaoSugerida && l.identificacao && (
                          <div style={{ marginTop: 4 }}><span className="badge badge-blue" style={{ fontSize: 10 }} title="Nome sugerido a partir do que você já usou ou de marcas conhecidas. Pode apagar ou trocar.">nome sugerido</span></div>
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
                        {l.sugerida && <div style={{ marginTop: 4 }}><span className="badge badge-blue">sugerida {ROTULO_FONTE[l.fonteSugestao] || ''}</span></div>}
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
