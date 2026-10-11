import { Fragment, useMemo, useState } from 'react'
import { compilar } from '../lib/filtro'
import { mediaRecente } from '../lib/fixosVariaveis'
import { agruparVersoes, versoesRedundantes } from '../lib/fixosVersoes'
import { mesFechado } from '../lib/fechamento'
import ValorDoMes from './ValorDoMes'
import { detectarRecorrencias } from '../lib/recorrencias'
import { indexarAliases } from '../lib/estabelecimento'
import { paraCsv, baixarCsv } from '../lib/csvExport'
import { CampoBusca, ResumoFiltro, BotaoFiltros } from './FiltroLista'
import Secao from './Secao'
import { Pilulas } from './NavMes'
import { fmt, fmtK, mesLabel, nowYM, addMonths, fixosAtivos, corPessoa, nomeCasa, donoDoFixo } from '../lib/utils'

export default function Fixos({ store }) {
  const { fixos, categorias, pessoas, cartoes, addFixo, updateFixo, delFixo, fixosValoresOk, definirValorFixo, juntarVersoes, apagarVersaoFixo, fechamentos, registrarAuditoria } = store
  const [modal, setModal] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    nome: '', valor: '', pessoa: '', cartao_id: '',
    categoria: categorias[0]?.nome || '',
    subcategoria: categorias[0]?.subcategorias?.[0] || '',
    mes_fim: '', dia_vencimento: '', variavel: false, aplicarDesde: 'mes',
  })
  const [filtroPessoa, setFiltroPessoa] = useState('') // '' = todas
  const [busca, setBusca] = useState('')
  const [mesesAbertos, setMesesAbertos] = useState({}) // contas com o painel "valores mês a mês" aberto
  const [filtroStatus, setFiltroStatus] = useState('') // 'ativas' | 'inativas'
  const [filtroPagamento, setFiltroPagamento] = useState('') // 'cartao' | 'avulsa' | 'variavel'
  const [saving, setSaving] = useState(false)
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)
  const [agrupar, setAgrupar] = useState('pessoa') // 'pessoa' | 'categoria' | ''
  const [secFechadas, setSecFechadas] = useState({})
  const mesAtual = nowYM()
  const [ignoradas, setIgnoradas] = useState(() => { try { return JSON.parse(localStorage.getItem('recorrencias_ignoradas') || '[]') } catch { return [] } })
  const ignorar = (chave) => { const l = [...ignoradas, chave]; setIgnoradas(l); try { localStorage.setItem('recorrencias_ignoradas', JSON.stringify(l)) } catch { /* sem armazenamento */ } }
  const recorrentes = useMemo(() => detectarRecorrencias(store.compras, fixos, mesAtual, { aliases: indexarAliases(store.aliases || []), ignoradas }), [store.compras, store.aliases, fixos, mesAtual, ignoradas])
  async function cadastrarRecorrente(r) {
    // se a cobrança deste mês já foi lançada como compra, a conta fixa só começa no mês que vem (senão contaria duas vezes)
    const inicio = r.meses.includes(mesAtual) ? addMonths(mesAtual, 1) : mesAtual
    if (!confirm(`Cadastrar "${r.nome}" como conta fixa de ${fmt(r.ultimo)}${r.valorFixo || r.aumento ? '' : ' (valor variável, estimativa pela última cobrança)'}?\n\nComeça em ${mesLabel(inicio)}${r.cartao_id ? ' e passa a contar dentro da fatura do cartão' : ''}. As compras já lançadas continuam como estão.`)) return
    await addFixo({
      nome: r.nome, valor: r.ultimo, pessoa: r.pessoa || null, categoria: r.categoria, subcategoria: r.subcategoria, ativo: true, mes_inicio: inicio,
      ...(colunaCartaoOk && r.cartao_id ? { cartao_id: r.cartao_id } : {}),
      ...(colunaVariavelOk && !r.valorFixo && !r.aumento ? { variavel: true } : {}),
    })
  }
  const casa = nomeCasa(pessoas)
  // Sem a coluna no banco (fixos_cartao.sql não rodou) o campo fica desligado, para não quebrar o salvamento.
  const colunaVariavelOk = fixosValoresOk && (fixos.length === 0 || 'variavel' in fixos[0])
  const colunaCartaoOk = fixos.length === 0 || 'cartao_id' in fixos[0]
  const cartaoEscolhido = cartoes.find((c) => c.id === form.cartao_id)
  const casaCadastrada = pessoas.some((p) => p.nome === casa)
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const subcats = categorias.find((c) => c.nome === form.categoria)?.subcategorias || []

  function abrir(fx) {
    if (fx) {
      setForm({
        nome: fx.nome, valor: fx.valor, pessoa: fx.pessoa || (casaCadastrada ? casa : ''), cartao_id: fx.cartao_id || '',
        categoria: fx.categoria || categorias[0]?.nome || '',
        subcategoria: fx.subcategoria || categorias.find((c) => c.nome === fx.categoria)?.subcategorias?.[0] || '',
        mes_fim: fx.mes_fim || '', dia_vencimento: fx.dia_vencimento || '', variavel: !!fx.variavel, aplicarDesde: 'mes',
      })
      setEditId(fx.id)
    } else {
      setForm({
        nome: '', valor: '', pessoa: casaCadastrada ? casa : '', cartao_id: '',
        categoria: categorias[0]?.nome || '',
        subcategoria: categorias[0]?.subcategorias?.[0] || '',
        mes_fim: '', dia_vencimento: '', variavel: false, aplicarDesde: 'mes',
      })
      setEditId(null)
    }
    setModal(true)
  }

  async function salvar() {
    if (!form.nome || !form.valor || !form.categoria) return
    setSaving(true)
    const dados = {
      nome: form.nome,
      valor: Number(form.valor),
      pessoa: form.pessoa || null,
      ...(colunaCartaoOk ? { cartao_id: form.cartao_id || null } : {}),
      ...(colunaVariavelOk ? { variavel: !!form.variavel } : {}),
      categoria: form.categoria,
      subcategoria: form.subcategoria,
      mes_fim: form.mes_fim || null,
      dia_vencimento: form.dia_vencimento ? Number(form.dia_vencimento) : null,
    }
    let ok
    const antigo = editId && fixos.find((f) => f.id === editId)
    const mudouValor = antigo && Number(antigo.valor) !== dados.valor
    const jaComecou = antigo && (!antigo.mes_inicio || antigo.mes_inicio < mesAtual)
    const vigente = antigo && (!antigo.mes_fim || antigo.mes_fim >= mesAtual)
    // Mudar o valor de meses que já passaram (período antigo ou "para todos os meses") altera meses fechados? Pede motivo e audita.
    const mudaPassado = mudouValor && jaComecou && (!vigente || antigo.variavel || form.variavel || form.aplicarDesde === 'todos')
    let motivo = null
    if (mudaPassado) {
      const fim = antigo.mes_fim && antigo.mes_fim < mesAtual ? antigo.mes_fim : addMonths(mesAtual, -1)
      const fechados = []
      for (let m = antigo.mes_inicio || addMonths(mesAtual, -24); m <= fim && fechados.length < 120; m = addMonths(m, 1)) if (mesFechado(fechamentos, m)) fechados.push(m)
      if (fechados.length && !antigo.variavel && !form.variavel) {
        motivo = window.prompt(`Esta mudança de valor atinge ${fechados.length === 1 ? 'um mês já fechado' : `${fechados.length} meses já fechados`} (${fechados.slice(0, 3).map(mesLabel).join(', ')}${fechados.length > 3 ? '…' : ''}) e muda os números ${fechados.length === 1 ? 'dele' : 'deles'}.\n\nPara continuar, escreva o motivo:`)
        if (!motivo || motivo.trim().length < 3) { setSaving(false); return }
      }
    }
    // Conta de valor variável: a estimativa só muda daqui para frente e NUNCA cria outra linha (os valores reais de cada mês ficam como estão).
    // Conta de valor fixo: se o valor mudou, a pessoa escolhe no formulário se vale "a partir deste mês" (guarda o histórico) ou "para todos os meses".
    if (mudouValor && jaComecou && vigente && !antigo.variavel && !form.variavel && form.aplicarDesde === 'mes') {
      ok = await addFixo({ ...dados, ativo: true, mes_inicio: mesAtual })
      if (ok) ok = await updateFixo(editId, { mes_fim: addMonths(mesAtual, -1) })
    } else {
      ok = editId ? await updateFixo(editId, dados) : await addFixo({ ...dados, ativo: true })
      if (ok && motivo) await registrarAuditoria({ entidade: 'fixo', entidade_id: editId, acao: 'editar_valor_em_mes_fechado', antes: { valor: antigo.valor }, depois: { valor: dados.valor }, motivo: motivo.trim() })
    }
    setSaving(false)
    if (ok) setModal(false) // se deu erro, mantém o formulário
  }

  const { combina } = compilar(busca)
  const filtroAtivo = !!(busca.trim() || filtroPessoa || filtroStatus || filtroPagamento)
  const limparFiltros = () => { setBusca(''); setFiltroPessoa(''); setFiltroStatus(''); setFiltroPagamento('') }
  const ativosAgoraTodos = fixosAtivos(fixos, mesAtual)
  const estaAtivo = (f) => ativosAgoraTodos.some((x) => x.id === f.id)
  const doFiltro = (f) => {
    if (filtroPessoa && donoDoFixo(f, pessoas) !== filtroPessoa) return false
    if (filtroStatus === 'ativas' && !estaAtivo(f)) return false
    if (filtroStatus === 'inativas' && estaAtivo(f)) return false
    if (filtroPagamento === 'cartao' && !f.cartao_id) return false
    if (filtroPagamento === 'avulsa' && f.cartao_id) return false
    if (filtroPagamento === 'variavel' && !f.variavel) return false
    const atual = ativosAgoraTodos.find((x) => x.id === f.id)
    return combina({
      texto: [f.nome, f.categoria, f.subcategoria, donoDoFixo(f, pessoas), cartoes.find((c) => c.id === f.cartao_id)?.nome, f.variavel ? 'variavel' : ''].filter(Boolean).join(' '),
      valor: [Number(f.valor), atual ? Number(atual.valor) : null],
    })
  }
  // Versões de uma mesma conta (valor que mudou ao longo do tempo) viram uma linha só; as anteriores ficam no histórico.
  const grupos = agruparVersoes(fixos, mesAtual).filter((g) => doFiltro(g.principal))
  const fixosVisiveis = grupos.map((g) => g.principal)
  const ativosAgora = fixosAtivos(fixosVisiveis, mesAtual)
  async function alternarAtivo(f, encerrado) {
    if (f.ativo && !encerrado) {
      if (!confirm(`Pausar "${f.nome}" a partir de ${mesLabel(mesAtual)}? Os meses anteriores continuam contando.`)) return
      await updateFixo(f.id, { mes_fim: addMonths(mesAtual, -1) })
    } else {
      if (!confirm(`Reativar "${f.nome}"? Ela volta a contar em todos os meses desde o início, inclusive nos que já passaram.`)) return
      await updateFixo(f.id, { ativo: true, mes_fim: null })
    }
  }

  // Seções: por pessoa (dono), por categoria ou lista única, com o total/mês de cada uma.
  const valorAgora = (f) => Number(ativosAgora.find((x) => x.id === f.id)?.valor || 0)
  const secoes = useMemo(() => {
    if (!agrupar) return grupos.length ? [{ chave: 'todas', titulo: 'Contas fixas', itens: grupos }] : []
    const mapa = new Map()
    for (const g of grupos) {
      const chave = agrupar === 'pessoa' ? donoDoFixo(g.principal, pessoas) : (g.principal.categoria || 'Sem categoria')
      if (!mapa.has(chave)) mapa.set(chave, [])
      mapa.get(chave).push(g)
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([chave, itens]) => ({ chave, titulo: chave, itens }))
  }, [grupos, agrupar, pessoas])
  const totalSecao = (sec) => sec.itens.reduce((t, g) => t + valorAgora(g.principal), 0)
  const secAberta = (chave) => secFechadas[chave] !== true
  const nFiltros = [filtroPessoa, filtroStatus, filtroPagamento].filter(Boolean).length
  const qtdVariaveis = ativosAgora.filter((f) => f.variavel).length
  const totalCartao = ativosAgora.filter((f) => f.cartao_id && cartoes.some((c) => c.id === f.cartao_id)).reduce((t, f) => t + Number(f.valor), 0)

  const total = ativosAgora.reduce((s, f) => s + Number(f.valor), 0)
  const ok = form.nome && form.valor && form.categoria && !saving

  const linhaGrupo = (grupo) => {
    const { principal: f, versoes } = grupo
    const redundantes = versoesRedundantes(grupo)
    const encerrado = f.mes_fim && f.mes_fim < mesAtual
    // meses em que a conta vale (últimos 12 até o próximo), cada um com a versão que vale nele
    const mesesDaConta = f.variavel ? Array.from({ length: 13 }, (_, i) => addMonths(mesAtual, i - 11)).map((m) => ({ m, v: fixosAtivos(versoes, m)[0] })).filter((x) => x.v).reverse() : []
    const painelAberto = !!mesesAbertos[f.id]
    return (
      <Fragment key={f.id}>
      <tr>
        <td className="nome-cel" style={{ fontWeight: 500 }}>
          {f.nome}
          {f.variavel && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: 10 }}>valor variável</span>}
          {redundantes.length > 0 && (
            <div className="alert alert-amber" style={{ margin: '6px 0 0', padding: '6px 10px', fontSize: 11, fontWeight: 400 }}>
              {redundantes.length} cópia{redundantes.length > 1 ? 's' : ''} repetida{redundantes.length > 1 ? 's' : ''} desta conta (o total já conta só uma).{' '}
              <button className="link-btn" onClick={async () => { if (confirm(`Juntar as cópias de "${f.nome}"?\n\nFica só a versão em vigor (${fmt(f.valor)}); os valores reais e pagamentos das cópias passam para ela. Não dá para desfazer.`)) await juntarVersoes(f.id, redundantes.map((v) => v.id)) }}>Juntar agora</button>
            </div>
          )}
          {versoes.length > 1 && (
            <details style={{ fontWeight: 400, marginTop: 4 }}>
              <summary style={{ fontSize: 11, color: 'var(--text3)', cursor: 'pointer' }}>histórico de valores ({versoes.length - redundantes.length} {versoes.length - redundantes.length === 1 ? 'período' : 'períodos'})</summary>
              <table style={{ marginTop: 4, width: 'auto' }}>
                <tbody>
                  {[...versoes].filter((v) => !redundantes.some((r) => r.id === v.id)).reverse().map((v) => (
                    <tr key={v.id}>
                      <td style={{ fontSize: 11, color: 'var(--text2)', padding: '2px 14px 2px 0', border: 0 }}>
                        {v.mes_inicio ? `de ${mesLabel(v.mes_inicio)}` : 'desde o início'}{v.mes_fim ? ` até ${mesLabel(v.mes_fim)}` : ' em diante'}
                      </td>
                      <td className="mono" style={{ fontSize: 11, padding: '2px 10px 2px 0', border: 0 }}>{fmt(v.valor)}{v.id === f.id && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 9 }}>em vigor</span>}</td>
                      <td style={{ border: 0, padding: '2px 0', whiteSpace: 'nowrap' }}>
                        {v.id !== f.id && <>
                          <button className="link-btn" onClick={() => abrir(v)}>editar</button>{' · '}
                          <button className="link-btn" onClick={() => { if (confirm(`Apagar o período ${v.mes_inicio ? 'de ' + mesLabel(v.mes_inicio) : 'desde o início'}${v.mes_fim ? ' até ' + mesLabel(v.mes_fim) : ''} (${fmt(v.valor)})?\n\nOs meses desse período deixam de ter essa conta. Dá para desfazer logo depois.`)) apagarVersaoFixo(v) }}>apagar</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          {f.mes_fim && (
            <div style={{ fontSize: 11, color: encerrado ? 'var(--text3)' : 'var(--amber)', marginTop: 2, fontWeight: 400 }}>
              {encerrado ? `encerrado em ${mesLabel(f.mes_fim)}` : `até ${mesLabel(f.mes_fim)}`}
            </div>
          )}
          <div className="so-mobile">
            {donoDoFixo(f, pessoas)} · {f.categoria || 'sem categoria'}{f.subcategoria ? ` › ${f.subcategoria}` : ''}
            {f.cartao_id && cartoes.find((c) => c.id === f.cartao_id) ? ` · no cartão ${cartoes.find((c) => c.id === f.cartao_id).nome}` : f.dia_vencimento ? ` · vence dia ${f.dia_vencimento}` : ''}
            {' · '}{!f.ativo ? 'pausado' : encerrado ? 'encerrado' : 'ativo'}
          </div>
        </td>
        <td className="col-opc">
          <span className={`badge badge-${corPessoa(pessoas, donoDoFixo(f, pessoas))}`}>{donoDoFixo(f, pessoas)}</span>
        </td>
        <td className="col-opc" style={{ fontSize: 12, color: 'var(--text2)' }}>
          {f.categoria ? (
            <>
              {f.categoria}<br />
              <span style={{ color: 'var(--text3)' }}>{f.subcategoria}</span>
            </>
          ) : (
            <span style={{ color: 'var(--text3)' }}>sem categoria</span>
          )}
          {f.cartao_id && cartoes.find((c) => c.id === f.cartao_id) ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>no cartão {cartoes.find((c) => c.id === f.cartao_id).nome}</div>
          ) : f.dia_vencimento ? (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>vence dia {f.dia_vencimento}</div>
          ) : null}
        </td>
        <td className="valor-cel" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>
          {f.variavel && !encerrado && f.ativo && ativosAgora.find((x) => x.id === f.id) ? (
            <ValorDoMes fixo={ativosAgora.find((x) => x.id === f.id)} mes={mesAtual} real={f.valores?.[mesAtual]} definirValorFixo={definirValorFixo} />
          ) : fmt(ativosAgora.find((x) => x.id === f.id)?.valor ?? f.valor)}
        </td>
        <td className="col-opc" style={{ textAlign: 'center' }}>
          <button
            className={`badge ${f.ativo && !encerrado ? 'badge-green' : 'badge-gray'}`}
            style={{ cursor: 'pointer' }}
            onClick={() => alternarAtivo(f, encerrado)}
          >
            {!f.ativo ? 'Pausado' : encerrado ? 'Encerrado' : 'Ativo'}
          </button>
        </td>
        <td className="acoes-cel" style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-ghost btn-sm so-mobile" style={{ color: 'var(--text2)', fontSize: 12 }} onClick={() => alternarAtivo(f, encerrado)}>{!f.ativo || encerrado ? 'Reativar' : 'Pausar'}</button>
          {f.variavel && <button className="btn btn-ghost btn-sm" onClick={() => setMesesAbertos((a) => ({ ...a, [f.id]: a[f.id] ? false : 'curto' }))} aria-expanded={painelAberto} title="Ver, corrigir ou apagar o valor real de cada mês">{painelAberto ? '▾' : '▸'} Meses</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => abrir(f)}>Editar</button>
          <button className="btn btn-danger" onClick={async () => { if (confirm(`Remover "${f.nome}"${versoes.length > 1 ? ` e o histórico de valores (${versoes.length} versões)` : ''}?`)) for (const v of versoes) await delFixo(v.id) }}>×</button>
        </td>
      </tr>
      {painelAberto && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--bg3)', padding: '12px 16px' }}>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.6 }}>
              <b>Valor real de cada mês.</b> Digite para lançar ou corrigir; <b>"usar estimativa"</b> apaga o valor daquele mês. Só o mês escolhido muda. Meses já fechados ficam travados até você pedir para alterar.
            </div>
            <table style={{ width: 'auto', minWidth: 360 }}>
              <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Valor</th><th /></tr></thead>
              <tbody>
                {(mesesAbertos[f.id] === 'todos' ? mesesDaConta : mesesDaConta.slice(0, 6)).map(({ m, v }) => (
                  <tr key={m}>
                    <td className="mono" style={{ fontSize: 12 }}>{mesLabel(m)}{m === mesAtual && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 9 }}>este mês</span>}</td>
                    <td style={{ textAlign: 'right' }}><ValorDoMes fixo={v} mes={m} real={v.valores?.[m]} definirValorFixo={definirValorFixo} compacto fechado={mesFechado(fechamentos, m)} /></td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>{v.valores?.[m] != null ? 'real' : 'estimado'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {mesesDaConta.length > 6 && (
              <button className="link-btn" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setMesesAbertos((a) => ({ ...a, [f.id]: a[f.id] === 'todos' ? 'curto' : 'todos' }))}>
                {mesesAbertos[f.id] === 'todos' ? 'mostrar só os 6 meses mais recentes' : `mostrar os ${mesesDaConta.length} meses`}
              </button>
            )}
          </td>
        </tr>
      )}
      </Fragment>
    )
  }

  return (
    <div className="page">
      {modal && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setModal(false) }}>
          <div className="modal">
            <div className="modal-title">{editId ? 'Editar fixo' : 'Novo gasto fixo'}</div>
            <div className="form-row">
              <div className="form-group">
                <label>Nome</label>
                <input placeholder="Ex: Condomínio" value={form.nome} onChange={s('nome')} autoFocus />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>De quem é</label>
                <select value={form.pessoa} onChange={s('pessoa')}>
                  {!casaCadastrada && <option value="">{casa} (de todos)</option>}
                  {form.pessoa && !pessoas.some((p) => p.nome === form.pessoa) && <option value={form.pessoa}>{form.pessoa}</option>}
                  {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{form.variavel ? 'Valor estimado (R$)' : 'Valor mensal (R$)'}</label>
                <input type="number" step="0.01" value={form.valor} onChange={s('valor')} placeholder="0,00" />
              </div>
            </div>
            {editId && !form.variavel && (() => {
              const antigo = fixos.find((x) => x.id === editId)
              const muda = antigo && !antigo.variavel && Number(antigo.valor) !== Number(form.valor) && form.valor !== '' && (!antigo.mes_inicio || antigo.mes_inicio < mesAtual) && (!antigo.mes_fim || antigo.mes_fim >= mesAtual)
              if (!muda) return null
              return (
                <div className="alert alert-blue" style={{ lineHeight: 1.8 }}>
                  <b>O valor mudou de {fmt(antigo.valor)} para {fmt(Number(form.valor))}. Vale para quais meses?</b>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="radio" name="desde" checked={form.aplicarDesde === 'mes'} onChange={() => setForm((f) => ({ ...f, aplicarDesde: 'mes' }))} style={{ marginTop: 5, width: 16, height: 16, padding: 0, flex: '0 0 auto' }} />
                    <span>A partir de <b>{mesLabel(mesAtual)}</b> — os meses anteriores continuam com {fmt(antigo.valor)} (o histórico fica guardado na própria conta).</span>
                  </label>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input type="radio" name="desde" checked={form.aplicarDesde === 'todos'} onChange={() => setForm((f) => ({ ...f, aplicarDesde: 'todos' }))} style={{ marginTop: 5, width: 16, height: 16, padding: 0, flex: '0 0 auto' }} />
                    <span>Para <b>todos os meses</b>, inclusive os passados (use só para corrigir um valor que estava errado).</span>
                  </label>
                </div>
              )
            })()}
            <div className="form-row cols2">
              <div className="form-group">
                <label>Categoria</label>
                <select
                  value={form.categoria}
                  onChange={(e) => {
                    const cat = e.target.value
                    const subs = categorias.find((c) => c.nome === cat)?.subcategorias || []
                    setForm((p) => ({ ...p, categoria: cat, subcategoria: subs[0] || '' }))
                  }}
                >
                  <option value="">Selecione...</option>
                  {categorias.map((c) => <option key={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Subcategoria</label>
                <select value={form.subcategoria} onChange={s('subcategoria')} disabled={!form.categoria}>
                  {subcats.map((sub) => <option key={sub}>{sub}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Dia do vencimento (opcional)</label>
                <input type="number" min="1" max="31" value={form.dia_vencimento} onChange={s('dia_vencimento')} placeholder="Ex: 10" />
              </div>
              <div className="form-group">
                <label>Termina em (opcional)</label>
                <input type="month" value={form.mes_fim} onChange={s('mes_fim')} min={mesAtual} />
              </div>
            </div>
            <div className="form-row">
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={!!form.variavel} disabled={!colunaVariavelOk} onChange={(e) => setForm((f) => ({ ...f, variavel: e.target.checked }))} />
                O valor muda todo mês (energia, condomínio, água...)
              </label>
            </div>
            {form.variavel && editId && (() => {
              const m = mediaRecente(fixos.find((x) => x.id === editId), mesAtual)
              if (!m) return <div className="alert alert-blue">Ainda não há valores reais informados — quando você informar os primeiros meses, o app sugere a média aqui.</div>
              return (
                <div className="alert alert-green">
                  Média dos últimos {m.meses} mese{m.meses > 1 ? 's' : ''} informados: <b>{fmt(m.media)}</b>.{' '}
                  {Number(form.valor) !== m.media && <button className="link-btn" onClick={() => setForm((f) => ({ ...f, valor: m.media }))}>Usar como estimativa</button>}
                </div>
              )
            })()}
            {form.variavel && (
              <div className="alert alert-blue">
                O valor acima é só a <b>estimativa</b> (usada nos meses em que você ainda não informou o valor real). Quando a conta chegar, digite o valor real do mês direto na lista ou em <b>Pagamentos</b> — só aquele mês muda. Mudar a estimativa não mexe nos valores reais já informados.
              </div>
            )}
            {!colunaVariavelOk && (
              <div className="alert alert-amber">Para usar valor variável, rode o arquivo <code>inbox/20_fixos_variaveis.sql</code> no Supabase e recarregue a página.</div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label>Paga no cartão de crédito? (opcional)</label>
                <select value={form.cartao_id} onChange={s('cartao_id')} disabled={!colunaCartaoOk}>
                  <option value="">Não — boleto, Pix, débito ou outro</option>
                  {cartoes.filter((c) => c.ativo !== false || c.id === form.cartao_id).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
            </div>
            {!colunaCartaoOk && (
              <div className="alert alert-amber">Para usar o cartão aqui, rode o arquivo <code>fixos_cartao.sql</code> no Supabase e recarregue a página.</div>
            )}
            {cartaoEscolhido && (
              <div className="alert alert-blue">
                Passa a contar <b>dentro da fatura do {cartaoEscolhido.nome}</b> e sai da lista de contas a pagar à parte (você paga quando pagar a fatura).
                Se essa cobrança já é lançada como compra no cartão ou vem na fatura importada, <b>não marque aqui</b>, para não contar duas vezes.
              </div>
            )}
            {form.mes_fim && (
              <div className="alert alert-blue" style={{ marginBottom: 0 }}>
                Última cobrança em {mesLabel(form.mes_fim)} — a partir do mês seguinte, some sozinho do comprometido e da lista de Pagamentos.
              </div>
            )}
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={!ok}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="metric-grid">
        <div className="metric"><div className="metric-label">Total por mês{filtroPessoa ? ` · ${filtroPessoa}` : ''}</div><div className="metric-val amber">{fmtK(total)}</div></div>
        <div className="metric"><div className="metric-label">Pagas no cartão</div><div className="metric-val">{fmtK(totalCartao)}</div></div>
        <div className="metric"><div className="metric-label">Pagas à parte</div><div className="metric-val">{fmtK(total - totalCartao)}</div></div>
        <div className="metric"><div className="metric-label">Valor variável</div><div className="metric-val">{qtdVariaveis} {qtdVariaveis === 1 ? 'conta' : 'contas'}</div></div>
      </div>

      <div className="toolbar">
        <button className="btn btn-primary tb-primario" onClick={() => abrir(null)}>+ Novo fixo</button>
        <CampoBusca valor={busca} onChange={setBusca} />
        <BotaoFiltros aberto={filtrosAbertos} onToggle={() => setFiltrosAbertos((v) => !v)} ativos={nFiltros} />
        <button className="btn btn-ghost btn-sm tb-sec" disabled={!fixosVisiveis.length} title="Baixa a lista que está na tela (com os filtros) em CSV, para abrir no Excel"
          onClick={() => baixarCsv('contas-fixas', paraCsv([
            { titulo: 'Nome', valor: (f) => f.nome }, { titulo: 'De quem', valor: (f) => donoDoFixo(f, pessoas) }, { titulo: 'Categoria', valor: (f) => f.categoria },
            { titulo: 'Subcategoria', valor: (f) => f.subcategoria }, { titulo: 'Valor (mês atual)', valor: (f) => Number(ativosAgora.find((x) => x.id === f.id)?.valor ?? f.valor) },
            { titulo: 'Valor variável', valor: (f) => (f.variavel ? 'sim' : 'não') }, { titulo: 'Cartão', valor: (f) => cartoes.find((c) => c.id === f.cartao_id)?.nome || '' },
            { titulo: 'Vencimento (dia)', valor: (f) => f.dia_vencimento || '' }, { titulo: 'Início', valor: (f) => f.mes_inicio || '' }, { titulo: 'Fim', valor: (f) => f.mes_fim || '' },
          ], fixosVisiveis))}>Exportar CSV</button>
      </div>
      {filtrosAbertos && (
        <div className="filtros-painel">
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)} aria-label="Filtrar por situação">
          <option value="">Ativas e encerradas</option>
          <option value="ativas">Só as ativas hoje</option>
          <option value="inativas">Pausadas / encerradas</option>
          </select>
          <select value={filtroPagamento} onChange={(e) => setFiltroPagamento(e.target.value)} aria-label="Filtrar por forma de pagamento">
          <option value="">Todas as formas</option>
          <option value="cartao">Pagas no cartão</option>
          <option value="avulsa">Pagas à parte</option>
          <option value="variavel">Valor variável</option>
          </select>
          <select value={filtroPessoa} onChange={(e) => setFiltroPessoa(e.target.value)} aria-label="Filtrar por pessoa">
          <option value="">Todas as pessoas</option>
          {pessoas.map((p) => <option key={p.id} value={p.nome}>{p.nome}</option>)}
          {!casaCadastrada && <option value={casa}>{casa}</option>}
          </select>
        </div>
      )}
      <div className="pag-topo" style={{ marginBottom: 12 }}>
        <Pilulas rotulo="Agrupar contas" valor={agrupar} onChange={setAgrupar} opcoes={[['pessoa', 'Por pessoa'], ['categoria', 'Por categoria'], ['', 'Lista']]} />
      </div>

      {recorrentes.length > 0 && (
        <details className="card" style={{ padding: '10px 14px', marginBottom: 14 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13 }}>
            <b>{recorrentes.length} cobrança{recorrentes.length > 1 ? 's' : ''} recorrente{recorrentes.length > 1 ? 's' : ''} detectada{recorrentes.length > 1 ? 's' : ''}</b>
            <span style={{ color: 'var(--text3)' }}> — aparecem todo mês nas compras e ainda não são contas fixas</span>
            {recorrentes.some((r) => r.aumento) && <span className="badge badge-amber" style={{ marginLeft: 8, fontSize: 10 }}>preço subiu</span>}
          </summary>
          <table style={{ marginTop: 10 }}>
            <thead><tr><th>Cobrança</th><th style={{ textAlign: 'right' }}>Última</th><th>Histórico</th><th /></tr></thead>
            <tbody>
              {recorrentes.map((r) => (
                <tr key={r.chave + r.cartao_id}>
                  <td>{r.nome}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{r.categoria}{!r.valorFixo && !r.aumento && ' · valor varia'}</div></td>
                  <td style={{ textAlign: 'right' }} className="mono">
                    {fmt(r.ultimo)}
                    {r.aumento && <div style={{ fontSize: 11, color: 'var(--amber)' }}>↑ {r.aumento.pct}% (era {fmt(r.aumento.de)})</div>}
                  </td>
                  <td style={{ fontSize: 12, color: 'var(--text2)' }}>{r.meses.length} meses seguidos · média {fmt(r.medio)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-primary btn-sm" onClick={() => cadastrarRecorrente(r)}>Cadastrar como conta fixa</button>{' '}
                    <button className="btn btn-ghost btn-sm" onClick={() => ignorar(r.chave)}>Ignorar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
      <ResumoFiltro ativo={filtroAtivo} mostrando={fixosVisiveis.length} total={fixos.length} onLimpar={limparFiltros} />
      {secoes.length === 0 ? (
        <div className="card">
          <div className="empty">{fixos.length === 0 ? 'Nenhum gasto fixo cadastrado.' : 'Nenhuma conta fixa com esses filtros.\nTente outro termo ou clique em "Limpar filtros".'}</div>
        </div>
      ) : secoes.map((sec) => (
        <Secao key={sec.chave} titulo={sec.titulo} info={`${sec.itens.length} ${sec.itens.length === 1 ? 'conta' : 'contas'}`} destaque={`${fmt(totalSecao(sec))}/mês`}
          aberto={secAberta(sec.chave)} onToggle={() => setSecFechadas((m) => ({ ...m, [sec.chave]: secAberta(sec.chave) }))}>
          <table className="tabela-compacta lista-cartoes tabela-fixa tabela-fixos">
            <thead>
              <tr>
                <th>Nome</th>
                <th className="col-opc">De quem</th>
                <th className="col-opc">Categoria</th>
                <th style={{ textAlign: 'right' }} title="Contas de valor variável mostram a estimativa até você informar o valor real">Valor/mês</th>
                <th className="col-opc" style={{ textAlign: 'center' }}>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sec.itens.map(linhaGrupo)}
            </tbody>
          </table>
        </Secao>
      ))}
    </div>
  )
}
