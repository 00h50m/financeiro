import { inicioDoApp } from './inicioApp.js'
import { useState, useEffect, useRef, useMemo } from 'react'
import { sb } from './supabase.js'
import { hojeSP, mesLabel, addMonths, nowYM } from './utils.js'
import { mesesFechadosTocados, mesFechado } from './fechamento.js'
import { mesesAfetadosPelaFatura } from './faturaEdicao.js'
import { amigavel, explicarErro } from './erros.js'
import { avisoTeto } from './alertaTeto.js'
import { avisoTetoSemanal } from './alertaTetoSemanal.js'
import { anexarValores, chaveConta } from './fixosVersoes.js'
import { gerarCodigo, hashCodigo } from './pareamento.js'
import { perfil } from './perfil.js'
import { atendimentosPorMes, somarPorMes } from './atendimentos.js'
import { novoEstoque } from './atendimentosExtra.js'
import { aulasPorMes, rendasComAulas, aulasAReceberPorMes, montarFechamento, modoRendaAulas, deslocarMeses } from './aulasFechamento.js'

const POR_PAGINA = 1000 // o Supabase devolve no máximo 1000 linhas por consulta

// Lê a tabela inteira, de 1000 em 1000 (sem isso, passando de 1000 linhas as mais antigas somem sem aviso).
// `ordem` precisa ser estável (inclui id) para as páginas não repetirem nem pularem linhas.
async function lerTudo(tabela, ordenar) {
  const linhas = []
  for (let de = 0; ; de += POR_PAGINA) {
    const r = await ordenar(sb.from(tabela).select('*')).range(de, de + POR_PAGINA - 1)
    if (r.error) return { error: r.error, data: null }
    linhas.push(...r.data)
    if (r.data.length < POR_PAGINA) return { error: null, data: linhas }
  }
}

export function useStore(email = null) {
  const [cartoes, setCartoes] = useState([])
  const [compras, setCompras] = useState([])
  const [rendasManuais, setRendas] = useState([])
  const [fixos, setFixos] = useState([])
  const [faturas, setFaturas] = useState([])
  const [categorias, setCategorias] = useState([])
  const [fixosPagamentos, setFixosPagamentos] = useState([])
  const [aviso, setAviso] = useState(null) // { texto, tipo } — recado rápido na tela (ex.: categoria perto do teto)
  const timerAviso = useRef(null)
  function mostrarAviso(texto, tipo = 'amber') {
    clearTimeout(timerAviso.current)
    setAviso({ texto, tipo })
    timerAviso.current = setTimeout(() => setAviso(null), 10000)
  }
  const [desfazivel, setDesfazivel] = useState(null) // última exclusão que ainda dá para desfazer
  const [fixosValores, setFixosValores] = useState([])
  const [fixosValoresOk, setFixosValoresOk] = useState(true)
  const [saldoAjustes, setSaldoAjustes] = useState([])
  const [pessoas, setPessoas] = useState([])
  const [orcamentos, setOrcamentos] = useState([])
  const [config, setConfig] = useState({}) // chave -> valor (tabela config)
  const [eventos, setEventos] = useState([]) // Inbox Financeiro (eventos_financeiros)
  const [regras, setRegras] = useState([]) // regras_categorizacao
  const [aliases, setAliases] = useState([]) // estabelecimento_aliases
  const [integracoesTelegram, setIntegracoesTelegram] = useState([])
  const [inboxOk, setInboxOk] = useState(true) // false = migration do Inbox ainda não rodou
  const [configOk, setConfigOk] = useState(true)
  const [orcamentosOk, setOrcamentosOk] = useState(true) // false = tabela ainda não criada no banco
  const [comprasPagamentos, setComprasPagamentos] = useState([])
  const [comprasPagamentosOk, setComprasPagamentosOk] = useState(false) // false = migration 14 ainda não rodada
  const [fechamentos, setFechamentos] = useState([])
  const [fechamentosOk, setFechamentosOk] = useState(false) // false = migration 15 ainda não rodada
  const [metas, setMetas] = useState([])
  const [metasMovimentos, setMetasMovimentos] = useState([])
  const [metasOk, setMetasOk] = useState(false) // false = migration 16 ainda não rodada
  const [rendaSazonal, setRendaSazonal] = useState([])
  const [alunos, setAlunos] = useState([])
  const [aulasProg, setAulasProg] = useState([])
  const [aulas, setAulas] = useState([])
  const [aulasPrevInicial, setAulasPrevInicial] = useState([])
  const [aulasFech, setAulasFech] = useState([])
  const [dividas, setDividas] = useState([])
  const [dividasOk, setDividasOk] = useState(false) // false = inbox/27_dividas.sql ainda não rodado
  const [clientes, setClientes] = useState([])
  const [servicos, setServicos] = useState([])
  const [atendimentos, setAtendimentos] = useState([])
  const [atendimentosOk, setAtendimentosOk] = useState(false) // false = inbox/34_atendimentos.sql ainda não rodado
  const [pacotes, setPacotes] = useState([])
  const [produtos, setProdutos] = useState([])
  const [vendasProdutos, setVendasProdutos] = useState([])
  const [pacotesOk, setPacotesOk] = useState(false) // false = inbox/35_atendimentos_pacotes.sql ainda não rodado
  const [planosVida, setPlanosVida] = useState([])
  const [planosVidaOk, setPlanosVidaOk] = useState(false) // false = inbox/36_planos_vida.sql ainda não rodado
  const [reservaFontes, setReservaFontes] = useState([])
  const [reservaFontesOk, setReservaFontesOk] = useState(false) // false = inbox/31_reserva_fontes.sql ainda não rodado
  const [adiamentos, setAdiamentos] = useState([])
  const [adiamentosOk, setAdiamentosOk] = useState(false) // false = inbox/26_adiamentos.sql ainda não rodado
  const [aulasPausas, setAulasPausas] = useState([])
  const [aulasPausasOk, setAulasPausasOk] = useState(true) // tabela do SQL 24; sem ela as pausas ficam indisponíveis, mas as aulas funcionam
  const [aulasOk, setAulasOk] = useState(false) // false = inbox/23_aulas_particulares.sql ainda não rodado
  const [rendaSazonalOk, setRendaSazonalOk] = useState(false) // false = inbox/22_renda_sazonal.sql ainda não rodado
  const [divisoes, setDivisoes] = useState([])
  const [divisoesRepasses, setDivisoesRepasses] = useState([])
  const [divisoesOk, setDivisoesOk] = useState(false) // false = migration 18 ainda não rodada
  const [loading, setLoading] = useState(true)
  const [syncState, setSyncState] = useState('ok')
  const [error, setError] = useState(null)

  const ultimaCarga = useRef(0)

  // Recarga seletiva: cada ação diz quais grupos de dados mudaram (`quais`); sem `quais`, recarrega tudo.
  // Grupos: cartoes, compras, rendas, fixos, faturas, categorias, fixosPagamentos, saldoAjustes, pessoas, orcamentos,
  // config, inbox (eventos + regras + aliases + integrações), comprasPagamentos, fechamentos, metas (metas + movimentos),
  // divisoes (divisões + repasses).
  // Cargas que se atropelam somam os grupos: a mais nova sempre cobre o que as anteriores pediram.
  const pendentes = useRef(new Set())
  const pendenteTudo = useRef(false)

  // Devolve true se carregou. Recarga silenciosa que falha mantém os dados antigos na tela (não derruba o app).
  async function loadAll({ silent = false, quais = null } = {}) {
    const minha = ++ultimaCarga.current
    if (!quais) pendenteTudo.current = true
    else quais.forEach((g) => pendentes.current.add(g))
    const efetivo = pendenteTudo.current ? null : [...pendentes.current]
    const quer = (g) => !efetivo || efetivo.includes(g)
    const nada = Promise.resolve(null)
    if (!silent) setLoading(true)
    if (!silent) setError(null)
    try {
      const [c, co, r, fx, fa, cat, fxp, fxv, sa, ps, orc, cfg, ev, rg, al, it, cp, fe, me, mm, dv, dr, rsz, al1, al2, al3, al4, al5, al6, adi, dvd, rfo, cli, srv, atd, pac, prd, vnd, pvd] = await Promise.all([
        quer('cartoes') ? sb.from('cartoes').select('*').order('created_at') : nada,
        quer('compras') ? lerTudo('compras', (q) => q.order('data_compra', { ascending: false }).order('id')) : nada,
        quer('rendas') ? sb.from('rendas').select('*').order('mes', { ascending: false }) : nada,
        quer('fixos') ? sb.from('fixos').select('*').order('created_at') : nada,
        quer('faturas') ? lerTudo('faturas', (q) => q.order('mes', { ascending: false }).order('id')) : nada,
        quer('categorias') ? sb.from('categorias').select('*').order('nome') : nada,
        quer('fixosPagamentos') ? lerTudo('fixos_pagamentos', (q) => q.order('id')) : nada,
        quer('fixosValores') ? lerTudo('fixos_valores', (q) => q.order('id')) : nada,
        quer('saldoAjustes') ? sb.from('saldo_ajustes').select('*') : nada,
        quer('pessoas') ? sb.from('pessoas').select('*').order('created_at') : nada,
        quer('orcamentos') ? sb.from('orcamentos').select('*') : nada,
        quer('config') ? sb.from('config').select('*') : nada,
        quer('inbox') ? lerTudo('eventos_financeiros', (q) => q.order('capturado_em', { ascending: false }).order('id')) : nada,
        quer('inbox') ? sb.from('regras_categorizacao').select('*') : nada,
        quer('inbox') ? sb.from('estabelecimento_aliases').select('*') : nada,
        quer('inbox') ? sb.from('integracoes_telegram').select('*').order('conectado_em') : nada,
        quer('comprasPagamentos') ? lerTudo('compras_pagamentos', (q) => q.order('id')) : nada,
        quer('fechamentos') ? sb.from('fechamentos').select('*').order('mes') : nada,
        quer('metas') ? sb.from('metas').select('*').order('prioridade').order('criada_em') : nada,
        quer('metas') ? lerTudo('metas_movimentos', (q) => q.order('data', { ascending: false }).order('criado_em', { ascending: false })) : nada,
        quer('divisoes') ? sb.from('divisoes').select('*').order('criada_em') : nada,
        quer('divisoes') ? lerTudo('divisoes_repasses', (q) => q.order('mes', { ascending: false }).order('id')) : nada,
        quer('rendaSazonal') ? sb.from('renda_sazonal').select('*') : nada,
        quer('aulas') ? sb.from('alunos').select('*').order('nome') : nada,
        quer('aulas') ? sb.from('aulas_programacao').select('*').order('vigencia_inicio') : nada,
        quer('aulas') ? lerTudo('aulas', (q) => q.order('data').order('id')) : nada,
        quer('aulas') ? sb.from('aulas_previsao_inicial').select('*') : nada,
        quer('aulas') ? sb.from('aulas_fechamentos').select('*') : nada,
        quer('aulas') ? sb.from('aulas_pausas').select('*').order('inicio') : nada,
        quer('adiamentos') ? sb.from('adiamentos').select('*').order('criado_em') : nada,
        quer('dividas') ? sb.from('dividas').select('*').order('criada_em') : nada,
        quer('reservaFontes') ? sb.from('reserva_fontes').select('*').order('criada_em') : nada,
        perfil.atendimentos && quer('atendimentos') ? sb.from('clientes').select('*').order('nome') : nada,
        perfil.atendimentos && quer('atendimentos') ? sb.from('servicos').select('*').order('nome') : nada,
        perfil.atendimentos && quer('atendimentos') ? lerTudo('atendimentos', (q) => q.order('data', { ascending: false }).order('id')) : nada,
        perfil.atendimentos && quer('atendimentos') ? sb.from('pacotes').select('*').order('data_venda', { ascending: false }) : nada,
        perfil.atendimentos && quer('atendimentos') ? sb.from('produtos').select('*').order('nome') : nada,
        perfil.atendimentos && quer('atendimentos') ? lerTudo('vendas_produtos', (q) => q.order('data', { ascending: false }).order('id')) : nada,
        quer('planosVida') ? sb.from('planos_vida').select('*').order('criado_em', { ascending: false }).limit(50) : nada,
      ])
      if (minha !== ultimaCarga.current) { if (!silent) setLoading(false); return true } // chegou uma recarga mais nova: ela cobre os grupos desta
      pendentes.current = new Set()
      pendenteTudo.current = false
      for (const x of [c, co, r, fx, fa, cat, fxp, sa, ps]) if (x?.error) throw x.error
      if (c) setCartoes(c.data || [])
      if (co) setCompras(co.data || [])
      if (r) setRendas(r.data || [])
      if (fx) setFixos(fx.data || [])
      if (fa) setFaturas(fa.data || [])
      if (cat) setCategorias(cat.data || [])
      if (fxp) setFixosPagamentos(fxp.data || [])
      // Valor real mensal é opcional: sem a migration 20 as contas fixas seguem só com o valor cadastrado.
      if (fxv) { setFixosValoresOk(!fxv.error); setFixosValores(fxv.error ? [] : fxv.data || []) }
      if (sa) setSaldoAjustes(sa.data || [])
      if (ps) setPessoas(ps.data || [])
      // Pagamento por parcela é opcional: sem a migration 14 o app usa o "pago" antigo da compra.
      if (cp) { setComprasPagamentosOk(!cp.error); setComprasPagamentos(cp.error ? [] : cp.data || []) }
      // Fechamento mensal é opcional: sem a migration 15 o app segue funcionando sem ele.
      if (fe) { setFechamentosOk(!fe.error); setFechamentos(fe.error ? [] : fe.data || []) }
      // Metas são opcionais: sem a migration 16 a Reserva segue usando a tabela config.
      if (me && mm) {
        setMetasOk(!me.error && !mm.error)
        setMetas(me.error || mm.error ? [] : me.data || [])
        setMetasMovimentos(me.error || mm.error ? [] : mm.data || [])
      }
      // Divididos são opcionais: sem a migration 18 o app segue funcionando sem a aba.
      if (dv && dr) {
        setDivisoesOk(!dv.error && !dr.error)
        setDivisoes(dv.error || dr.error ? [] : dv.data || [])
        setDivisoesRepasses(dv.error || dr.error ? [] : dr.data || [])
      }
      // Aulas particulares são opcionais: sem o inbox/23 o app segue funcionando sem a aba.
      if (adi) { setAdiamentosOk(!adi.error); setAdiamentos(adi.error ? [] : adi.data || []) }
      if (dvd) { setDividasOk(!dvd.error); setDividas(dvd.error ? [] : dvd.data || []) }
      if (cli && srv && atd) {
        const ruim = [cli, srv, atd].some((x) => x.error)
        setAtendimentosOk(!ruim)
        setClientes(ruim ? [] : cli.data || [])
        setServicos(ruim ? [] : srv.data || [])
        setAtendimentos(ruim ? [] : atd.data || [])
      }
      if (pac && prd && vnd) { // parte 2 dos atendimentos: opcional
        const ruim = [pac, prd, vnd].some((x) => x.error)
        setPacotesOk(!ruim)
        setPacotes(ruim ? [] : pac.data || [])
        setProdutos(ruim ? [] : prd.data || [])
        setVendasProdutos(ruim ? [] : vnd.data || [])
      }
      if (pvd) { setPlanosVidaOk(!pvd.error); setPlanosVida(pvd.error ? [] : pvd.data || []) }
      if (rfo) { setReservaFontesOk(!rfo.error); setReservaFontes(rfo.error ? [] : rfo.data || []) }
      if (al1 && al2 && al3 && al4 && al5) {
        const ruim = [al1, al2, al3, al4, al5].some((x) => x.error)
        setAulasOk(!ruim)
        setAlunos(ruim ? [] : al1.data || [])
        setAulasProg(ruim ? [] : al2.data || [])
        setAulas(ruim ? [] : al3.data || [])
        setAulasPrevInicial(ruim ? [] : al4.data || [])
        setAulasFech(ruim ? [] : al5.data || [])
        setAulasPausasOk(!!al6 && !al6.error)
        setAulasPausas(al6 && !al6.error ? al6.data || [] : [])
      }
      // Renda sazonal é opcional: sem o inbox/22 o app segue funcionando, só sem a projeção por mês do ano.
      if (rsz) { setRendaSazonalOk(!rsz.error); setRendaSazonal(rsz.error ? [] : rsz.data || []) }
      // Orçamentos são opcionais: se a tabela ainda não existe, o resto do app continua funcionando.
      if (orc) { setOrcamentosOk(!orc.error); setOrcamentos(orc.error ? [] : orc.data || []) }
      if (cfg) {
        setConfigOk(!cfg.error)
        setConfig(cfg.error ? {} : Object.fromEntries((cfg.data || []).map((x) => [x.chave, x.valor])))
      }
      // Inbox é opcional: sem a migration (inbox/*.sql) o resto do app continua funcionando.
      if (ev && rg && al) {
        const inboxPronto = !ev.error && !rg.error && !al.error
        setInboxOk(inboxPronto)
        setEventos(inboxPronto ? ev.data || [] : [])
        setRegras(inboxPronto ? rg.data || [] : [])
        setAliases(inboxPronto ? al.data || [] : [])
        setIntegracoesTelegram(inboxPronto && it && !it.error ? it.data || [] : [])
      }
    } catch (e) {
      if (!silent) setError(explicarErro(e, 'carregar os dados'))
      if (!silent) setLoading(false)
      return false
    }
    if (!silent) setLoading(false)
    return true
  }

  useEffect(() => { loadAll() }, [])

  // Devolve true se gravou; false se deu erro (já avisado na tela). Quem chama só fecha o formulário ou
  // segue para o próximo passo quando for true, para nunca perder o que a pessoa digitou.
  // `quais`: grupos que a ação alterou (recarga seletiva); sem ele, recarrega tudo (mais seguro quando há cascata).
  async function op(fn, quais = null, acao = 'salvar a alteração') {
    setSyncState('syncing')
    try {
      await fn()
    } catch (e) {
      setSyncState('error')
      alert(explicarErro(e, acao))
      return false
    }
    setSyncState((await loadAll({ silent: true, quais })) ? 'ok' : 'error')
    return true
  }

  // DESFAZER EXCLUSÃO: guarda as linhas apagadas por 15 s; "desfazer" insere de volta com os mesmos ids (pai antes dos filhos).
  const timerDesfazer = useRef(null)
  function oferecerDesfazer(rotulo, itens, quais) {
    const linhas = itens.filter((i) => i.linhas.length)
    if (!linhas.length) return
    clearTimeout(timerDesfazer.current)
    setDesfazivel({ rotulo, itens: linhas, quais })
    timerDesfazer.current = setTimeout(() => setDesfazivel(null), 15000)
  }
  const dispensarDesfazer = () => { clearTimeout(timerDesfazer.current); setDesfazivel(null) }
  async function desfazerExclusao() {
    const d = desfazivel
    if (!d) return false
    dispensarDesfazer()
    const ok = await op(async () => {
      for (const { tabela, linhas } of d.itens) {
        const r = await sb.from(tabela).insert(linhas)
        if (r.error) throw r.error
      }
    }, d.quais, 'desfazer a exclusão')
    if (ok) await registrarAuditoria({ entidade: d.itens[0].tabela, entidade_id: String(d.itens[0].linhas[0].id || ''), acao: 'desfazer_exclusao', depois: { rotulo: d.rotulo, linhas: d.itens.map((i) => `${i.tabela}: ${i.linhas.length}`) } })
    return ok
  }

  // CARTÕES
  const addCartao = (data) => op(async () => {
    const r = await sb.from('cartoes').insert(data)
    if (r.error) throw r.error
  }, null, 'salvar o cartão')
  const updateCartao = (id, data) => op(async () => {
    const r = await sb.from('cartoes').update(data).eq('id', id)
    if (r.error) throw r.error
  }, null, 'salvar o cartão')
  const delCartao = (id) => op(async () => {
    const r = await sb.from('cartoes').delete().eq('id', id)
    if (r.error) throw r.error
  }, null, 'apagar o cartão (apague ou mude antes as compras e faturas dele)')

  // AUDITORIA (só eventos financeiros relevantes; falha em gravar não derruba a ação principal)
  async function registrarAuditoria(reg) {
    try {
      const r = await sb.from('auditoria_financeira').insert({ usuario: email, ...reg })
      if (r.error) console.warn('auditoria: não gravou', r.error.message)
    } catch (e) {
      console.warn('auditoria: não gravou', e?.message)
    }
  }
  const listarAuditoria = async (entidade, entidadeId) => {
    let q = sb.from('auditoria_financeira').select('*').eq('entidade', entidade).order('quando', { ascending: false }).limit(50)
    if (entidadeId) q = q.eq('entidade_id', entidadeId)
    const r = await q
    return r.error ? [] : r.data || []
  }

  // Alterar compra que tem parcela em mês FECHADO é permitido, mas exige justificativa (vai para a auditoria).
  function exigirJustificativa(comprasAfetadas) {
    const fechados = mesesFechadosTocados(comprasAfetadas, cartoes, fechamentos)
    if (!fechados.length) return { ok: true, meses: [], motivo: null }
    const lista = fechados.map(mesLabel).join(', ')
    const motivo = window.prompt(`${lista} já está fechado e esta alteração muda os números dele.\n\nPara continuar, escreva o motivo:`)
    if (!motivo || motivo.trim().length < 3) return { ok: false, meses: fechados, motivo: null }
    return { ok: true, meses: fechados, motivo: motivo.trim() }
  }
  async function comJustificativa(afetadas, acao, entidadeId, antes, depois, fn) {
    const j = exigirJustificativa(afetadas)
    if (!j.ok) return false
    const ok = await fn()
    if (ok && j.meses.length) {
      await registrarAuditoria({ entidade: 'compra', entidade_id: entidadeId, acao, antes, depois, motivo: `${j.motivo} (meses fechados: ${j.meses.join(', ')})` })
    }
    return ok
  }

  // COMPRAS
  const addCompra = (data) => comJustificativa([data], 'adicionar_em_mes_fechado', data.descricao || '', null, data, async () => {
    const ok = await op(async () => {
      const r = await sb.from('compras').insert(data)
      if (r.error) throw r.error
    }, ['compras'], 'salvar a compra')
    if (ok) {
      // mesmo aviso do Telegram: categoria que chegou perto (80%) ou passou do teto com esta compra
      try {
        const mensal = avisoTeto({ compra: data, compras: [...compras, data], cartoes, fixos: fixosComValores, orcamentos })
        const tetosPlano = planosVida.find((p) => p.ativo)?.plano?.tetos_semanais
        const semanal = tetosPlano?.length ? avisoTetoSemanal({ compra: data, compras: [...compras, data].filter((x) => x.categoria === data.categoria), tetos: tetosPlano, hoje: hojeSP() }) : null
        const texto = [mensal, semanal?.texto].filter(Boolean).join('\n')
        if (texto) mostrarAviso(texto, texto.includes('passou') ? 'red' : 'amber')
      } catch { /* aviso é só um extra: nunca atrapalha o salvamento */ }
    }
    return ok
  })
  const updateCompra = (id, data) => {
    const antes = compras.find((c) => c.id === id)
    return comJustificativa([antes, antes && { ...antes, ...data }], 'editar_em_mes_fechado', id, antes || null, data, () => op(async () => {
      const r = await sb.from('compras').update(data).eq('id', id)
      if (r.error) throw r.error
    }, ['compras'], 'salvar a compra'))
  }
  const updateComprasLote = (ids, data) => {
    const antes = compras.filter((c) => ids.includes(c.id))
    return comJustificativa([...antes, ...antes.map((c) => ({ ...c, ...data }))], 'editar_lote_em_mes_fechado', `${ids.length} compras`, null, { ids, ...data }, () => op(async () => {
      const r = await sb.from('compras').update(data).in('id', ids)
      if (r.error) throw r.error
    }, ['compras'], 'alterar as compras selecionadas'))
  }
  // Divisão de compra em categorias (ver lib/divisaoCompra.js). Ordem segura: primeiro entra o novo, depois
  // atualiza, por último remove — se algo falhar no meio, nada some. Respeita o mês fechado como as demais.
  const salvarDivisao = (plano, grupoId) => {
    const antes = compras.filter((c) => plano.remover.includes(c.id) || plano.atualizar.some((u) => u.id === c.id))
    const depois = [...plano.inserir, ...plano.atualizar.map((u) => ({ ...compras.find((c) => c.id === u.id), ...u.dados }))]
    return comJustificativa([...antes, ...depois], 'dividir_em_mes_fechado', grupoId || antes[0]?.id || 'divisao', antes.length ? antes : null, plano, () => op(async () => {
      if (plano.inserir.length) {
        const r = await sb.from('compras').insert(plano.inserir)
        if (r.error) throw r.error
      }
      for (const u of plano.atualizar) {
        const r = await sb.from('compras').update(u.dados).eq('id', u.id)
        if (r.error) throw r.error
      }
      if (plano.remover.length) {
        const r = await sb.from('compras').delete().in('id', plano.remover)
        if (r.error) throw r.error
      }
    }, ['compras', 'comprasPagamentos', 'inbox'], 'dividir a compra em categorias'))
  }
  const delCompra = (id) => {
    const antes = compras.find((c) => c.id === id)
    return comJustificativa([antes], 'apagar_em_mes_fechado', id, antes || null, null, async () => {
      const ok = await op(async () => {
        const r = await sb.from('compras').delete().eq('id', id)
        if (r.error) throw r.error
      }, ['compras', 'comprasPagamentos', 'inbox'], 'apagar a compra')
      if (ok && antes) oferecerDesfazer(`Compra "${antes.identificacao || antes.descricao}" apagada.`, [
        { tabela: 'compras', linhas: [antes] },
        ...(comprasPagamentosOk ? [{ tabela: 'compras_pagamentos', linhas: comprasPagamentos.filter((p) => p.compra_id === id) }] : []),
      ], ['compras', 'comprasPagamentos'])
      return ok
    })
  }

  // FECHAMENTO MENSAL (fechar e reabrir são funções do banco: transação única + auditoria)
  const fecharMes = (mes, foto) => op(async () => {
    const r = await sb.rpc('fechar_mes', { p_mes: mes, p_foto: foto, p_usuario: email })
    if (r.error) throw r.error
  }, ['fechamentos'], 'fechar o mês')
  const reabrirMes = (mes, motivo) => op(async () => {
    const r = await sb.rpc('reabrir_mes', { p_mes: mes, p_motivo: motivo, p_usuario: email })
    if (r.error) throw r.error
  }, ['fechamentos'], 'reabrir o mês')

  // RENDA
  const upsertRenda = (data) => op(async () => {
    const r = await sb.from('rendas').upsert(data, { onConflict: 'mes' })
    if (r.error) throw r.error
  }, ['rendas'], 'salvar a renda')

  // FIXOS
  const addFixo = (data) => op(async () => {
    const r = await sb.from('fixos').insert(data)
    if (r.error) throw r.error
  }, ['fixos'], 'salvar a conta fixa')
  const updateFixo = (id, data) => op(async () => {
    const r = await sb.from('fixos').update(data).eq('id', id)
    if (r.error) throw r.error
  }, ['fixos'], 'salvar a conta fixa')
  const delFixo = async (id) => {
    const bruto = fixos.find((f) => f.id === id)
    const ok = await op(async () => {
      const r = await sb.from('fixos').delete().eq('id', id)
      if (r.error) throw r.error
    }, ['fixos', 'fixosPagamentos', 'fixosValores'], 'apagar a conta fixa')
    if (ok && bruto) {
      oferecerDesfazer(`Conta fixa "${bruto.nome}" apagada.`, [
        { tabela: 'fixos', linhas: [bruto] },
        { tabela: 'fixos_pagamentos', linhas: fixosPagamentos.filter((p) => p.fixo_id === id) },
        ...(fixosValoresOk ? [{ tabela: 'fixos_valores', linhas: fixosValores.filter((v) => v.fixo_id === id) }] : []),
      ], ['fixos', 'fixosPagamentos', 'fixosValores'])
    }
    return ok
  }

  // FATURAS
  const upsertFatura = (data) => op(async () => {
    const r = await sb.from('faturas').upsert(data, { onConflict: 'cartao_id,mes' })
    if (r.error?.code === '23502') {
      throw amigavel('Falta rodar a atualização 13 do banco (arquivo inbox/13_faturas_valor_real_opcional.sql no Supabase).')
    }
    if (r.error) throw r.error
  }, ['faturas'], 'salvar a fatura')
  // Editar uma fatura (valor real, cartão, mês, pagamento). Mudar fatura de mês FECHADO muda os números dele:
  // pede o motivo e registra na auditoria, como nas compras.
  const updateFatura = async (id, data) => {
    const antes = faturas.find((f) => f.id === id)
    const fechados = mesesAfetadosPelaFatura(antes, data).filter((m) => mesFechado(fechamentos, m))
    let motivo = null
    if (fechados.length) {
      motivo = window.prompt(`${fechados.map(mesLabel).join(', ')} já está fechado e esta alteração muda os números dele.\n\nPara continuar, escreva o motivo:`)
      if (!motivo || motivo.trim().length < 3) return false
    }
    const ok = await op(async () => {
      const r = await sb.from('faturas').update(data).eq('id', id)
      if (r.error?.code === '23505') throw amigavel('Já existe uma fatura desse cartão nesse mês.')
      if (r.error?.code === '23502') throw amigavel('Falta rodar a atualização 13 do banco (arquivo inbox/13_faturas_valor_real_opcional.sql no Supabase).')
      if (r.error) throw r.error
    }, ['faturas'])
    if (ok && fechados.length) {
      await registrarAuditoria({ entidade: 'fatura', entidade_id: id, acao: 'editar_em_mes_fechado', antes, depois: data, motivo: `${motivo.trim()} (meses fechados: ${fechados.join(', ')})` })
    }
    return ok
  }
  const delFatura = async (id) => {
    const antes = faturas.find((f) => f.id === id)
    const ok = await op(async () => {
      const r = await sb.from('faturas').delete().eq('id', id)
      if (r.error) throw r.error
    }, ['faturas'], 'apagar a fatura')
    if (ok && antes) oferecerDesfazer(`Fatura de ${mesLabel(antes.mes)} apagada.`, [{ tabela: 'faturas', linhas: [antes] }], ['faturas'])
    return ok
  }

  // Junta cópias duplicadas de uma conta fixa: os valores reais e pagamentos das cópias passam para a conta que fica
  // (sem sobrescrever o que ela já tem) e só então as cópias são removidas.
  const juntarVersoes = (principalId, removerIds) => op(async () => {
    const valores = fixosValores.filter((v) => removerIds.includes(v.fixo_id)).map(({ mes, valor }) => ({ fixo_id: principalId, mes, valor }))
    if (valores.length && fixosValoresOk) {
      const r = await sb.from('fixos_valores').upsert(valores, { onConflict: 'fixo_id,mes', ignoreDuplicates: true })
      if (r.error) throw r.error
    }
    const pagamentos = fixosPagamentos.filter((p) => removerIds.includes(p.fixo_id)).map(({ mes, pago, data_pagamento }) => ({ fixo_id: principalId, mes, pago, data_pagamento }))
    if (pagamentos.length) {
      const r = await sb.from('fixos_pagamentos').upsert(pagamentos, { onConflict: 'fixo_id,mes', ignoreDuplicates: true })
      if (r.error) throw r.error
    }
    const r = await sb.from('fixos').delete().in('id', removerIds)
    if (r.error) throw r.error
  }, ['fixos', 'fixosPagamentos', 'fixosValores'], 'juntar as versões duplicadas da conta')

  // VALOR REAL DE CONTA FIXA VARIÁVEL (por mês): só aquele mês muda. Em mês fechado pede o motivo e audita.
  const definirValorFixo = async (fixo_id, mes, valor) => {
    const antes = fixosValores.find((v) => v.fixo_id === fixo_id && v.mes === mes)?.valor ?? null
    let motivo = null
    if (mesFechado(fechamentos, mes)) {
      motivo = window.prompt(`${mesLabel(mes)} já está fechado e esta alteração muda os números dele.\n\nPara continuar, escreva o motivo:`)
      if (!motivo || motivo.trim().length < 3) return false
    }
    // o valor do mês é da CONTA (todas as versões dela): ao gravar ou apagar, nenhuma versão fica com outro valor guardado para o mesmo mês
    const fx = fixos.find((f) => f.id === fixo_id)
    const idsDaConta = fx ? fixos.filter((f) => chaveConta(f) === chaveConta(fx)).map((f) => f.id) : [fixo_id]
    const ok = await op(async () => {
      let r = await sb.from('fixos_valores').delete().in('fixo_id', idsDaConta).eq('mes', mes)
      if (r.error) throw r.error
      if (valor != null) {
        r = await sb.from('fixos_valores').upsert({ fixo_id, mes, valor }, { onConflict: 'fixo_id,mes' })
        if (r.error) throw r.error
      }
    }, ['fixosValores'], valor == null ? 'voltar o mês para a estimativa' : 'salvar o valor do mês')
    if (ok && motivo) {
      await registrarAuditoria({ entidade: 'fixo_valor', entidade_id: fixo_id, acao: 'editar_em_mes_fechado', antes: { mes, valor: antes }, depois: { mes, valor }, motivo: `${motivo.trim()} (mês fechado: ${mes})` })
    }
    return ok
  }

  // Apagar um período do histórico de valores (uma versão antiga da conta). Muda os números dos meses desse período:
  // se algum deles já está fechado, exige o motivo e registra na auditoria.
  const apagarVersaoFixo = async (versao) => {
    const meses = []
    for (let m = versao.mes_inicio || addMonths(nowYM(), -24); m <= (versao.mes_fim || nowYM()) && meses.length < 120; m = addMonths(m, 1)) meses.push(m)
    const fechados = meses.filter((m) => mesFechado(fechamentos, m))
    let motivo = null
    if (fechados.length) {
      motivo = window.prompt(`Este período inclui ${fechados.length === 1 ? 'um mês já fechado' : `${fechados.length} meses já fechados`} (${fechados.slice(0, 3).map(mesLabel).join(', ')}${fechados.length > 3 ? '…' : ''}). Apagar muda os números ${fechados.length === 1 ? 'dele' : 'deles'}.\n\nPara continuar, escreva o motivo:`)
      if (!motivo || motivo.trim().length < 3) return false
    }
    const ok = await op(async () => {
      const r = await sb.from('fixos').delete().eq('id', versao.id)
      if (r.error) throw r.error
    }, ['fixos', 'fixosPagamentos', 'fixosValores'], 'apagar o período da conta fixa')
    if (ok) {
      oferecerDesfazer(`Período da conta "${versao.nome}" apagado.`, [{ tabela: 'fixos', linhas: [versao] }, { tabela: 'fixos_pagamentos', linhas: fixosPagamentos.filter((p) => p.fixo_id === versao.id) }, ...(fixosValoresOk ? [{ tabela: 'fixos_valores', linhas: fixosValores.filter((v) => v.fixo_id === versao.id) }] : [])], ['fixos', 'fixosPagamentos', 'fixosValores'])
      if (motivo) await registrarAuditoria({ entidade: 'fixo', entidade_id: versao.id, acao: 'apagar_periodo_em_mes_fechado', antes: versao, motivo: `${motivo.trim()} (meses fechados: ${fechados.join(', ')})` })
    }
    return ok
  }

  // PAGAMENTOS DE FIXOS (por mês)
  const marcarFixoPago = (fixo_id, mes, pago) => op(async () => {
    const r = await sb.from('fixos_pagamentos').upsert(
      { fixo_id, mes, pago, data_pagamento: pago ? hojeSP() : null },
      { onConflict: 'fixo_id,mes' }
    )
    if (r.error) throw r.error
  }, ['fixosPagamentos'], 'marcar o pagamento da conta fixa')
  // Corrigir só a DATA de um pagamento já marcado (ao marcar, a data é a de hoje). Não muda valores nem o "pago",
  // então não mexe nos números de mês fechado e não pede justificativa.
  const definirDataPagamentoFixo = (fixo_id, mes, data) => op(async () => {
    const r = await sb.from('fixos_pagamentos').update({ data_pagamento: data }).eq('fixo_id', fixo_id).eq('mes', mes)
    if (r.error) throw r.error
  }, ['fixosPagamentos'], 'corrigir a data do pagamento')
  const definirDataPagamentoFatura = (cartao_id, mes, data) => op(async () => {
    const r = await sb.from('faturas').update({ data_pagamento: data }).eq('cartao_id', cartao_id).eq('mes', mes)
    if (r.error) throw r.error
  }, ['faturas'], 'corrigir a data do pagamento')

  // PAGAMENTO POR PARCELA (compras sem cartão): uma linha por compra e mês
  const marcarParcelaPaga = (compra_id, mes, pago) => op(async () => {
    const r = await sb.from('compras_pagamentos').upsert(
      { compra_id, mes, pago, data_pagamento: pago ? hojeSP() : null },
      { onConflict: 'compra_id,mes' }
    )
    if (r.error) throw r.error
  }, ['comprasPagamentos'], 'marcar o pagamento da parcela')
  const definirDataPagamentoParcela = (compra_id, mes, data) => op(async () => {
    const r = await sb.from('compras_pagamentos').update({ data_pagamento: data }).eq('compra_id', compra_id).eq('mes', mes)
    if (r.error) throw r.error
  }, ['comprasPagamentos'], 'corrigir a data do pagamento')

  // SALDO (dinheiro disponível — ajuste manual por mês)
  const definirAjusteSaldo = async (mes, ajuste) => {
    const antes = Number(saldoAjustes.find((a) => a.mes === mes)?.ajuste) || 0
    const ok = await op(async () => {
      const r = await sb.from('saldo_ajustes').upsert(
        { mes, ajuste, atualizado_em: new Date().toISOString() },
        { onConflict: 'mes' }
      )
      if (r.error) throw r.error
    }, ['saldoAjustes'])
    if (ok) await registrarAuditoria({ entidade: 'saldo_ajuste', entidade_id: mes, acao: 'ajustar', antes: { ajuste: antes }, depois: { ajuste } })
    return ok
  }

  // RENDA SAZONAL: fator de uma fonte de renda num mês do ano (1 = normal). Fator 1 apaga a linha (é o padrão).
  // `limparValor`: o mês tinha um valor digitado (coluna `valor`, inbox/32) e volta a valer o fator.
  const definirFatorSazonal = (campo, mesDoAno, fator, { limparValor = false } = {}) => op(async () => {
    const r = Math.abs(fator - 1) < 0.005
      ? await sb.from('renda_sazonal').delete().eq('campo', campo).eq('mes_do_ano', mesDoAno)
      : await sb.from('renda_sazonal').upsert({ campo, mes_do_ano: mesDoAno, fator, ...(limparValor ? { valor: null } : {}), atualizado_em: new Date().toISOString() }, { onConflict: 'campo,mes_do_ano' })
    if (r.error) throw r.error
  }, ['rendaSazonal'], 'salvar a renda sazonal')
  // Valor digitado (R$) para a fonte naquele mês do ano. `fator` é o equivalente em % (o banco exige um fator).
  const definirValorSazonal = (campo, mesDoAno, { valor, fator }) => op(async () => {
    const r = await sb.from('renda_sazonal').upsert({ campo, mes_do_ano: mesDoAno, fator, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'campo,mes_do_ano' })
    if (r.error && (r.error.code === '42703' || r.error.code === 'PGRST204' || /valor/i.test(r.error.message || ''))) {
      throw amigavel('Falta rodar a atualização 32 do banco (arquivo inbox/32_renda_sazonal_valor.sql no Supabase) para guardar valores digitados.')
    }
    if (r.error) throw r.error
  }, ['rendaSazonal'], 'salvar a renda sazonal')
  // Vários meses do ano de uma vez (atalhos da tela): sem `valor`/`fator` (ou fator 1 sem valor) apaga os meses e volta ao normal.
  const definirSazonalEmLote = (campo, meses, { valor = null, fator = 1 } = {}) => op(async () => {
    if (valor == null && Math.abs(fator - 1) < 0.005) {
      const r = await sb.from('renda_sazonal').delete().eq('campo', campo).in('mes_do_ano', meses)
      if (r.error) throw r.error
      return
    }
    const agora = new Date().toISOString()
    const linhas = meses.map((m) => ({ campo, mes_do_ano: m, fator, ...(valor != null ? { valor } : { valor: null }), atualizado_em: agora }))
    const r = await sb.from('renda_sazonal').upsert(linhas, { onConflict: 'campo,mes_do_ano' })
    if (r.error && valor != null && (r.error.code === '42703' || r.error.code === 'PGRST204' || /valor/i.test(r.error.message || ''))) {
      throw amigavel('Falta rodar a atualização 32 do banco (arquivo inbox/32_renda_sazonal_valor.sql no Supabase) para guardar valores digitados.')
    }
    if (r.error) throw r.error
  }, ['rendaSazonal'], 'salvar a renda sazonal')

  // AULAS PARTICULARES. Valores em centavos, duração em minutos, datas AAAA-MM-DD. Tudo grava e recarrega só o grupo 'aulas'.
  const criarAluno = async (aluno, programacao) => {
    let novoId = null
    const ok = await op(async () => {
      const r = await sb.from('alunos').insert(aluno).select('id').single()
      if (r.error) throw r.error
      novoId = r.data.id
      if (programacao.length) {
        const p = await sb.from('aulas_programacao').insert(programacao.map((l) => ({ ...l, aluno_id: novoId })))
        if (p.error) throw p.error
      }
    }, ['aulas'], 'salvar o aluno')
    return ok ? novoId : null
  }
  const atualizarAluno = (id, patch) => op(async () => {
    const r = await sb.from('alunos').update(patch).eq('id', id)
    if (r.error) throw r.error
  }, ['aulas'], 'salvar o aluno')
  // Muda a programação a partir de `desde`: encerra as linhas que saem, cria as novas e apaga as previstas intactas que deixam de valer.
  const mudarProgramacao = ({ alunoId, desde, encerrarIds, novas, apagarAulaIds, novoValorHora = null, aulasNovoValorIds = [] }) => op(async () => {
    const dia = (() => { const d = new Date(`${desde}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10) })()
    if (encerrarIds.length) {
      const r = await sb.from('aulas_programacao').update({ vigencia_fim: dia }).in('id', encerrarIds)
      if (r.error) throw r.error
    }
    if (apagarAulaIds.length) {
      const r = await sb.from('aulas').delete().in('id', apagarAulaIds).eq('status', 'prevista')
      if (r.error) throw r.error
    }
    if (novas.length) {
      const r = await sb.from('aulas_programacao').insert(novas.map((l) => ({ ...l, aluno_id: alunoId, vigencia_inicio: desde })))
      if (r.error) throw r.error
    }
    if (novoValorHora != null) {
      const a = await sb.from('alunos').update({ valor_hora_centavos: novoValorHora }).eq('id', alunoId)
      if (a.error) throw a.error
      if (aulasNovoValorIds.length) {
        const r = await sb.from('aulas').update({ valor_hora_centavos: novoValorHora }).in('id', aulasNovoValorIds).eq('status', 'prevista')
        if (r.error) throw r.error
      }
    }
  }, ['aulas'], 'mudar a programação')
  // Gera as aulas previstas que faltam (sem duplicar: a unicidade é garantida no banco) e grava a previsão inicial uma única vez.
  const gerarAulas = (novas, previsoes) => op(async () => {
    if (novas.length) {
      const r = await sb.from('aulas').upsert(novas, { onConflict: 'programacao_id,data_original', ignoreDuplicates: true })
      if (r.error) throw r.error
    }
    if (previsoes.length) {
      const r = await sb.from('aulas_previsao_inicial').upsert(previsoes, { onConflict: 'aluno_id,mes', ignoreDuplicates: true })
      if (r.error) throw r.error
    }
  }, ['aulas'], 'gerar as aulas do mês')

  // DÍVIDAS (plano de quitação): cadastro simples; "pagar" é só atualizar o saldo
  const salvarDivida = (d) => op(async () => {
    const r = d.id ? await sb.from('dividas').update(d).eq('id', d.id) : await sb.from('dividas').insert(d)
    if (r.error) throw r.error
  }, ['dividas'], 'salvar a dívida')
  const removerDivida = (id) => op(async () => {
    const r = await sb.from('dividas').delete().eq('id', id)
    if (r.error) throw r.error
  }, ['dividas'], 'remover a dívida')

  // ATENDIMENTOS (perfil esteticista): clientes, serviços e agenda. Valores em reais; tudo grava e recarrega só o grupo 'atendimentos'.
  const gravar = (tabela, rotulo) => (d) => op(async () => {
    const r = d.id ? await sb.from(tabela).update(d).eq('id', d.id) : await sb.from(tabela).insert(d)
    if (r.error) throw r.error
  }, ['atendimentos'], rotulo)
  const apagar = (tabela, rotulo) => (id) => op(async () => {
    const r = await sb.from(tabela).delete().eq('id', id)
    if (r.error) throw r.error
  }, ['atendimentos'], rotulo)
  const salvarCliente = gravar('clientes', 'salvar a cliente')
  const salvarServico = gravar('servicos', 'salvar o serviço')
  const salvarAtendimento = gravar('atendimentos', 'salvar o atendimento')
  const removerCliente = apagar('clientes', 'remover a cliente')
  const removerServico = apagar('servicos', 'remover o serviço')
  const removerAtendimento = apagar('atendimentos', 'remover o atendimento')
  const salvarPacote = gravar('pacotes', 'salvar o pacote')
  const removerPacote = apagar('pacotes', 'remover o pacote')
  const salvarProduto = gravar('produtos', 'salvar o produto')
  const removerProduto = apagar('produtos', 'remover o produto')
  // Venda de produto: grava a venda e tira do estoque; apagar a venda devolve ao estoque.
  const salvarVendaProduto = gravar('vendas_produtos', 'salvar a venda')
  const registrarVendaProduto = (v) => op(async () => {
    const r = await sb.from('vendas_produtos').insert(v)
    if (r.error) throw r.error
    const p = produtos.find((x) => x.id === v.produto_id)
    if (p) {
      const e = await sb.from('produtos').update({ estoque: novoEstoque(p, Number(v.quantidade) || 0) }).eq('id', p.id)
      if (e.error) throw e.error
    }
  }, ['atendimentos'], 'registrar a venda')
  const removerVendaProduto = (v) => op(async () => {
    const r = await sb.from('vendas_produtos').delete().eq('id', v.id)
    if (r.error) throw r.error
    const p = produtos.find((x) => x.id === v.produto_id)
    if (p) {
      const e = await sb.from('produtos').update({ estoque: novoEstoque(p, -(Number(v.quantidade) || 0)) }).eq('id', p.id)
      if (e.error) throw e.error
    }
  }, ['atendimentos'], 'apagar a venda')

  // MEU PLANO (expert): cada plano gerado vira o plano atual e os anteriores ficam no histórico.
  const salvarPlanoVida = (p) => op(async () => {
    const a = await sb.from('planos_vida').update({ ativo: false }).eq('ativo', true)
    if (a.error) throw a.error
    const r = await sb.from('planos_vida').insert({ ...p, ativo: true })
    if (r.error) throw r.error
  }, ['planosVida'], 'salvar o plano')

  // RESERVA DE EMERGÊNCIA: onde está o dinheiro. O total é espelhado como "ajuste" na meta da reserva (ou em config), para o resto do app enxergar.
  const salvarFonteReserva = (f) => op(async () => {
    const r = f.id ? await sb.from('reserva_fontes').update(f).eq('id', f.id) : await sb.from('reserva_fontes').insert(f)
    if (r.error) throw r.error
  }, ['reservaFontes'], 'salvar o valor da reserva')
  const removerFonteReserva = (id) => op(async () => {
    const r = await sb.from('reserva_fontes').delete().eq('id', id)
    if (r.error) throw r.error
  }, ['reservaFontes'], 'remover o valor da reserva')

  // ADIAMENTOS: mover uma conta sem cartão (conta fixa ou parcela de compra sem cartão) de um mês para outro
  const adiarConta = (tipo, refId, mesOrigem, mesDestino, acrescimo = 0) => op(async () => {
    const r = await sb.from('adiamentos').upsert({ tipo, ref_id: refId, mes_origem: mesOrigem, mes_destino: mesDestino, acrescimo: Number(acrescimo) || 0 }, { onConflict: 'tipo,ref_id,mes_origem' })
    if (r.error) throw r.error
  }, ['adiamentos'], 'adiar a conta')
  const adiarVarias = (lista) => op(async () => {
    if (!lista.length) return
    const r = await sb.from('adiamentos').upsert(lista.map((a) => ({ tipo: a.tipo, ref_id: a.refId, mes_origem: a.mesOrigem, mes_destino: a.mesDestino, acrescimo: Number(a.acrescimo) || 0 })), { onConflict: 'tipo,ref_id,mes_origem' })
    if (r.error) throw r.error
  }, ['adiamentos'], 'adiar as contas')
  const desfazerAdiamento = (id) => op(async () => {
    const r = await sb.from('adiamentos').delete().eq('id', id)
    if (r.error) throw r.error
  }, ['adiamentos'], 'voltar a conta para o mês original')

  // FECHAMENTO DAS AULAS POR ALUNO (independente do fechamento do mês da casa)
  const fotoHist = (alunoId, mes, revisao, acao, valor, itens, motivo) => ({ aluno_id: alunoId, mes, revisao, acao, valor_centavos: valor, itens, motivo: motivo || null, usuario: email })
  // semCobranca: fecha o mês sem cobrar nada. Mantém o recebimento anterior (se houver) para o cálculo da diferença.
  const fecharAluno = (alunoId, mes, { semCobranca = false, mensagem = null } = {}) => op(async () => {
    const atual = aulasFech.find((f) => f.aluno_id === alunoId && f.mes === mes)
    const foto = semCobranca ? { qtd_aulas: 0, minutos: 0, valor_centavos: 0, itens: [] } : montarFechamento(aulas, alunoId, mes)
    const revisao = atual ? (atual.status === 'reaberto' ? atual.revisao + 1 : atual.revisao) : 1
    const linha = { aluno_id: alunoId, mes, status: semCobranca ? 'sem_cobranca' : 'fechado', ...foto, mensagem, revisao, fechado_por: email, fechado_em: new Date().toISOString() }
    const r = await sb.from('aulas_fechamentos').upsert(linha, { onConflict: 'aluno_id,mes' })
    if (r.error) throw r.error
    const h = await sb.from('aulas_fechamentos_hist').insert(fotoHist(alunoId, mes, revisao, semCobranca ? 'sem_cobranca' : 'fechado', foto.valor_centavos, foto.itens))
    if (h.error) throw h.error
  }, ['aulas'], 'fechar o mês do aluno')
  const reabrirAluno = (alunoId, mes, motivo) => op(async () => {
    const atual = aulasFech.find((f) => f.aluno_id === alunoId && f.mes === mes)
    if (!atual) return
    const r = await sb.from('aulas_fechamentos').update({ status: 'reaberto' }).eq('id', atual.id)
    if (r.error) throw r.error
    const h = await sb.from('aulas_fechamentos_hist').insert(fotoHist(alunoId, mes, atual.revisao, 'reaberto', atual.valor_centavos, atual.itens || [], motivo))
    if (h.error) throw h.error
  }, ['aulas'], 'reabrir o mês do aluno')
  // Recebimento é separado da renda: não gera outra renda, só tira o valor de "a receber".
  const registrarRecebimento = (alunoId, mes, { data, valorCentavos }) => op(async () => {
    const r = await sb.from('aulas_fechamentos').update({ recebido: true, recebido_em: data, recebido_centavos: valorCentavos }).eq('aluno_id', alunoId).eq('mes', mes)
    if (r.error) throw r.error
  }, ['aulas'], 'registrar o recebimento')
  const desfazerRecebimento = (alunoId, mes) => op(async () => {
    const r = await sb.from('aulas_fechamentos').update({ recebido: false, recebido_em: null, recebido_centavos: null }).eq('aluno_id', alunoId).eq('mes', mes)
    if (r.error) throw r.error
  }, ['aulas'], 'desfazer o recebimento')
  const historicoFechamento = async (alunoId, mes) => {
    const r = await sb.from('aulas_fechamentos_hist').select('*').eq('aluno_id', alunoId).eq('mes', mes).order('quando')
    return r.error ? [] : r.data || []
  }
  // Período sem aula: grava a pausa e cancela (sem cobrança) as aulas previstas que caem nele. `cancelamentos`: [{ id, patch }].
  const criarPausa = (pausa, cancelamentos = []) => op(async () => {
    const r = await sb.from('aulas_pausas').insert(pausa)
    if (r.error) throw r.error
    const rs = await Promise.all(cancelamentos.map((c) => sb.from('aulas').update(c.patch).eq('id', c.id)))
    const erro = rs.find((x) => x.error)
    if (erro) throw erro.error
  }, ['aulas'], 'salvar o período sem aulas')
  const marcarFollowup = (id, feito = true) => op(async () => {
    const r = await sb.from('aulas_pausas').update({ followup_feito_em: feito ? hojeSP() : null }).eq('id', id)
    if (r.error) throw r.error
  }, ['aulas'], 'marcar o follow-up')
  const removerPausa = (id) => op(async () => {
    const r = await sb.from('aulas_pausas').delete().eq('id', id)
    if (r.error) throw r.error
  }, ['aulas'], 'remover o período sem aulas')
  const inserirAula = (aula) => op(async () => {
    const r = await sb.from('aulas').insert(aula)
    if (r.error) throw r.error
  }, ['aulas'], 'salvar a aula')
  const atualizarAula = (id, patch) => op(async () => {
    const r = await sb.from('aulas').update(patch).eq('id', id)
    if (r.error) throw r.error
  }, ['aulas'], 'salvar a aula')
  // Várias aulas de uma vez (ex.: marcar como realizadas): tudo ou nada na tela, uma recarga só.
  const atualizarAulasLote = (itens) => op(async () => {
    const rs = await Promise.all(itens.map((i) => sb.from('aulas').update(i.patch).eq('id', i.id)))
    const erro = rs.find((r) => r.error)
    if (erro) throw erro.error
  }, ['aulas'], 'salvar as aulas')
  const excluirAula = (id) => op(async () => {
    const r = await sb.from('aulas').delete().eq('id', id).eq('origem', 'avulsa').eq('status', 'prevista')
    if (r.error) throw r.error
  }, ['aulas'], 'excluir a aula')

  // METAS (reserva e objetivos). O saldo é a soma dos movimentos; tudo que muda dinheiro vai para a auditoria.
  const addMeta = (m) => op(async () => {
    const r = await sb.from('metas').insert(m)
    if (r.error) throw r.error
  }, ['metas'], 'salvar a meta')
  const updateMeta = (id, patch) => op(async () => {
    const r = await sb.from('metas').update(patch).eq('id', id)
    if (r.error) throw r.error
  }, ['metas'], 'salvar a meta')
  const registrarMovimentoMeta = async (mov) => {
    const ok = await op(async () => {
      const r = await sb.from('metas_movimentos').insert({ usuario: email, ...mov })
      if (r.error) throw r.error
    }, ['metas'])
    if (ok) await registrarAuditoria({ entidade: 'meta_movimento', entidade_id: mov.meta_id, acao: mov.tipo, depois: mov, motivo: mov.observacao || null })
    return ok
  }
  const delMovimentoMeta = async (mov) => {
    const ok = await op(async () => {
      const r = await sb.from('metas_movimentos').delete().eq('id', mov.id)
      if (r.error) throw r.error
    }, ['metas'])
    if (ok) await registrarAuditoria({ entidade: 'meta_movimento', entidade_id: mov.meta_id, acao: 'apagar_movimento', antes: mov })
    return ok
  }

  // DIVIDIDOS (parte de compra ou conta fixa que é de outra pessoa). Receber muda a receita da competência:
  // se o mês já está fechado, pede justificativa e registra na auditoria.
  const addDivisao = (data) => op(async () => {
    const r = await sb.from('divisoes').insert(data)
    if (r.error) throw r.error
  }, ['divisoes'], 'salvar a divisão')
  const delDivisao = async (divisao) => {
    const recebidos = divisoesRepasses.filter((x) => x.divisao_id === divisao.id)
    const fechados = recebidos.map((x) => x.mes).filter((m) => fechamentos.some((f) => f.mes === m && f.status === 'fechado'))
    let motivo = null
    if (fechados.length) {
      motivo = window.prompt(`Esta divisão tem valores recebidos em ${fechados.map(mesLabel).join(', ')} (mês fechado). Apagar muda os números dele.\n\nPara continuar, escreva o motivo:`)
      if (!motivo || motivo.trim().length < 3) return false
    }
    const ok = await op(async () => {
      const r = await sb.from('divisoes').delete().eq('id', divisao.id)
      if (r.error) throw r.error
    }, ['divisoes'], 'apagar a divisão')
    if (ok && motivo) await registrarAuditoria({ entidade: 'divisao', entidade_id: divisao.id, acao: 'apagar_em_mes_fechado', antes: { divisao, repasses: recebidos }, motivo: motivo.trim() })
    return ok
  }
  const marcarRepasse = async (divisaoId, mes, valor, recebidoEm) => {
    let motivo = null
    if (fechamentos.some((f) => f.mes === mes && f.status === 'fechado')) {
      motivo = window.prompt(`${mesLabel(mes)} já está fechado e receber muda a receita dele.\n\nPara continuar, escreva o motivo:`)
      if (!motivo || motivo.trim().length < 3) return false
    }
    const ok = await op(async () => {
      const r = await sb.from('divisoes_repasses').upsert(
        { divisao_id: divisaoId, mes, valor_recebido: valor, recebido_em: recebidoEm || hojeSP(), usuario: email },
        { onConflict: 'divisao_id,mes' }
      )
      if (r.error) throw r.error
    }, ['divisoes'], 'registrar o recebimento')
    if (ok && motivo) await registrarAuditoria({ entidade: 'divisao_repasse', entidade_id: `${divisaoId}|${mes}`, acao: 'receber_em_mes_fechado', depois: { valor }, motivo: motivo.trim() })
    return ok
  }
  const desmarcarRepasse = async (divisaoId, mes) => {
    let motivo = null
    if (fechamentos.some((f) => f.mes === mes && f.status === 'fechado')) {
      motivo = window.prompt(`${mesLabel(mes)} já está fechado e desfazer o recebimento muda a receita dele.\n\nPara continuar, escreva o motivo:`)
      if (!motivo || motivo.trim().length < 3) return false
    }
    const antes = divisoesRepasses.find((x) => x.divisao_id === divisaoId && x.mes === mes) || null
    const ok = await op(async () => {
      const r = await sb.from('divisoes_repasses').delete().eq('divisao_id', divisaoId).eq('mes', mes)
      if (r.error) throw r.error
    }, ['divisoes'], 'desfazer o recebimento')
    if (ok && motivo) await registrarAuditoria({ entidade: 'divisao_repasse', entidade_id: `${divisaoId}|${mes}`, acao: 'desfazer_recebimento_em_mes_fechado', antes, motivo: motivo.trim() })
    return ok
  }

  // CONFIG (chave/valor genérico)
  const definirConfig = (chave, valor) => op(async () => {
    const r = await sb.from('config').upsert({ chave, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'chave' })
    if (r.error) throw r.error
  }, ['config'], 'salvar a configuração')

  // ORÇAMENTOS (teto mensal por categoria; valor vazio/0 remove o teto)
  const definirOrcamento = (categoria, valor) => op(async () => {
    const r = valor > 0
      ? await sb.from('orcamentos').upsert({ categoria, valor, atualizado_em: new Date().toISOString() }, { onConflict: 'categoria' })
      : await sb.from('orcamentos').delete().eq('categoria', categoria)
    if (r.error) throw r.error
  }, ['orcamentos'], 'salvar o teto')
  const definirOrcamentos = (lista) => op(async () => {
    const agora = new Date().toISOString()
    const r = await sb.from('orcamentos').upsert(
      lista.map(({ categoria, valor }) => ({ categoria, valor, atualizado_em: agora })),
      { onConflict: 'categoria' }
    )
    if (r.error) throw r.error
  }, ['orcamentos'], 'salvar os tetos')

  // As regras aprendidas e os eventos em aberto do Inbox/Telegram também guardam o nome da categoria.
  // Sem acompanhar a mudança, a sugestão continuaria com o nome velho e o Confirmar falharia ("categoria inválida").
  // Só mexe nelas se a migration do Inbox já rodou (inboxOk).
  const ABERTOS = ['pendente', 'aguardando_dados']
  async function acompanharNoInbox({ categoria, subcategoria, novo, excluirRegras = false }) {
    if (!inboxOk) return
    const filtro = (q) => {
      let r = q.eq('categoria', categoria)
      if (subcategoria !== undefined) r = r.eq('subcategoria', subcategoria)
      return r
    }
    // Ao migrar para uma categoria que já existe, renomear regras bateria na chave única: apaga as velhas (o bot reaprende).
    const rr = excluirRegras
      ? await filtro(sb.from('regras_categorizacao').delete())
      : await filtro(sb.from('regras_categorizacao').update(novo))
    if (rr.error) throw rr.error
    const re = await filtro(sb.from('eventos_financeiros').update(novo)).in('status', ABERTOS)
    if (re.error) throw re.error
  }

  // CATEGORIAS
  const addCategoria = (nome) => op(async () => {
    const r = await sb.from('categorias').insert({ nome, subcategorias: [] })
    if (r.error) throw r.error
  }, null, 'salvar a categoria')
  const delCategoria = (id) => op(async () => {
    const nome = categorias.find((c) => c.id === id)?.nome
    const r = await sb.from('categorias').delete().eq('id', id)
    if (r.error) throw r.error
    // O teto de uma categoria removida não faz mais sentido.
    if (nome && orcamentosOk) await sb.from('orcamentos').delete().eq('categoria', nome)
  }, null, 'apagar a categoria')
  const renomearCategoria = (id, nomeAntigo, nomeNovo) => op(async () => {
    const r = await sb.from('categorias').update({ nome: nomeNovo }).eq('id', id)
    if (r.error) throw r.error
    const rc = await sb.from('compras').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
    if (rf.error) throw rf.error
    if (orcamentosOk) {
      const ro = await sb.from('orcamentos').update({ categoria: nomeNovo }).eq('categoria', nomeAntigo)
      if (ro.error) throw ro.error
    }
    await acompanharNoInbox({ categoria: nomeAntigo, novo: { categoria: nomeNovo } })
  })
  const addSubcategoria = (id, subcategorias) => op(async () => {
    const r = await sb.from('categorias').update({ subcategorias }).eq('id', id)
    if (r.error) throw r.error
  })
  const delSubcategoria = (id, subcategorias) => op(async () => {
    const r = await sb.from('categorias').update({ subcategorias }).eq('id', id)
    if (r.error) throw r.error
  })
  const renomearSubcategoria = (id, categoriaNome, subcategorias, subAntiga, subNova) => op(async () => {
    const r = await sb.from('categorias').update({ subcategorias }).eq('id', id)
    if (r.error) throw r.error
    const rc = await sb.from('compras')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rf.error) throw rf.error
    await acompanharNoInbox({ categoria: categoriaNome, subcategoria: subAntiga, novo: { subcategoria: subNova } })
  })
  // Usadas ao excluir uma categoria/subcategoria com movimentações: migra o
  // texto gravado em compras/fixos para o destino escolhido ANTES de remover
  // a opção antiga, para nunca deixar um registro órfão.
  const migrarCategoria = (categoriaAntiga, categoriaNova) => op(async () => {
    const rc = await sb.from('compras').update({ categoria: categoriaNova }).eq('categoria', categoriaAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ categoria: categoriaNova }).eq('categoria', categoriaAntiga)
    if (rf.error) throw rf.error
    await acompanharNoInbox({ categoria: categoriaAntiga, novo: { categoria: categoriaNova }, excluirRegras: true })
  })
  const migrarSubcategoria = (categoriaNome, subAntiga, subNova) => op(async () => {
    const rc = await sb.from('compras')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos')
      .update({ subcategoria: subNova })
      .eq('categoria', categoriaNome)
      .eq('subcategoria', subAntiga)
    if (rf.error) throw rf.error
    await acompanharNoInbox({ categoria: categoriaNome, subcategoria: subAntiga, novo: { subcategoria: subNova }, excluirRegras: true })
  })

  // PESSOAS
  const addPessoa = (nome, cor) => op(async () => {
    const r = await sb.from('pessoas').insert({ nome, cor })
    if (r.error) throw r.error
  }, null, 'salvar a pessoa')
  const delPessoa = (id) => op(async () => {
    const r = await sb.from('pessoas').delete().eq('id', id)
    if (r.error) throw r.error
  }, null, 'apagar a pessoa')
  const mudarCorPessoa = (id, cor) => op(async () => {
    const r = await sb.from('pessoas').update({ cor }).eq('id', id)
    if (r.error) throw r.error
  })
  const renomearPessoa = (id, nomeAntigo, nomeNovo) => op(async () => {
    const r = await sb.from('pessoas').update({ nome: nomeNovo }).eq('id', id)
    if (r.error) throw r.error
    const rc = await sb.from('compras').update({ pessoa: nomeNovo }).eq('pessoa', nomeAntigo)
    if (rc.error) throw rc.error
    const rf = await sb.from('fixos').update({ pessoa: nomeNovo }).eq('pessoa', nomeAntigo)
    if (rf.error) throw rf.error
    const rt = await sb.from('cartoes').update({ titular: nomeNovo }).eq('titular', nomeAntigo)
    if (rt.error) throw rt.error
  })

  // IMPORTAÇÃO DE FATURA (CSV)
  // Não usa `op`: o chamador precisa do erro para dar feedback próprio na tela de importação.
  async function importarTransacoes(rows) {
    const j = exigirJustificativa(rows) // importar para mês fechado também pede justificativa
    if (!j.ok) throw amigavel('Importação cancelada: o mês já está fechado e faltou o motivo.')
    setSyncState('syncing')
    try {
      const r = await sb.from('compras').insert(rows)
      if (r.error) throw r.error
    } catch (e) {
      setSyncState('error')
      throw e
    }
    if (j.meses.length) await registrarAuditoria({ entidade: 'compra', entidade_id: `${rows.length} compras`, acao: 'importar_em_mes_fechado', depois: { quantidade: rows.length }, motivo: `${j.motivo} (meses fechados: ${j.meses.join(', ')})` })
    setSyncState((await loadAll({ silent: true, quais: ['compras'] })) ? 'ok' : 'error')
  }

  // INBOX FINANCEIRO
  // Não usam `op`: a tela precisa do erro (ex.: "já foi resolvido") para mostrar no próprio cartão.
  async function comRecarga(fn, quais = ['inbox', 'compras']) {
    setSyncState('syncing')
    try {
      await fn()
    } catch (e) {
      setSyncState('error')
      throw e
    }
    setSyncState((await loadAll({ silent: true, quais })) ? 'ok' : 'error')
  }
  async function quemConfirma() {
    const { data } = await sb.auth.getSession()
    return data.session?.user?.email || null
  }
  // A validação e a criação da compra acontecem no banco (função confirmar_evento), de forma atômica.
  const confirmarEvento = (id, campos = {}) => comRecarga(async () => {
    const r = await sb.rpc('confirmar_evento', { p_evento: id, p_campos: campos, p_resolvido_por: await quemConfirma() })
    if (r.error) throw r.error
  })
  const vincularEvento = (id, compraId) => comRecarga(async () => {
    const r = await sb.rpc('vincular_evento', { p_evento: id, p_compra: compraId, p_resolvido_por: await quemConfirma() })
    if (r.error) throw r.error
  })
  const ignorarEvento = (id) => comRecarga(async () => {
    const r = await sb.from('eventos_financeiros')
      .update({ status: 'ignorado', resolvido_em: new Date().toISOString(), resolvido_por: await quemConfirma() })
      .eq('id', id)
      .in('status', ['pendente', 'aguardando_dados'])
    if (r.error) throw r.error
  })
  // Idempotente: (origem, id_externo) já existente é ignorado, não duplica.
  const adicionarEventos = (rows) => comRecarga(async () => {
    const r = await sb.from('eventos_financeiros').upsert(rows, { onConflict: 'origem,id_externo', ignoreDuplicates: true })
    if (r.error) throw r.error
  })
  // Semeia as regras com o histórico de compras, sem sobrescrever contagens que já existam.
  const adicionarRegras = (lista) => comRecarga(async () => {
    const r = await sb.from('regras_categorizacao')
      .upsert(lista, { onConflict: 'estabelecimento_chave,categoria,subcategoria', ignoreDuplicates: true })
    if (r.error) throw r.error
  })

  // REGRAS APRENDIDAS: editar ou esquecer vale daqui para frente; compras e eventos antigos não mudam.
  const atualizarRegra = async (regra, patch) => {
    const ok = await op(async () => {
      const r = await sb.from('regras_categorizacao').update(patch).eq('id', regra.id)
      if (r.error) throw r.error
    }, ['inbox'])
    if (ok) await registrarAuditoria({ entidade: 'regra', entidade_id: regra.id, acao: 'editar', antes: { categoria: regra.categoria, subcategoria: regra.subcategoria }, depois: patch })
    return ok
  }
  const esquecerRegra = async (regra) => {
    const ok = await op(async () => {
      const r = await sb.from('regras_categorizacao').delete().eq('id', regra.id)
      if (r.error) throw r.error
    }, ['inbox'])
    if (ok) await registrarAuditoria({ entidade: 'regra', entidade_id: regra.id, acao: 'esquecer', antes: regra })
    return ok
  }

  // AUTOMAÇÕES — TELEGRAM
  // O código nasce aqui; no banco vai só o hash. Vale 10 minutos e uma única vez.
  async function gerarPareamento(tipo, pessoa_id) {
    const codigo = gerarCodigo()
    const r = await sb.from('pareamentos').insert({ tipo, pessoa_id, codigo_hash: await hashCodigo(codigo) })
    if (r.error) throw r.error
    return { codigo, expira_em: Date.now() + 10 * 60 * 1000 }
  }
  const pausarIntegracao = (id, ativo) => op(async () => {
    const r = await sb.from('integracoes_telegram').update({ ativo }).eq('id', id)
    if (r.error) throw r.error
  })
  const desconectarIntegracao = (id) => op(async () => {
    const r = await sb.from('integracoes_telegram').delete().eq('id', id)
    if (r.error) throw r.error
  })

  // Cada conta fixa leva seus valores reais por mês em `valores` (não enumerável: não vai para backup, spread nem gravação).
  const fixosComValores = useMemo(() => anexarValores(fixos, fixosValores), [fixos, fixosValores])
  const inicioApp = inicioDoApp(config)
  // Renda efetiva = o que foi digitado + aulas particulares (somadas em extra_sabrina). `rendasManuais` é só o digitado (tela Renda, backup).
  const modoRenda = modoRendaAulas(config)
  const deslocamento = modoRenda === 'proximo' ? 1 : 0
  // por mês em que a aula acontece (telas de Aulas) e por mês em que entra na renda (Renda, disponível, resumos)
  const aulasMesBase = useMemo(() => (aulasOk ? aulasPorMes(alunos, aulas, aulasFech, { programacoes: aulasProg, pausas: aulasPausas, desde: deslocamento ? addMonths(nowYM(), -1) : nowYM() }) : {}), [aulasOk, alunos, aulas, aulasFech, aulasProg, aulasPausas, deslocamento])
  // Perfil com Atendimentos: o que se atende entra na renda do mês pelo mesmo caminho das aulas (e respeita 'mesmo mês'/'mês seguinte').
  const entradaMesBase = useMemo(() => (perfil.atendimentos ? somarPorMes(aulasMesBase, atendimentosPorMes(atendimentos, { pacotes, vendas: vendasProdutos })) : aulasMesBase), [aulasMesBase, atendimentos, pacotes, vendasProdutos])
  const aulasMes = useMemo(() => deslocarMeses(entradaMesBase, deslocamento), [entradaMesBase, deslocamento])
  const rendas = useMemo(() => rendasComAulas(rendasManuais, aulasMes), [rendasManuais, aulasMes])
  const aulasAReceber = useMemo(() => aulasAReceberPorMes(aulasMes), [aulasMes])

  return {
    email,
    integracoesTelegram, gerarPareamento, pausarIntegracao, desconectarIntegracao,
    eventos, regras, aliases, inboxOk,
    confirmarEvento, vincularEvento, ignorarEvento, adicionarEventos, adicionarRegras,
    inicioApp, cartoes, compras, rendas, rendasManuais, adiamentos, adiamentosOk, dividas, dividasOk, reservaFontes, reservaFontesOk, planosVida, planosVidaOk, clientes, servicos, atendimentos, atendimentosOk, pacotes, produtos, vendasProdutos, pacotesOk, aulasMes, aulasMesBase: entradaMesBase, modoRendaAulas: modoRenda, aulasAReceber, fixos: fixosComValores, fixosValores, fixosValoresOk, definirValorFixo, faturas, categorias, fixosPagamentos, comprasPagamentos, comprasPagamentosOk, fechamentos, fechamentosOk, metas, metasMovimentos, metasOk, rendaSazonal, rendaSazonalOk, alunos, aulasProg, aulas, aulasPrevInicial, aulasFech, aulasPausas, aulasPausasOk, aulasOk, divisoes, divisoesRepasses, divisoesOk, saldoAjustes, pessoas, orcamentos, orcamentosOk, config, configOk,
    loading, syncState, error, loadAll,
    addCartao, updateCartao, delCartao,
    addCompra, updateCompra, salvarDivisao, updateComprasLote, delCompra,
    upsertRenda,
    addFixo, updateFixo, delFixo,
    upsertFatura, updateFatura, delFatura,
    marcarFixoPago, marcarParcelaPaga, definirDataPagamentoFixo, definirDataPagamentoFatura, definirDataPagamentoParcela,
    juntarVersoes, apagarVersaoFixo, aviso, mostrarAviso, desfazivel, desfazerExclusao, dispensarDesfazer,
    fecharMes, reabrirMes, listarAuditoria, registrarAuditoria,
    definirAjusteSaldo, definirFatorSazonal, definirValorSazonal, definirSazonalEmLote,
    adiarConta, adiarVarias, desfazerAdiamento, salvarDivida, removerDivida,
    fecharAluno, reabrirAluno, registrarRecebimento, desfazerRecebimento, historicoFechamento,
    criarPausa, removerPausa, marcarFollowup, salvarFonteReserva, removerFonteReserva, salvarPlanoVida, salvarCliente, salvarServico, salvarAtendimento, removerCliente, removerServico, removerAtendimento, salvarPacote, removerPacote, salvarProduto, removerProduto, registrarVendaProduto, removerVendaProduto, salvarVendaProduto,
    criarAluno, atualizarAluno, mudarProgramacao, gerarAulas, inserirAula, atualizarAula, atualizarAulasLote, excluirAula,
    atualizarRegra, esquecerRegra,
    addDivisao, delDivisao, marcarRepasse, desmarcarRepasse,
    addMeta, updateMeta, registrarMovimentoMeta, delMovimentoMeta,
    definirOrcamento, definirOrcamentos, definirConfig,
    addCategoria, delCategoria, renomearCategoria,
    addSubcategoria, delSubcategoria, renomearSubcategoria,
    migrarCategoria, migrarSubcategoria,
    addPessoa, delPessoa, mudarCorPessoa, renomearPessoa,
    importarTransacoes,
  }
}
