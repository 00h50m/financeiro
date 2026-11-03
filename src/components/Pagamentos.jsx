import { useEffect, useState } from 'react'
import { compilar } from '../lib/filtro'
import { mediaRecente, pendenciasValorVariavel } from '../lib/fixosVariaveis'
import ValorDoMes from './ValorDoMes'
import Secao from './Secao'
import { pagamentosPorCategoria } from '../lib/pagamentosCategoria'
import { reaisParaCentavos } from '../lib/aulas'
import ModalAdiar from './ModalAdiar'
import ModalDivida from './ModalDivida'
import NavMes from './NavMes'
import { CampoBusca, ResumoFiltro } from './FiltroLista'
import { fmt, mesLabel, nowYM, addMonths, totalRenda, tituloCompra, hojeSP } from '../lib/utils'
import { mesFechado } from '../lib/fechamento'
import { useDialogos } from './ui/Dialogos'
import ResumoPagamentos from './pagamentos/ResumoPagamentos'
import AbasPagamentos from './pagamentos/AbasPagamentos'
import LinhaPagamento from './pagamentos/LinhaPagamento'
import BarraLote from './pagamentos/BarraLote'
import EstadoVazio from './ui/EstadoVazio'
import { listaDePagamentos, filtrarPorAba, contagemPorAba, resumoCompacto, podeMarcarEmLote } from '../lib/pagamentosLista'
import { resumoDoMes, sobraAnterior, lerUsarSaldoAnterior, gravarUsarSaldoAnterior } from '../lib/financeiro'

export default function Pagamentos({ store, irPara }) {
  const {
    fixos, fixosPagamentos, cartoes, compras, faturas, rendas, saldoAjustes, comprasPagamentos, comprasPagamentosOk, aulasAReceber,
    marcarFixoPago, marcarParcelaPaga, definirValorFixo, upsertFatura, updateCompra, definirAjusteSaldo,
    definirDataPagamentoFixo, definirDataPagamentoFatura, definirDataPagamentoParcela,
  } = store
  const [mes, setMes] = useState(nowYM())
  const [usarSobra, setUsarSobra] = useState(lerUsarSaldoAnterior)
  function alternarSobra(v) {
    setUsarSobra(v)
    gravarUsarSaldoAnterior(v)
  }

  const ajusteAtual = Number(saldoAjustes.find((a) => a.mes === mes)?.ajuste) || 0
  const [saldoReal, setSaldoReal] = useState('')
  const [busca, setBusca] = useState('')
  const [aba, setAba] = useState('apagar') // apagar | atrasadas | pagas | todas
  const [abertas, setAbertas] = useState(() => new Set()) // contas com os detalhes abertos
  const [marcadas, setMarcadas] = useState(() => new Set()) // contas selecionadas para pagar em lote
  const [ocupada, setOcupada] = useState(false)
  const [ultimo, setUltimo] = useState(null) // { rotulo, chaves }: última ação de pagamento, para desfazer
  const { confirmar, avisar, pedir, dialogo } = useDialogos()
  const perguntar = (texto, valor) => pedir({ titulo: 'Informar valor', texto, valor })
  useEffect(() => { if (!ultimo) return undefined; const t = setTimeout(() => setUltimo(null), 9000); return () => clearTimeout(t) }, [ultimo])
  const [extratoAberto, setExtratoAberto] = useState(false)
  const [categoriasAberto, setCategoriasAberto] = useState(false) // resumo por categoria começa recolhido: a lista de contas vem primeiro
  const [catExpandida, setCatExpandida] = useState(null) // categoria cujo "de onde vem" está aberto
  const [adiando, setAdiando] = useState(null) // { tipo, refId, titulo, valor, mesOrigem, destinoAtual }
  const [divida, setDivida] = useState(null) // sugestão de dívida criada a partir de uma conta
  const { adiamentosOk, adiarConta, desfazerAdiamento, dividasOk, salvarDivida, removerDivida } = store
  const noPlanoMes = (store.dividas || []).filter((x) => x.origem && x.origem.split('|')[2] === mes)
  const registroAdiamento = (tipo, refId, mesOrigem) => (store.adiamentos || []).find((a) => a.tipo === tipo && String(a.ref_id) === String(refId) && a.mes_origem === mesOrigem)
  function abrirAdiar(tipo, item, titulo, valor) {
    const mesOrigem = item.adiadoDe || mes
    if (mesFechado(store.fechamentos, mesOrigem)) { avisar(`${mesLabel(mesOrigem)} está fechado. Reabra o fechamento para mexer nessa conta.`); return }
    setAdiando({ tipo, refId: item.id, titulo, valor: valor - (item.acrescimoAdiamento || 0), mesOrigem, destinoAtual: item.adiadoDe ? mes : null })
  }
  async function voltarAdiada(tipo, item) {
    const r = registroAdiamento(tipo, item.id, item.adiadoDe)
    if (!r) return
    if (mesFechado(store.fechamentos, item.adiadoDe) || mesFechado(store.fechamentos, mes)) { avisar('Um dos meses está fechado. Reabra o fechamento para mexer nessa conta.'); return }
    await desfazerAdiamento(r.id)
  }
  // Virar dívida: a conta sai do mês e passa a ser paga pelo Plano de dívidas.
  function virarDivida(tipo, item, nome, valor) {
    const mesOrigem = item.adiadoDe || item.mesPagamento || item.mesParcela || mes
    if (mesFechado(store.fechamentos, mesOrigem)) { avisar(`${mesLabel(mesOrigem)} está fechado. Reabra o fechamento para mexer nessa conta.`); return }
    setDivida({ nome, valor: valor - (item.acrescimoAdiamento || 0), tipo: tipo === 'fatura' ? 'cartao' : 'boleto', origem: `${tipo}|${tipo === 'fatura' ? item.cartao_id : item.id}|${tipo === 'fatura' ? mesOrigem : (tipo === 'fixo' ? item.mesPagamento || mes : item.mesParcela || mes)}` })
  }
  const linkDivida = (tipo, item, nome, valor) => (dividasOk ? <button className="link-btn" onClick={() => virarDivida(tipo, item, nome, valor)}>Virar dívida</button> : null)
  // Ações de adiar na linha de uma conta: Adiar (se ainda não está paga) ou, se já foi adiada, Voltar / Mudar de mês.
  const acoesAdiar = (tipo, item, titulo, valor, pago) => {
    if (!adiamentosOk) return null
    if (item.adiadoDe) return (
      <div className="adiar-linha"><span className="badge badge-amber">adiada de {mesLabel(item.adiadoDe)}{item.acrescimoAdiamento > 0 ? ` · +${fmt(item.acrescimoAdiamento)} de multa/juros` : ''}</span>
        <button className="link-btn" onClick={() => voltarAdiada(tipo, item)}>voltar para {mesLabel(item.adiadoDe)}</button>
        {!pago && linkDivida(tipo, item, titulo, valor)}
        {!pago && <button className="link-btn" onClick={() => abrirAdiar(tipo, item, titulo, valor)}>mudar de mês</button>}</div>
    )
    return pago ? null : <div className="adiar-linha"><button className="link-btn" onClick={() => abrirAdiar(tipo, item, titulo, valor)}>Adiar para outro mês</button>{linkDivida(tipo, item, titulo, valor)}</div>
  }

  const dados = { fixos, fixosPagamentos, cartoes, compras, faturas, rendas, saldoAjustes, comprasPagamentos, comprasPagamentosOk, aulasAReceber, adiamentos: store.adiamentos, dividas: store.dividas }
  const resumo = resumoDoMes(dados, mes, { usarSaldoAnterior: usarSobra })
  const { fixoPagamento, pago } = resumo.detalhe

  async function toggleOutraConta(c) {
    if (comprasPagamentosOk) {
      await marcarParcelaPaga(c.id, c.mesParcela || mes, !c.pago) // cada parcela (mês) tem o seu "pago"
      return true
    }
    // Sem a atualização 14 do banco, o "pago" ainda vale para a compra inteira.
    if (c.parcelaTotal > 1 && !(await confirmar({ titulo: 'Compra parcelada', texto: `Esta compra tem ${c.parcelaTotal} parcelas e o "pago" vale para a compra inteira, não só para este mês. Continuar?`, confirmar: 'Continuar' }))) return false
    await updateCompra(c.id, {
      pago: !c.pago,
      data_pagamento: !c.pago ? hojeSP() : null,
    })
    return true
  }

  const rendaMes = totalRenda(rendas.find((r) => r.mes === mes))
  const sobraPossivel = usarSobra ? resumo.saldoAnterior : sobraAnterior(dados, mes)
  const temRendaAnterior = totalRenda(rendas.find((r) => r.mes === addMonths(mes, -1))) > 0
  const sobra = resumo.saldoAnterior
  const baseCalculada = resumo.baseCalculada
  const dinheiroDisponivel = resumo.disponivel

  const pendencias = pendenciasValorVariavel(store.fixos, hojeSP(), { inicio: store.inicioApp })
  const { combina } = compilar(busca)
  const lista = listaDePagamentos(resumo.detalhe, cartoes, mes, hojeSP())
  const porChave = new Map(lista.map((i) => [i.chave, i]))
  const contagem = contagemPorAba(lista)
  const resumoTopo = resumoCompacto(lista)
  const filtroAtivo = !!busca.trim()
  const daAba = filtrarPorAba(lista, aba)
  const visiveis = daAba.filter((i) => combina({ texto: [i.nome, i.detalheNome, i.categoria, i.subcategoria, i.origem, i.estimado ? 'estimado' : ''].filter(Boolean).join(' '), valor: i.valor }))
  const porCategoria = pagamentosPorCategoria(resumo.detalhe, { compras, cartoes, fixos }, mes)

  async function acertar() {
    const real = Number(saldoReal)
    if (saldoReal === '' || Number.isNaN(real)) return
    const ok = await definirAjusteSaldo(mes, Math.round((real - baseCalculada) * 100) / 100)
    if (ok) setSaldoReal('')
  }

  // Conta de valor variável: o valor real é informado por mês (só aquele mês muda).
  async function informarValor(fixo) {
    const fixoBruto = store.fixos.find((x) => x.id === fixo.id) || fixo
    const media = fixo.estimado ? mediaRecente(fixoBruto, fixo.mesPagamento || mes) : null
    const sugestao = media ? `\n\nMédia dos últimos ${media.meses} mese${media.meses > 1 ? 's' : ''} informados: ${fmt(media.media)}` : ''
    const r = await perguntar(`Valor real de "${fixo.nome}" em ${mesLabel(fixo.mesPagamento || mes)} (R$):${sugestao}`, String(media ? media.media : fixo.valor).replace('.', ','))
    if (r === null) return false
    const v = Number(String(r).trim().replace(/\./g, '').replace(',', '.'))
    if (!r.trim() || Number.isNaN(v) || v < 0) { avisar('Valor inválido.\n\nDigite só números, com vírgula nos centavos (ex.: 312,40).'); return false }
    return definirValorFixo(fixo.id, fixo.mesPagamento || mes, v)
  }
  async function toggleFixo(fixo) {
    const atual = fixoPagamento(fixo)?.pago || false
    // ao pagar uma conta variável ainda estimada, confirma o valor real antes (evita pagar sem registrar)
    if (!atual && fixo.estimado && !(await informarValor(fixo))) return false
    await marcarFixoPago(fixo.id, fixo.mesPagamento || mes, !atual) // conta adiada: o pagamento fica no mês de origem
    return true
  }

  // Ajustar o valor de um item na lista da categoria ("às vezes acaba sendo mais"): só aquele mês.
  async function ajustarValor(it) {
    const invalido = () => avisar('Não entendi esse valor. Exemplo: 312,40 ou 1.200')
    if (it.tipo === 'fixo') {
      const f = it.ref
      const mesPag = f.mesPagamento || mes
      const padrao = Number(store.fixos.find((x) => x.id === f.id)?.valor ?? f.valor)
      const t = await perguntar(`Valor real de "${f.nome}" em ${mesLabel(mesPag)} (R$). Vale só para este mês.\nDeixe vazio para voltar ao valor padrão (${fmt(padrao)}).`, String(f.valor).replace('.', ','))
      if (t === null) return
      if (t.trim() === '') { await definirValorFixo(f.id, mesPag, null); return }
      const c = reaisParaCentavos(t)
      if (c == null) { invalido(); return }
      await definirValorFixo(f.id, mesPag, c / 100)
      return
    }
    if (it.tipo === 'fatura') {
      const l = it.ref
      if (mesFechado(store.fechamentos, mes)) { avisar(`${mesLabel(mes)} está fechado. Reabra o fechamento para mexer nessa fatura.`); return }
      const t = await perguntar(`Valor real da fatura ${l.nome} em ${mesLabel(mes)} (R$): o que o banco cobra.\nDeixe vazio para voltar ao valor lançado no app (${fmt(l.lancado)}).`, String(l.valor).replace('.', ','))
      if (t === null) return
      if (t.trim() === '') { await upsertFatura({ cartao_id: l.cartao_id, mes, valor_real: null }); return }
      const c = reaisParaCentavos(t)
      if (c == null) { invalido(); return }
      await upsertFatura({ cartao_id: l.cartao_id, mes, valor_real: c / 100 })
      return
    }
    const compra = it.ref
    if (compra.adiadoDe) { avisar('Essa conta foi adiada com multa/juros. Use "mudar de mês" na lista de Outras contas para ajustar o acréscimo.'); return }
    if (Number(compra.parcelas) > 1) { avisar('Essa conta é parcelada. Para mudar o valor, edite a compra na tela Compras (o novo valor vale para as parcelas).'); return }
    const t = await perguntar(`Valor de "${tituloCompra(compra)}" (R$):`, String(compra.valorParcela).replace('.', ','))
    if (t === null) return
    const c = reaisParaCentavos(t)
    if (c == null || c <= 0) { invalido(); return }
    await updateCompra(compra.id, { valor_total: c / 100 })
  }

  async function toggleCartao(linha) {
    await upsertFatura({
      cartao_id: linha.cartao_id,
      mes,
      // Marcar como paga NÃO mexe no valor da fatura: o valor real só existe se você informou
      // (tela Faturas). Antes, a estimativa era gravada aqui como se fosse o valor real do banco.
      pago: !linha.pago,
      data_pagamento: !linha.pago ? hojeSP() : null,
    })
    return true
  }

  // Ao marcar como pago a data é a de hoje; este campo deixa corrigir (ex.: pagou ontem). Campo vazio é ignorado.
  const dataPag = (valor, aoMudar) => (
    <input
      type="date" className="input-data" value={(valor || '').slice(0, 10)} max={hojeSP()}
      onChange={(e) => { if (e.target.value) aoMudar(e.target.value) }}
      aria-label="Data do pagamento" title="Data do pagamento (clique para alterar)"
    />
  )
  const mudarDataParcela = (c, d) => (comprasPagamentosOk
    ? definirDataPagamentoParcela(c.id, c.mesParcela || mes, d)
    : updateCompra(c.id, { data_pagamento: d }))

  // ---- lista única: pagar, desfazer, lote ----
  async function alternar(item) { // usa as mesmas regras de sempre para cada tipo de conta
    if (item.tipo === 'fixo') return toggleFixo(item.ref)
    if (item.tipo === 'fatura') return toggleCartao(item.ref)
    return toggleOutraConta(item.ref)
  }
  async function pagarUm(item) {
    if (ocupada) return
    setOcupada(true)
    try {
      const ok = await alternar(item)
      if (ok === false) return
      setUltimo(item.pago ? null : { rotulo: `${item.nome} marcada como paga`, chaves: [item.chave] })
      setMarcadas((s) => { const n = new Set(s); n.delete(item.chave); return n })
    } finally { setOcupada(false) }
  }
  async function desfazerUltimo() {
    if (!ultimo) return
    const { chaves } = ultimo
    setUltimo(null)
    setOcupada(true)
    try { for (const c of chaves) { const it = porChave.get(c); if (it?.pago) await alternar(it) } } finally { setOcupada(false) }
  }
  const selecionaveis = lista.filter(podeMarcarEmLote)
  const marcadasValidas = [...marcadas].map((c) => porChave.get(c)).filter((i) => i && podeMarcarEmLote(i))
  const totalMarcadas = Math.round(marcadasValidas.reduce((t, i) => t + i.valor, 0) * 100) / 100
  const alternarMarca = (item) => setMarcadas((s) => { const n = new Set(s); if (n.has(item.chave)) n.delete(item.chave); else n.add(item.chave); return n })
  const alternarDetalhes = (item) => setAbertas((s) => { const n = new Set(s); if (n.has(item.chave)) n.delete(item.chave); else n.add(item.chave); return n })
  async function pagarLote() {
    if (!marcadasValidas.length || ocupada) return
    const ok = await confirmar({
      titulo: `Marcar ${marcadasValidas.length} ${marcadasValidas.length === 1 ? 'conta' : 'contas'} como ${marcadasValidas.length === 1 ? 'paga' : 'pagas'}?`,
      texto: `${marcadasValidas.map((i) => `• ${i.nome} · ${fmt(i.valor)}`).join('\n')}\n\nTotal: ${fmt(totalMarcadas)}. Dá para desfazer logo depois.`,
      confirmar: 'Marcar como pagas',
    })
    if (!ok) return
    setOcupada(true)
    const feitas = []
    try { for (const i of marcadasValidas) { if ((await alternar(i)) !== false) feitas.push(i.chave) } } finally { setOcupada(false) }
    setMarcadas(new Set())
    if (feitas.length) setUltimo({ rotulo: `${feitas.length} ${feitas.length === 1 ? 'conta marcada como paga' : 'contas marcadas como pagas'}`, chaves: feitas })
  }
  const corrigirValor = (item) => ajustarValor({ tipo: item.tipo, ref: item.ref })
  // Detalhes de uma conta (o que antes ficava espalhado em colunas e botões da linha)
  function detalhesDe(item) {
    const f = item.ref
    return (
      <>
        {item.tipo === 'fixo' && <div>{[f.categoria, f.subcategoria].filter(Boolean).join(' › ') || 'Sem categoria'}{f.dia_vencimento ? ` · vence todo dia ${f.dia_vencimento}` : ''}</div>}
        {item.tipo === 'fixo' && f.variavel && (
          <div className="pag-det-acoes">Valor deste mês:
            <ValorDoMes fixo={f} mes={mes} real={store.fixos.find((x) => x.id === f.id)?.valores?.[mes]} definirValorFixo={definirValorFixo} compacto fechado={mesFechado(store.fechamentos, mes)} />
          </div>
        )}
        {item.tipo === 'fatura' && <div>{f.temFatura ? 'Valor real da fatura (informado do banco).' : 'Valor estimado: soma do que está lançado no cartão. Informe o valor do banco em Faturas.'}</div>}
        {item.tipo === 'fatura' && f.fixosNoCartao?.length > 0 && <div>Inclui contas fixas: {f.fixosNoCartao.map((x) => `${x.nome} ${fmt(x.valor)}`).join(' · ')}</div>}
        {item.tipo === 'compra' && item.detalheNome && <div>No cartão: {item.detalheNome}</div>}
        {item.tipo === 'compra' && item.obs && <div>{item.obs}</div>}
        {item.tipo === 'compra' && f.parcelaTotal > 1 && <div>Parcela {f.parcelaNum} de {f.parcelaTotal}. Sem controle por mês, o "pago" vale para a compra inteira.</div>}
        {item.pago && (
          <div className="pag-det-acoes">Pago em
            {item.tipo === 'fixo' && dataPag(item.dataPagamento, (d) => definirDataPagamentoFixo(f.id, f.mesPagamento || mes, d))}
            {item.tipo === 'fatura' && dataPag(item.dataPagamento, (d) => definirDataPagamentoFatura(f.cartao_id, mes, d))}
            {item.tipo === 'compra' && dataPag(item.dataPagamento, (d) => mudarDataParcela(f, d))}
          </div>
        )}
        <div className="pag-det-acoes">
          {!item.pago && !(item.tipo === 'fixo' && f.variavel) && <button type="button" className="btn btn-ghost btn-sm" onClick={() => corrigirValor(item)}>Corrigir valor</button>}
          {item.tipo === 'fatura' && irPara && <button type="button" className="btn btn-ghost btn-sm" onClick={() => irPara('faturas')}>Ver fatura</button>}
          {item.tipo === 'fixo' && acoesAdiar('fixo', f, f.nome, Number(f.valor), item.pago)}
          {item.tipo === 'compra' && acoesAdiar('compra', f, item.nome, item.valor, item.pago)}
          {item.tipo === 'fatura' && !item.pago && dividasOk && <button type="button" className="link-btn" onClick={() => virarDivida('fatura', f, item.nome, item.valor)}>Virar dívida</button>}
        </div>
      </>
    )
  }

  return (
    <div className="page">
      {dialogo}
      {divida && <ModalDivida sugestao={divida} onSalvar={salvarDivida} onRemover={removerDivida} onClose={() => setDivida(null)} />}
      {adiando && <ModalAdiar titulo={adiando.titulo} valor={adiando.valor} mesOrigem={adiando.mesOrigem} mesAtualDestino={adiando.destinoAtual} onClose={() => setAdiando(null)} onConfirmar={(destino, acrescimo) => adiarConta(adiando.tipo, adiando.refId, adiando.mesOrigem, destino, acrescimo)} />}
      {pendencias.length > 0 && (
        <div className="alert alert-amber">
          <b>{pendencias.length === 1 ? '1 conta de valor variável' : `${pendencias.length} contas de valor variável`} ainda com valor estimado:</b>
          {pendencias.map((p) => (
            <div key={p.fixo.id + p.mes} style={{ fontSize: 12, marginTop: 2 }}>
              · {p.fixo.nome} — {mesLabel(p.mes)}{p.tipo === 'vencida' ? ` (venceu há ${p.diasAtraso} dia${p.diasAtraso > 1 ? 's' : ''})` : ' (mês passado)'}{' '}
              <button className="link-btn" onClick={() => { setMes(p.mes) }}>abrir o mês</button>
            </div>
          ))}
        </div>
      )}

      <div className="pag-topo">
        <NavMes mes={mes} onChange={setMes} fechado={mesFechado(store.fechamentos, mes)} />
      </div>

      {mesFechado(store.fechamentos, mes) && (
        <div className="alert alert-amber" style={{ marginBottom: 12 }}>
          <strong>{mesLabel(mes)} está fechado.</strong> Marcar contas como pagas aqui não muda a foto do fechamento (os números dele ficam congelados),
          mas as telas ao vivo passam a divergir dela. Para corrigir o fechamento de verdade, reabra o mês na tela Fechamento (com motivo).
        </div>
      )}

      <ResumoPagamentos resumo={resumoTopo} />
      <AbasPagamentos valor={aba} onChange={setAba} contagem={contagem} />
      <div className="toolbar">
        <CampoBusca valor={busca} onChange={setBusca} />
      </div>
      <ResumoFiltro ativo={filtroAtivo} mostrando={visiveis.length} total={daAba.length} onLimpar={() => setBusca('')} />

      {visiveis.length === 0 ? (
        <div className="card">
          <EstadoVazio
            titulo={filtroAtivo ? 'Nenhuma conta com essa busca' : lista.length === 0 ? `Nenhuma conta em ${mesLabel(mes)}` : aba === 'pagas' ? 'Nenhuma conta paga ainda' : aba === 'atrasadas' ? 'Nenhuma conta atrasada 🎉' : 'Tudo pago por aqui'}
            texto={lista.length === 0 ? 'Cadastre contas fixas ou lance compras para acompanhar os pagamentos aqui.' : filtroAtivo ? 'Tente outro nome ou valor.' : undefined}
          />
        </div>
      ) : (
        <ul className="pag-lista" aria-label="Contas do mês">
          {visiveis.map((i) => (
            <LinhaPagamento
              key={i.chave} item={i} selecionavel={podeMarcarEmLote(i)} selecionada={marcadas.has(i.chave)} aoSelecionar={alternarMarca}
              aberta={abertas.has(i.chave)} aoAlternar={alternarDetalhes} aoPagar={pagarUm} ocupada={ocupada} detalhes={abertas.has(i.chave) ? detalhesDe(i) : null}
            />
          ))}
        </ul>
      )}
      {selecionaveis.length > 0 && <BarraLote qtd={marcadasValidas.length} total={totalMarcadas} aoMarcar={pagarLote} aoLimpar={() => setMarcadas(new Set())} ocupada={ocupada} />}
      {ultimo && (
        <div className="toast-area" role="status" aria-live="polite">
          <div className="toast"><span>{ultimo.rotulo}</span><button type="button" className="btn btn-primary btn-sm" onClick={desfazerUltimo}>Desfazer</button><button type="button" className="btn btn-ghost btn-sm" onClick={() => setUltimo(null)} aria-label="Dispensar">×</button></div>
        </div>
      )}

      <div className="pag-secundarias">
      {porCategoria.categorias.length > 0 && (
        <Secao titulo="Por categoria" info={`${porCategoria.categorias.filter((c) => c.pendente > 0.005).length} com pendência`} destaque={`falta ${fmt(porCategoria.pendente)}`} aberto={categoriasAberto} onToggle={() => setCategoriasAberto((v) => !v)}>
          <div className="pag-cat">
            {porCategoria.categorias.map((c) => (
              <div key={c.categoria} className={`pag-cat-linha ${c.pendente <= 0.005 ? 'quitada' : ''}`}>
                <div className="pag-cat-nome">
                  <button className="link-btn" onClick={() => setCatExpandida(catExpandida === c.categoria ? null : c.categoria)} aria-expanded={catExpandida === c.categoria} title="Ver de onde vem este valor" style={{ fontWeight: 600, textAlign: 'left' }}>{catExpandida === c.categoria ? '▾' : '▸'} {c.categoria}</button>
                  <div className="pag-cat-barra" role="progressbar" aria-valuenow={Math.round(c.pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.categoria}: ${Math.round(c.pct * 100)}% pago`}><div style={{ width: `${Math.round(c.pct * 100)}%` }} /></div>
                </div>
                <div className="pag-cat-num"><span className="cad-sub">total</span><b className="mono">{fmt(c.total)}</b></div>
                <div className="pag-cat-num"><span className="cad-sub">pago</span><span className="mono" style={{ color: 'var(--green)' }}>{c.pago > 0.005 ? fmt(c.pago) : '—'}</span></div>
                <div className="pag-cat-num"><span className="cad-sub">falta</span>{c.pendente > 0.005 ? <b className="mono" style={{ color: 'var(--amber)' }}>{fmt(c.pendente)}</b> : <span style={{ color: 'var(--green)' }}>✓ quitada</span>}</div>
                {catExpandida === c.categoria && (() => {
                  const aPagar = c.itens.filter((it) => !it.pago)
                  const pagas = c.itens.filter((it) => it.pago)
                  const marcar = (it) => (it.tipo === 'fixo' ? toggleFixo(it.ref) : it.tipo === 'fatura' ? toggleCartao(it.ref) : toggleOutraConta(it.ref))
                  const linha = (it, i) => (
                    <div key={`${it.tipo}-${it.nome}-${i}`}>
                      <label className="pag-cat-item pag-cat-marcar">
                        <input type="checkbox" checked={!!it.pago} onChange={() => marcar(it)} aria-label={`${it.pago ? 'Desmarcar' : 'Marcar como pago'}: ${it.nome}`} />
                        <span style={{ flex: 1, minWidth: 0 }}>{it.tipo === 'fixo' ? 'Conta fixa' : it.tipo === 'fatura' ? '💳' : 'Conta'} · <b>{it.nome}</b>{it.tipo === 'fatura' && <span className="cad-sub"> (parte desta categoria{it.ajustada ? ', ajustada ao valor real' : ''}; marcar paga a fatura inteira, {fmt(it.valorFatura)})</span>}</span>
                        <span className="mono">{fmt(it.valor)}</span>
                      </label>
                      <div className="pag-cat-acoes"><button className="link-btn" onClick={() => ajustarValor(it)}>{it.tipo === 'fatura' ? 'ajustar valor da fatura' : 'ajustar valor'}</button></div>
                      {(it.compras || []).slice(0, 8).map((x, j) => <div key={j} className="pag-cat-item pag-cat-sub"><span>{x.titulo}</span><span className="mono">{fmt(x.valor)}</span></div>)}
                      {(it.compras || []).length > 8 && <div className="pag-cat-item pag-cat-sub"><span>+ {it.compras.length - 8} compras</span></div>}
                    </div>
                  )
                  return (
                    <div className="pag-cat-origem">
                      {aPagar.length > 0 ? (
                        <>
                          <div className="pag-cat-subtitulo" style={{ color: 'var(--amber)' }}>A pagar · {aPagar.length} {aPagar.length === 1 ? 'item' : 'itens'} · {fmt(c.pendente)}</div>
                          {aPagar.map(linha)}
                        </>
                      ) : <div className="pag-cat-subtitulo" style={{ color: 'var(--green)' }}>✓ Tudo pago nesta categoria</div>}
                      {pagas.length > 0 && (
                        <details className="pag-cat-pagas" open={aPagar.length === 0}>
                          <summary>Pagas · {pagas.length} {pagas.length === 1 ? 'item' : 'itens'} · {fmt(c.pago)}</summary>
                          {pagas.map(linha)}
                        </details>
                      )}
                    </div>
                  )
                })()}
              </div>
            ))}
            <div className="pag-cat-linha pag-cat-total">
              <div className="pag-cat-nome"><b>Total do mês</b></div>
              <div className="pag-cat-num"><span className="cad-sub">total</span><b className="mono">{fmt(porCategoria.total)}</b></div>
              <div className="pag-cat-num"><span className="cad-sub">pago</span><span className="mono" style={{ color: 'var(--green)' }}>{fmt(porCategoria.pago)}</span></div>
              <div className="pag-cat-num"><span className="cad-sub">falta</span><b className="mono" style={{ color: 'var(--amber)' }}>{fmt(porCategoria.pendente)}</b></div>
            </div>
          </div>
          <div className="cad-sub" style={{ padding: '4px 18px 14px' }}>Atualiza sozinho conforme você marca os pagamentos. A fatura do cartão é dividida pelas categorias das compras lançadas nela. Toque no nome da categoria para ver de onde vem o valor (contas fixas, contas avulsas e a parte de cada fatura de cartão).</div>
        </Secao>
      )}

      <Secao titulo="Dinheiro disponível" info="de onde vem" destaque={fmt(dinheiroDisponivel)} aberto={extratoAberto} onToggle={() => setExtratoAberto((v) => !v)}>
      <div className="extrato">
        <div className="extrato-linha">
          <div>Renda de {mesLabel(mes)}</div>
          <div className="mono" style={{ color: rendaMes > 0 ? 'var(--green)' : 'var(--text3)' }}>{rendaMes > 0 ? '+ ' + fmt(rendaMes) : 'não cadastrada'}</div>
        </div>
        <div className="extrato-linha" style={{ opacity: usarSobra ? 1 : 0.55 }}>
          <div>
            Sobra de {mesLabel(addMonths(mes, -1))}
            <div className="extrato-sub">
              {store.inicioApp && addMonths(mes, -1) < store.inicioApp
                ? `O app começou em ${mesLabel(store.inicioApp)}: não há mês anterior para trazer sobra.`
                : sobraPossivel === 0 && !temRendaAnterior
                ? `${mesLabel(addMonths(mes, -1))} não tem renda cadastrada, então não há sobra para trazer.`
                : 'O que sobraria do mês anterior depois de pagar tudo dele.'}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="mono" style={{ color: sobra < 0 ? 'var(--red)' : 'var(--green)' }}>
              {sobraPossivel !== 0 ? (sobraPossivel < 0 ? '− ' : '+ ') + fmt(Math.abs(sobraPossivel)) : fmt(0)}
            </span>
            <label className="switch" title={usarSobra ? 'Clique para ignorar a sobra' : 'Clique para incluir a sobra'}>
              <input type="checkbox" checked={usarSobra} onChange={(e) => alternarSobra(e.target.checked)} />
              <span>{usarSobra ? 'Incluída' : 'Ignorada'}</span>
            </label>
          </div>
        </div>
        <div className="extrato-linha">
          <div>Já pago neste mês</div>
          <div className="mono" style={{ color: pago > 0 ? 'var(--amber)' : 'var(--text3)' }}>{pago > 0 ? '− ' + fmt(pago) : fmt(0)}</div>
        </div>
        {ajusteAtual !== 0 && (
          <div className="extrato-linha">
            <div>
              Acerto com o saldo real
              <div className="extrato-sub"><button className="link-btn" onClick={() => definirAjusteSaldo(mes, 0)}>remover acerto</button></div>
            </div>
            <div className="mono" style={{ color: ajusteAtual > 0 ? 'var(--green)' : 'var(--red)' }}>
              {ajusteAtual > 0 ? '+ ' : '− '}{fmt(Math.abs(ajusteAtual))}
            </div>
          </div>
        )}
        <div className="extrato-linha extrato-total">
          <div>Dinheiro disponível</div>
          <div className="mono" style={{ color: dinheiroDisponivel >= 0 ? 'var(--blue)' : 'var(--red)' }}>{fmt(dinheiroDisponivel)}</div>
        </div>
      </div>

      <details className="acerto" style={{ margin: '0 18px 14px' }}>
        <summary>O valor não bate com o que você tem na conta? Acerte aqui</summary>
        <div className="acerto-corpo">
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 10 }}>
            Digite quanto você tem de verdade na conta agora. O Sobrou! calcula a diferença e guarda como um acerto neste mês
            (útil para dinheiro que não está na renda cadastrada, como uma reserva que você já tinha).
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="number" step="0.01" placeholder="Saldo real da conta (R$)"
              value={saldoReal} onChange={(e) => setSaldoReal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') acertar() }}
              style={{ maxWidth: 220 }}
            />
            <button className="btn btn-primary btn-sm" onClick={acertar} disabled={saldoReal === ''}>Acertar</button>
          </div>
        </div>
      </details>
      </Secao>
      </div>

      {noPlanoMes.length > 0 && (
        <section className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Viraram dívida em {mesLabel(mes)}</div>
          <div className="cad-sub" style={{ marginBottom: 8 }}>Saíram do mês e passam a ser pagas pelo Plano de dívidas.</div>
          {noPlanoMes.map((x) => (
            <div key={x.id} className="divida-linha" style={{ padding: '8px 0' }}>
              <div className="divida-corpo"><b>{x.nome}</b><div className="cad-sub">{x.ativa === false ? 'quitada' : `deve ${fmt(Number(x.saldo))}`}{Number(x.saldo_inicial) ? ` · era ${fmt(Number(x.saldo_inicial))}` : ''}</div></div>
              <div className="divida-acoes">
                {irPara && <button className="btn btn-ghost btn-sm" onClick={() => irPara('dividas')}>Ver no plano</button>}
                <button className="btn btn-ghost btn-sm" onClick={async () => { if (await confirmar({ titulo: 'Voltar para as contas do mês?', texto: `Voltar "${x.nome}" para as contas de ${mesLabel(mes)}? A dívida será apagada do plano.`, confirmar: 'Voltar para o mês' })) await removerDivida(x.id) }}>Desfazer</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
