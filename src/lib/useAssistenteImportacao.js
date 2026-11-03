// Estado e ações do assistente de importação de fatura (4 etapas). A tela só mostra; as regras estão em leituraFatura, conciliacaoFatura,
// planoImportacao e importacaoLote. Nada é gravado até a confirmação; o rascunho (decisões) é salvo no lote para retomar depois.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { sb } from './supabase'
import { lerFaturaPdf } from './automacoes'
import { explicarErro } from './erros'
import { analisarFatura, decisaoPatch } from './conciliacaoFatura'
import { COLUNAS_ESPERADAS, prepararLinhas, reanalisar } from './leituraFatura'
import { montarPlano } from './planoImportacao'
import { chaveDoArquivo, novoIdImportacao, salvarRascunho, descartarRascunho, listarRascunhos, listarImportadas, registrosDoLote, textoResultado } from './importacaoLote'
import { nowYM, addMonths } from './utils'
import { indexarAliases } from './estabelecimento'
import { recorrenciasAntesDaFatura, recorrenciaDaLinha, contaFixaDaLinha } from './recorrenciaImportacao'

const MAX_PDF = 3 * 1024 * 1024
const CAMPOS_DE_TRABALHO = ['_id', 'data', 'descricao', 'descricaoOriginal', 'identificacao', 'identificacaoSugerida', 'valor', 'categoria', 'subcategoria', 'sugerida', 'fonteSugestao', 'parcela_atual', 'parcela_total', 'cartaoNome', 'cartao_id', 'pessoa', 'pessoaManual', 'observacao', 'incluir', 'incluirManual', 'decisao', 'parcelamentoConfirmado', 'parcelamentoOpcao', 'naturezaManual', 'manual']
const enxuta = (l) => Object.fromEntries(CAMPOS_DE_TRABALHO.filter((k) => l[k] !== undefined).map((k) => [k, l[k]]))
const maisComum = (xs) => { const c = {}; xs.filter(Boolean).forEach((x) => { c[x] = (c[x] || 0) + 1 }); return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || '' }

// `inicial` (para testes e pré-visualização): { registros, nome, origem, totalBanco, etapa } carrega o arquivo já na primeira renderização.
export function useAssistenteImportacao(store, inicial = null) {
  const { cartoes, categorias, compras, pessoas, fixos = [], regras = [], aliases = [], importarFatura, conciliarFatura, addFixo, fixosValoresOk } = store
  const faturaMesOk = compras.some((c) => 'fatura_mes' in c)

  const pre = useRef(null)
  if (inicial?.registros && !pre.current) {
    const { base, mesInferido } = prepararLinhas(inicial.registros, { categorias, cartoes, pessoas, aliases, regras, compras })
    const cartao = maisComum(base.map((l) => l.cartao_id)) || (cartoes.length === 1 ? cartoes[0].id : '')
    const comCartao = cartao ? base.map((l) => ({ ...l, cartao_id: cartao })) : base
    pre.current = { cartao, mes: inicial.mesFatura || mesInferido, linhas: reanalisar(comCartao, compras, aliases, 'parcela', { cartoes, mesFatura: inicial.mesFatura || mesInferido }) }
  }
  const [etapa, setEtapa] = useState(inicial?.etapa || 1)
  const [maxEtapa, setMaxEtapa] = useState(inicial?.etapa || 1)
  const [arquivo, setArquivo] = useState(pre.current ? { nome: inicial.nome || 'fatura.csv', origem: inicial.origem || 'csv', chave: 'teste-teste-teste-teste', totalBanco: inicial.totalBanco ?? null, descartadas: inicial.descartadas || 0 } : null) // { nome, origem, totalBanco, descartadas, chave }
  const [linhas, setLinhas] = useState(pre.current?.linhas || [])
  const [cartaoId, setCartaoId] = useState(pre.current?.cartao || '')
  const [mesFatura, setMesFatura] = useState(pre.current?.mes || '')
  const [modoValor, setModoValor] = useState('parcela')
  const [importacaoId, setImportacaoId] = useState(pre.current ? '00000000-0000-4000-8000-000000000000' : null)
  const [lendo, setLendo] = useState(null) // texto do que está acontecendo
  const [erro, setErro] = useState('')
  const [confirmando, setConfirmando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const [rascunhos, setRascunhos] = useState([])
  const [bancoV2, setBancoV2] = useState(null) // null = ainda não sei; false = banco sem a atualização 38 (sem rascunho, sem atualizar/mover)
  const [salvoEm, setSalvoEm] = useState(null)
  const [importadas, setImportadas] = useState([])
  const [fixosMarcados, setFixosMarcados] = useState(() => new Set()) // linhas que o usuário quer cadastrar também como conta fixa (depois de importar)
  const [conciliando, setConciliando] = useState(null) // lote já importado que está sendo reconferido: { id, operacaoId, status }

  const ctxAnalise = useCallback((ls, m = modoValor, mes = mesFatura) => reanalisar(ls, compras, aliases, m, { cartoes, mesFatura: mes }), [compras, aliases, cartoes, modoValor, mesFatura])

  // rascunhos pendentes ao abrir a tela
  useEffect(() => { listarRascunhos(sb).then(setRascunhos).catch(() => setRascunhos([])); listarImportadas(sb).then(setImportadas).catch(() => setImportadas([])) }, [])
  // se uma compra mudar enquanto a tela está aberta, refaz a conferência com os dados novos (as decisões ficam)
  useEffect(() => { setLinhas((ls) => (ls.length ? reanalisar(ls, compras, aliases, modoValor, { cartoes, mesFatura }) : ls)) }, [compras, mesFatura])

  const irPara = useCallback((n) => { setEtapa(n); setMaxEtapa((m) => Math.max(m, n)) }, [])

  function aplicarCartao(ls, id) {
    const c = cartoes.find((x) => x.id === id)
    return ls.map((l) => ({ ...l, cartao_id: id, pessoa: l.pessoaManual ? l.pessoa : c?.titular || l.pessoa }))
  }

  async function carregar(registros, nome, origem, extra = {}) {
    setLendo('Identificando lançamentos…')
    const { base, mesInferido } = prepararLinhas(registros, { categorias, cartoes, pessoas, aliases, regras, compras })
    if (!base.length) { setErro('Não encontrei lançamentos nesse arquivo.'); setLendo(null); return }
    const detectado = maisComum(base.map((l) => l.cartao_id))
    const cartoesNoArquivo = new Set(base.map((l) => l.cartao_id).filter(Boolean)).size
    const cartao = detectado || (cartoes.length === 1 ? cartoes[0].id : '')
    setLendo('Verificando compras existentes…')
    const chave = await chaveDoArquivo({ cartaoId: '', mes: '', linhas: base })
    const comCartao = cartao ? aplicarCartao(base, cartao) : base
    setArquivo({ nome, origem, chave, totalBanco: extra.totalBanco ?? null, descartadas: extra.descartadas || 0, cartoesNoArquivo })
    setCartaoId(cartao)
    setMesFatura(mesInferido)
    setModoValor('parcela')
    setLinhas(reanalisar(comCartao, compras, aliases, 'parcela', { cartoes, mesFatura: mesInferido }))
    setImportacaoId(novoIdImportacao())
    setResultado(null)
    setEtapa(1); setMaxEtapa(1)
    setLendo(null)
  }

  function limpar() {
    setArquivo(null); setLinhas([]); setCartaoId(''); setMesFatura(nowYM()); setModoValor('parcela'); setImportacaoId(null)
    setErro(''); setResultado(null); setEtapa(1); setMaxEtapa(1); setSalvoEm(null); setLendo(null); setConciliando(null); setFixosMarcados(new Set())
  }

  function abrirCsv(file) {
    if (!file) return
    limpar(); setLendo('Lendo arquivo…')
    Papa.parse(file, {
      header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
      complete: (res) => {
        const faltando = COLUNAS_ESPERADAS.filter((c) => !res.meta.fields?.includes(c))
        if (faltando.length) { setErro(`Esse CSV não está no formato esperado: faltam as colunas ${faltando.join(', ')}.`); setLendo(null); return }
        carregar(res.data, file.name, 'csv').catch((e) => { setErro(e.message); setLendo(null) })
      },
      error: () => { setErro('Não consegui abrir esse arquivo. Confira se é um CSV.'); setLendo(null) },
    })
  }

  async function abrirPdf(file) {
    if (!file) return
    limpar()
    if (file.size > MAX_PDF) { setErro('PDF grande demais (limite de uns 3 MB). Tente um PDF menor ou use o CSV.'); return }
    setLendo('Lendo arquivo…')
    try {
      const base64 = await new Promise((ok, falha) => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1] || ''); fr.onerror = () => falha(new Error('Não consegui abrir o arquivo.')); fr.readAsDataURL(file) })
      setLendo('Lendo a fatura com IA… isso leva alguns segundos.')
      const r = await lerFaturaPdf(base64)
      if (!r.ok) { setErro(r.erro); setLendo(null); return }
      await carregar(r.linhas.map((l) => ({ ...l, cartao: r.cartao || '' })), file.name, 'pdf', { totalBanco: r.totalFatura, descartadas: r.descartadas })
    } catch (e) {
      setErro(e.message || 'Não consegui ler esse PDF.'); setLendo(null)
    }
  }

  const definirCartao = (id) => { setCartaoId(id); if (id) setLinhas((ls) => ctxAnalise(aplicarCartao(ls, id))) }
  const definirMes = (m) => { setMesFatura(m); setLinhas((ls) => ctxAnalise(ls, modoValor, m)) }
  const definirModo = (m) => { setModoValor(m); setLinhas((ls) => ctxAnalise(ls, m)) }
  const definirTotalBanco = (v) => setArquivo((a) => (a ? { ...a, totalBanco: v } : a))

  function atualizarLinha(id, patch) {
    const reavaliar = ['cartao_id', 'data', 'descricao', 'valor', 'decisao', 'naturezaManual'].some((k) => k in patch)
    if ('pessoa' in patch) patch = { ...patch, pessoaManual: true }
    setLinhas((ls) => {
      const novo = ls.map((l) => (l._id === id ? { ...l, ...patch } : l))
      return reavaliar ? ctxAnalise(novo) : novo
    })
  }
  const decidir = (id, decisao) => atualizarLinha(id, decisaoPatch(decisao))
  // Lançamento que a leitura perdeu: entra como uma linha nova do arquivo (marcada como adicionada à mão).
  function adicionarLinha({ data, descricao, valor, categoria, subcategoria, pessoa }) {
    const c = cartoes.find((x) => x.id === cartaoId)
    setLinhas((ls) => {
      const id = ls.reduce((m, l) => Math.max(m, Number(l._id) || 0), 0) + 1
      const nova = { _id: id, data, descricao, descricaoOriginal: descricao, identificacao: '', identificacaoSugerida: false, valor, categoria, subcategoria, sugerida: false, fonteSugestao: '', parcela_atual: '', parcela_total: '', cartaoNome: c?.nome || '', cartao_id: cartaoId, pessoa: pessoa || c?.titular || '', pessoaManual: true, observacao: 'Adicionada à mão na importação', manual: true }
      return ctxAnalise([...ls, nova])
    })
  }
  // opcao: 'completo' | 'so_esta' | null (desfaz)
  const escolherParcelamento = (id, opcao) => atualizarLinha(id, { parcelamentoOpcao: opcao || undefined, parcelamentoConfirmado: false })
  // Troca de categoria: a subcategoria fica em branco para a pessoa escolher (a linha continua em revisão até lá).
  // Só preenche sozinha quando a categoria tem uma única subcategoria.
  const mudarCategoria = (id, categoria) => {
    const subs = categorias.find((c) => c.nome === categoria)?.subcategorias || []
    atualizarLinha(id, { categoria, subcategoria: subs.length === 1 ? subs[0] : '', sugerida: false })
  }

  // ---- cobranças recorrentes (assinaturas): a linha pode virar conta fixa depois da importação ----
  const indiceAliases = useMemo(() => indexarAliases(aliases), [aliases])
  const recorrencias = useMemo(() => {
    let ignoradas = []
    try { ignoradas = JSON.parse(localStorage.getItem('recorrencias_ignoradas') || '[]') } catch { /* sem armazenamento */ }
    return recorrenciasAntesDaFatura({ compras, fixos, mesFatura, aliases: indiceAliases, ignoradas })
  }, [compras, fixos, mesFatura, indiceAliases])
  const recorrenciaDe = useCallback((l) => (l.grupo === 'nova' ? recorrenciaDaLinha(l, recorrencias, indiceAliases) : null), [recorrencias, indiceAliases])
  const alternarFixo = (id) => setFixosMarcados((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const colunaVariavelOk = !!fixosValoresOk && (fixos.length === 0 || 'variavel' in fixos[0])
  const colunaCartaoOk = fixos.length === 0 || 'cartao_id' in fixos[0]

  // ---- análise e plano (calculados na hora, a cada decisão) ----
  const analise = useMemo(() => {
    if (!linhas.length || !cartaoId || !mesFatura) return null
    return analisarFatura({ linhas, compras, cartoes, fixos, cartaoId, mes: mesFatura, aliases, modo: modoValor, categorias, totalBanco: arquivo?.totalBanco ?? null })
  }, [linhas, compras, cartoes, fixos, cartaoId, mesFatura, aliases, modoValor, categorias, arquivo?.totalBanco])

  const plano = useMemo(() => (analise ? montarPlano({ analise, mesFatura, cartoes, faturaMesOk, modoValor, cartaoId, arquivo: arquivo || {}, linhasDoArquivo: linhas, fechamentos: store.fechamentos || [] }) : null), [analise, mesFatura, cartoes, faturaMesOk, modoValor, cartaoId, arquivo, linhas, store.fechamentos])

  // contas fixas que serão cadastradas depois da importação (só de linhas novas, selecionadas e marcadas)
  const fixosAPlanejar = useMemo(() => (analise?.linhas || []).filter((l) => l.grupo === 'nova' && l.selecionada && fixosMarcados.has(l._id)).map((l) => {
    const rec = recorrenciaDaLinha(l, recorrencias, indiceAliases)
    return rec ? { id: l._id, nome: rec.nome, valor: Number(l.valor), variavel: !rec.valorFixo, inicio: addMonths(mesFatura, 1), linha: l, rec } : null
  }).filter(Boolean), [analise, fixosMarcados, recorrencias, indiceAliases, mesFatura])

  // ---- rascunho: salva as decisões no lote (sem gravar compras) ----
  const planoRef = useRef(plano)
  planoRef.current = plano
  useEffect(() => {
    if (!importacaoId || !arquivo || !linhas.length || resultado || bancoV2 === false || conciliando) return undefined
    const t = setTimeout(async () => {
      try {
        const r = await salvarRascunho(sb, {
          importacaoId, usuario: null,
          dados: { cartao_id: cartaoId || null, mes: mesFatura || nowYM(), arquivo_nome: arquivo.nome, origem_leitura: arquivo.origem, chave: arquivo.chave, total_banco: arquivo.totalBanco, total_extraido: planoRef.current?.dados.total_extraido ?? null,
            linhas: planoRef.current?.dados.linhas || [], decisoes: { versao: 1, etapa, config: { modoValor, mesFatura, cartaoId, totalBanco: arquivo.totalBanco, descartadas: arquivo.descartadas }, linhas: linhas.map(enxuta) } },
        })
        if (r.indisponivel) setBancoV2(false)
        else { setBancoV2(true); if (r.ok) setSalvoEm(new Date()) }
      } catch { /* rascunho é conveniência: nunca atrapalha */ }
    }, 1500)
    return () => clearTimeout(t)
  }, [linhas, cartaoId, mesFatura, modoValor, etapa, importacaoId, arquivo, resultado, bancoV2, conciliando])

  async function retomar(r) {
    const cfg = r.decisoes?.config || {}
    const lsSalvas = r.decisoes?.linhas || []
    if (!lsSalvas.length) return
    limpar()
    setArquivo({ nome: r.arquivo_nome || 'arquivo', origem: r.origem_leitura, chave: '', totalBanco: cfg.totalBanco ?? r.total_banco ?? null, descartadas: cfg.descartadas || 0 })
    setCartaoId(cfg.cartaoId || r.cartao_id || '')
    setMesFatura(cfg.mesFatura || r.mes)
    setModoValor(cfg.modoValor || 'parcela')
    setImportacaoId(r.id)
    const chave = await chaveDoArquivo({ cartaoId: '', mes: '', linhas: lsSalvas })
    setArquivo((a) => ({ ...a, chave }))
    setLinhas(reanalisar(lsSalvas, compras, aliases, cfg.modoValor || 'parcela', { cartoes, mesFatura: cfg.mesFatura || r.mes }))
    setEtapa(r.decisoes?.etapa || 2); setMaxEtapa(4)
    setBancoV2(true)
  }

  // Reabre uma fatura já importada: lê de novo as linhas guardadas no lote e compara com o que há no app agora.
  async function reconferir(lote) {
    const registros = registrosDoLote(lote)
    if (!registros.length) { setErro('Esta importação não guardou as linhas do arquivo (ela é anterior à atualização 37). Importe o arquivo de novo para conferir.'); return }
    limpar(); setLendo('Comparando com o que está no app agora…')
    const { base } = prepararLinhas(registros, { categorias, cartoes, pessoas, aliases, regras, compras })
    const comCartao = lote.cartao_id ? aplicarCartao(base.map((l) => ({ ...l, cartao_id: lote.cartao_id })), lote.cartao_id) : base
    setArquivo({ nome: lote.arquivo_nome || 'arquivo', origem: lote.origem_leitura, chave: '', totalBanco: lote.total_banco ?? null, descartadas: 0 })
    setCartaoId(lote.cartao_id || ''); setMesFatura(lote.mes); setModoValor('parcela')
    setImportacaoId(lote.id)
    setConciliando({ id: lote.id, operacaoId: novoIdImportacao(), status: lote.status_conciliacao })
    setLinhas(reanalisar(comCartao, compras, aliases, 'parcela', { cartoes, mesFatura: lote.mes }))
    setEtapa(3); setMaxEtapa(4); setLendo(null)
  }

  async function descartar(id = importacaoId) {
    try { await descartarRascunho(sb, id) } catch { /* sem rascunho: nada a descartar */ }
    setRascunhos((rs) => rs.filter((x) => x.id !== id))
    if (id === importacaoId) limpar()
  }

  async function confirmar() {
    if (!plano || (!plano.previa.temAlgoParaGravar && !conciliando) || confirmando) return
    setConfirmando(true); setErro('')
    try {
      let r
      if (conciliando) {
        const { cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas: _l, ...resto } = plano.dados // eslint-disable-line no-unused-vars
        r = await conciliarFatura({ importacaoId, operacaoId: conciliando.operacaoId, dados: resto })
        listarImportadas(sb).then(setImportadas).catch(() => {})
      } else {
        r = await importarFatura({ importacaoId, dados: plano.dados })
        // contas fixas pedidas pelo usuário: só depois de a importação terminar (a cobrança desta fatura já entrou como compra normal)
        if (!r.repetida && fixosAPlanejar.length && typeof addFixo === 'function') {
          let criadas = 0
          let falharam = 0
          for (const f of fixosAPlanejar) {
            try { (await addFixo(contaFixaDaLinha(f.linha, f.rec, mesFatura, { colunaCartaoOk, colunaVariavelOk }))) === false ? falharam++ : criadas++ } catch { falharam++ }
          }
          r = { ...r, fixosCriadas: criadas, fixosFalharam: falharam }
        }
      }
      setResultado({ ...textoResultado(r), r, pendencias: plano.previa.emAberto, importacaoId })
      setRascunhos((rs) => rs.filter((x) => x.id !== importacaoId))
      irPara(5)
    } catch (e) {
      setErro(explicarErro(e, 'importar a fatura')) // mantém tudo: tentar de novo é seguro (mesmo id do lote)
    } finally {
      setConfirmando(false)
    }
  }

  return {
    etapa, maxEtapa, irPara, arquivo, linhas, cartaoId, mesFatura, modoValor, importacaoId, lendo, erro, setErro, confirmando, resultado, rascunhos, importadas, conciliando, bancoV2, salvoEm, faturaMesOk,
    analise, plano, cartoes, categorias, pessoas, fechamentos: store.fechamentos || [],
    abrirCsv, abrirPdf, definirCartao, definirMes, definirModo, definirTotalBanco, atualizarLinha, decidir, escolherParcelamento, mudarCategoria, adicionarLinha, retomar, reconferir, descartar, confirmar, limpar, recorrenciaDe, alternarFixo, fixosMarcados, fixosAPlanejar,
  }
}
