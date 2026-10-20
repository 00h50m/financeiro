import { useState } from 'react'
import { compilar } from '../lib/filtro'
import { mediaRecente, pendenciasValorVariavel } from '../lib/fixosVariaveis'
import ValorDoMes from './ValorDoMes'
import Secao from './Secao'
import ModalAdiar from './ModalAdiar'
import ModalDivida from './ModalDivida'
import NavMes, { PilulasPago } from './NavMes'
import { CampoBusca, ResumoFiltro } from './FiltroLista'
import { fmt, fmtK, mesLabel, nowYM, addMonths, totalRenda, tituloCompra, subtituloCompra, hojeSP } from '../lib/utils'
import { mesFechado } from '../lib/fechamento'
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
  const [filtroPago, setFiltroPago] = useState('') // 'pagas' | 'apagar'
  const [secoes, setSecoes] = useState({}) // seção → aberta; sem valor: abre quando ainda há algo a pagar
  const [extratoAberto, setExtratoAberto] = useState(false)
  const [adiando, setAdiando] = useState(null) // { tipo, refId, titulo, valor, mesOrigem, destinoAtual }
  const [divida, setDivida] = useState(null) // sugestão de dívida criada a partir de uma conta
  const { adiamentosOk, adiarConta, desfazerAdiamento, dividasOk, salvarDivida, removerDivida } = store
  const noPlanoMes = (store.dividas || []).filter((x) => x.origem && x.origem.split('|')[2] === mes)
  const registroAdiamento = (tipo, refId, mesOrigem) => (store.adiamentos || []).find((a) => a.tipo === tipo && String(a.ref_id) === String(refId) && a.mes_origem === mesOrigem)
  function abrirAdiar(tipo, item, titulo, valor) {
    const mesOrigem = item.adiadoDe || mes
    if (mesFechado(store.fechamentos, mesOrigem)) { window.alert(`${mesLabel(mesOrigem)} está fechado. Reabra o fechamento para mexer nessa conta.`); return }
    setAdiando({ tipo, refId: item.id, titulo, valor: valor - (item.acrescimoAdiamento || 0), mesOrigem, destinoAtual: item.adiadoDe ? mes : null })
  }
  async function voltarAdiada(tipo, item) {
    const r = registroAdiamento(tipo, item.id, item.adiadoDe)
    if (!r) return
    if (mesFechado(store.fechamentos, item.adiadoDe) || mesFechado(store.fechamentos, mes)) { window.alert('Um dos meses está fechado. Reabra o fechamento para mexer nessa conta.'); return }
    await desfazerAdiamento(r.id)
  }
  // Virar dívida: a conta sai do mês e passa a ser paga pelo Plano de dívidas.
  function virarDivida(tipo, item, nome, valor) {
    const mesOrigem = item.adiadoDe || item.mesPagamento || item.mesParcela || mes
    if (mesFechado(store.fechamentos, mesOrigem)) { window.alert(`${mesLabel(mesOrigem)} está fechado. Reabra o fechamento para mexer nessa conta.`); return }
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
  const {
    fixosLista: fixosAtivos, fixoPagamento, linhasCartao, outrasContas,
    comprometido, pago, totalDividas,
  } = resumo.detalhe

  async function toggleOutraConta(c) {
    if (comprasPagamentosOk) {
      await marcarParcelaPaga(c.id, c.mesParcela || mes, !c.pago) // cada parcela (mês) tem o seu "pago"
      return
    }
    // Sem a atualização 14 do banco, o "pago" ainda vale para a compra inteira.
    if (c.parcelaTotal > 1 && !confirm(`Esta compra tem ${c.parcelaTotal} parcelas e o "pago" vale para a compra inteira, não só para este mês. Continuar?`)) return
    await updateCompra(c.id, {
      pago: !c.pago,
      data_pagamento: !c.pago ? hojeSP() : null,
    })
  }

  const rendaMes = totalRenda(rendas.find((r) => r.mes === mes))
  const sobraPossivel = usarSobra ? resumo.saldoAnterior : sobraAnterior(dados, mes)
  const temRendaAnterior = totalRenda(rendas.find((r) => r.mes === addMonths(mes, -1))) > 0
  const sobra = resumo.saldoAnterior
  const baseCalculada = resumo.baseCalculada
  const dinheiroDisponivel = resumo.disponivel
  const saldo = resumo.sobraProjetada

  const pendencias = pendenciasValorVariavel(store.fixos, hojeSP(), { inicio: store.inicioApp })
  const { combina } = compilar(busca)
  const filtroAtivo = !!(busca.trim() || filtroPago)
  const passaPago = (pago) => !filtroPago || (filtroPago === 'pagas' ? !!pago : !pago)
  const fixosVis = fixosAtivos.filter((f) => passaPago(fixoPagamento(f)?.pago)
    && combina({ texto: [f.nome, f.categoria, f.subcategoria, f.estimado ? 'estimado' : ''].filter(Boolean).join(' '), valor: Number(f.valor) }))
  const cartoesVis = linhasCartao.filter((l) => passaPago(l.pago) && combina({ texto: l.nome, valor: Number(l.valor) }))
  const outrasVis = outrasContas.filter((c) => passaPago(c.pago)
    && combina({ texto: [tituloCompra(c), subtituloCompra(c), c.obs, c.categoria, c.subcategoria].filter(Boolean).join(' '), valor: Number(c.valorParcela) }))
  const totalLinhas = fixosAtivos.length + linhasCartao.length + outrasContas.length
  const totalVis = fixosVis.length + cartoesVis.length + outrasVis.length

  const somaValor = (lista, f) => lista.reduce((t, x) => t + Number(f(x)), 0)
  const resumoSecao = (chave, lista, estaPago, valorDe) => {
    const pagas = lista.filter(estaPago).length
    const aberta = secoes[chave] ?? (filtroAtivo || pagas < lista.length)
    return {
      aberta,
      onToggle: () => setSecoes((m) => ({ ...m, [chave]: !aberta })),
      info: lista.length ? `${pagas}/${lista.length} pagas` : 'vazio',
      destaque: fmt(somaValor(lista, valorDe)),
    }
  }
  const secFixos = resumoSecao('fixos', fixosVis, (f) => fixoPagamento(f)?.pago, (f) => f.valor)
  const secCartoes = resumoSecao('cartoes', cartoesVis, (l) => l.pago, (l) => l.valor)
  const secOutras = resumoSecao('outras', outrasVis, (c) => c.pago, (c) => c.valorParcela)
  const pctPago = comprometido > 0 ? Math.min(100, Math.round((pago / comprometido) * 100)) : 0

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
    const r = window.prompt(`Valor real de "${fixo.nome}" em ${mesLabel(fixo.mesPagamento || mes)} (R$):${sugestao}`, String(media ? media.media : fixo.valor).replace('.', ','))
    if (r === null) return false
    const v = Number(String(r).trim().replace(/\./g, '').replace(',', '.'))
    if (!r.trim() || Number.isNaN(v) || v < 0) { window.alert('Valor inválido.\n\nDigite só números, com vírgula nos centavos (ex.: 312,40).'); return false }
    return definirValorFixo(fixo.id, fixo.mesPagamento || mes, v)
  }
  async function toggleFixo(fixo) {
    const atual = fixoPagamento(fixo)?.pago || false
    // ao pagar uma conta variável ainda estimada, confirma o valor real antes (evita pagar sem registrar)
    if (!atual && fixo.estimado && !(await informarValor(fixo))) return
    await marcarFixoPago(fixo.id, fixo.mesPagamento || mes, !atual) // conta adiada: o pagamento fica no mês de origem
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
  }

  // Ao marcar como pago a data é a de hoje; este campo deixa corrigir (ex.: pagou ontem). Campo vazio é ignorado.
  const dataPag = (valor, aoMudar) => (
    <input
      type="date" className="input-data" value={(valor || '').slice(0, 10)} max={hojeSP()}
      onChange={(e) => { if (e.target.value) aoMudar(e.target.value) }}
      aria-label="Data do pagamento" title="Data do pagamento (clique para alterar)"
    />
  )
  const semData = <span style={{ color: 'var(--text3)' }}>—</span>
  const mudarDataParcela = (c, d) => (comprasPagamentosOk
    ? definirDataPagamentoParcela(c.id, c.mesParcela || mes, d)
    : updateCompra(c.id, { data_pagamento: d }))

  return (
    <div className="page">
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
        <PilulasPago valor={filtroPago} onChange={setFiltroPago} />
      </div>
      <div className="toolbar">
        <CampoBusca valor={busca} onChange={setBusca} />
      </div>
      <ResumoFiltro ativo={filtroAtivo} mostrando={totalVis} total={totalLinhas} onLimpar={() => { setBusca(''); setFiltroPago('') }} />

      {mesFechado(store.fechamentos, mes) && (
        <div className="alert alert-amber" style={{ marginBottom: 12 }}>
          <strong>{mesLabel(mes)} está fechado.</strong> Marcar contas como pagas aqui não muda a foto do fechamento (os números dele ficam congelados),
          mas as telas ao vivo passam a divergir dela. Para corrigir o fechamento de verdade, reabra o mês na tela Fechamento (com motivo).
        </div>
      )}

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">Comprometido no mês</div>
          <div className="metric-val amber">{fmtK(comprometido)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Já pago</div>
          <div className="metric-val green">{fmtK(pago)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Total dívidas (a pagar)</div>
          <div className={`metric-val ${totalDividas <= 0.005 ? 'green' : 'red'}`}>{fmtK(totalDividas)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Dinheiro disponível</div>
          <div className={`metric-val ${dinheiroDisponivel >= 0 ? 'blue' : 'red'}`}>{fmtK(dinheiroDisponivel)}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Saldo</div>
          <div className={`metric-val ${saldo >= 0 ? 'green' : 'red'}`}>{fmtK(saldo)}</div>
        </div>
      </div>

      {comprometido > 0 && (
        <div className="pag-progresso" aria-label={`${pctPago}% das contas pagas`}>
          <div className="pag-progresso-barra"><div style={{ width: `${pctPago}%` }} /></div>
          <span>{pctPago}% pago · falta {fmt(totalDividas)}</span>
        </div>
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

      <Secao titulo="Contas fixas" info={secFixos.info} destaque={secFixos.destaque} aberto={secFixos.aberta} onToggle={secFixos.onToggle}>
      {fixosVis.length === 0 ? (
        <div className="empty">{filtroAtivo && fixosAtivos.length > 0 ? 'Nenhuma conta fixa com esses filtros.' : <>Nenhuma conta fixa ativa em {mesLabel(mes)}.{'\n'}Cadastre em "Fixos" para acompanhar aqui.</>}</div>
      ) : (
        <>
          <table className="tabela-compacta lista-cartoes">
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Pago</th>
                <th>Nome</th>
                <th className="col-opc">Categoria</th>
                <th className="col-opc" style={{ textAlign: 'center' }}>Vence</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th className="col-opc">Pago em</th>
              </tr>
            </thead>
            <tbody>
              {fixosVis.map((f) => {
                const pg = fixoPagamento(f)
                return (
                  <tr key={`${f.id}|${f.mesPagamento || ''}`} style={{ opacity: pg?.pago ? 0.6 : 1 }}>
                    <td className="check-cel" style={{ textAlign: 'center' }}>
                      <input type="checkbox" checked={!!pg?.pago} onChange={() => toggleFixo(f)} />
                    </td>
                    <td className="nome-cel" style={{ fontWeight: 500 }}>
                      <span style={{ textDecoration: pg?.pago ? 'line-through' : 'none' }}>{f.nome}</span>
                      <div className="so-mobile">{[f.categoria, f.dia_vencimento ? `vence dia ${f.dia_vencimento}` : ''].filter(Boolean).join(' · ')}</div>
                      {pg?.pago && <div className="so-mobile">pago em {dataPag(pg.data_pagamento, (d) => definirDataPagamentoFixo(f.id, f.mesPagamento || mes, d))}</div>}
                      {acoesAdiar('fixo', f, f.nome, Number(f.valor), !!pg?.pago)}
                    </td>
                    <td className="col-opc" style={{ fontSize: 12, color: 'var(--text2)' }}>
                      {f.categoria ? (
                        <>
                          {f.categoria}<br />
                          <span style={{ color: 'var(--text3)' }}>{f.subcategoria}</span>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text3)' }}>—</span>
                      )}
                    </td>
                    <td className="col-opc" style={{ textAlign: 'center', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text3)' }}>
                      {f.dia_vencimento ? `dia ${f.dia_vencimento}` : '—'}
                    </td>
                    <td className="valor-cel" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>
                      {f.variavel ? (
                        <ValorDoMes fixo={f} mes={mes} real={store.fixos.find((x) => x.id === f.id)?.valores?.[mes]} definirValorFixo={definirValorFixo} compacto fechado={mesFechado(store.fechamentos, mes)} />
                      ) : fmt(f.valor)}
                    </td>
                    <td className="col-opc">{pg?.pago ? dataPag(pg.data_pagamento, (d) => definirDataPagamentoFixo(f.id, f.mesPagamento || mes, d)) : semData}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}
      </Secao>

      <Secao titulo="Faturas dos cartões" info={secCartoes.info} destaque={secCartoes.destaque} aberto={secCartoes.aberta} onToggle={secCartoes.onToggle}>
      {cartoesVis.length === 0 ? (
        <div className="empty">{filtroAtivo && linhasCartao.length > 0 ? 'Nenhuma fatura com esses filtros.' : `Nenhum cartão com movimento em ${mesLabel(mes)}.`}</div>
      ) : (
        <>
          <table className="tabela-compacta lista-cartoes">
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Pago</th>
                <th>Cartão</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th className="col-opc">Origem</th>
                <th className="col-opc">Pago em</th>
              </tr>
            </thead>
            <tbody>
              {cartoesVis.map((l) => (
                <tr key={l.cartao_id} style={{ opacity: l.pago ? 0.6 : 1 }}>
                  <td className="check-cel" style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={l.pago} onChange={() => toggleCartao(l)} />
                  </td>
                  <td className="nome-cel" style={{ fontWeight: 500, textDecoration: l.pago ? 'line-through' : 'none' }}>
                    {l.nome}
                    {!l.pago && dividasOk && <div className="adiar-linha"><button className="link-btn" onClick={() => virarDivida('fatura', l, `Fatura ${l.nome}`, Number(l.valor))}>Virar dívida</button></div>}
                    <div className="so-mobile" style={{ textDecoration: 'none' }}>{l.temFatura ? 'valor real da fatura' : 'estimado (lançado)'}</div>
                    {l.pago && <div className="so-mobile" style={{ textDecoration: 'none' }}>pago em {dataPag(l.dataPagamento, (d) => definirDataPagamentoFatura(l.cartao_id, mes, d))}</div>}
                    {l.fixosNoCartao?.length > 0 && (
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400, textDecoration: 'none' }}>
                        inclui contas fixas: {l.fixosNoCartao.map((f) => `${f.nome} ${fmt(f.valor)}`).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className="valor-cel" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(l.valor)}</td>
                  <td className="col-opc">
                    {l.temFatura ? (
                      <span className="badge badge-green">valor real da fatura</span>
                    ) : (
                      <span className="badge badge-gray">estimado (lançado)</span>
                    )}
                  </td>
                  <td className="col-opc">{l.pago ? dataPag(l.dataPagamento, (d) => definirDataPagamentoFatura(l.cartao_id, mes, d)) : semData}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {linhasCartao.some((l) => !l.temFatura) && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
              Valores marcados como "estimado" ainda não têm fatura cadastrada — o valor usado é a soma das parcelas
              lançadas no app. Cadastre o valor real na aba Faturas para maior precisão.
            </div>
          )}
        </>
      )}
      </Secao>

      <Secao titulo="Outras contas (sem cartão)" info={secOutras.info} destaque={secOutras.destaque} aberto={secOutras.aberta} onToggle={secOutras.onToggle}>
      {outrasVis.length === 0 ? (
        <div className="empty">{filtroAtivo && outrasContas.length > 0 ? 'Nenhuma conta com esses filtros.' : <>Nenhuma conta sem cartão em {mesLabel(mes)}.{'\n'}Compras lançadas como "Sem cartão" aparecem aqui.</>}</div>
      ) : (
        <>
          <table className="tabela-compacta lista-cartoes">
            <thead>
              <tr>
                <th style={{ textAlign: 'center' }}>Pago</th>
                <th>Descrição</th>
                <th style={{ textAlign: 'right' }}>Valor</th>
                <th className="col-opc" style={{ textAlign: 'center' }}>Parcela</th>
                <th className="col-opc">Pago em</th>
              </tr>
            </thead>
            <tbody>
              {outrasVis.map((c) => (
                <tr key={`${c.id}|${c.mesParcela}`} style={{ opacity: c.pago ? 0.6 : 1 }}>
                  <td className="check-cel" style={{ textAlign: 'center' }}>
                    <input type="checkbox" checked={!!c.pago} onChange={() => toggleOutraConta(c)} />
                  </td>
                  <td className="nome-cel" style={{ fontWeight: 500, textDecoration: c.pago ? 'line-through' : 'none' }}>
                    {tituloCompra(c)}
                    <div className="so-mobile" style={{ textDecoration: 'none' }}>{c.parcelaTotal > 1 ? `parcela ${c.parcelaNum}/${c.parcelaTotal}` : 'à vista'}</div>
                    {c.pago && <div className="so-mobile" style={{ textDecoration: 'none' }}>pago em {dataPag(c.data_pagamento, (d) => mudarDataParcela(c, d))}</div>}
                    {subtituloCompra(c) && <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>no cartão: {subtituloCompra(c)}</div>}
                    {c.obs &&<div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.obs}</div>}
                    {acoesAdiar('compra', c, tituloCompra(c), c.valorParcela, !!c.pago)}
                  </td>
                  <td className="valor-cel" style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.valorParcela)}</td>
                  <td className="col-opc" style={{ textAlign: 'center' }}>
                    {c.parcelaTotal > 1 ? (
                      <span className="badge badge-amber">{c.parcelaNum}/{c.parcelaTotal}</span>
                    ) : (
                      <span className="badge badge-gray">à vista</span>
                    )}
                  </td>
                  <td className="col-opc">{c.pago ? dataPag(c.data_pagamento, (d) => mudarDataParcela(c, d)) : semData}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {outrasContas.some((c) => c.parcelaTotal > 1) && (
            <div style={{ padding: '10px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>
              Compras parceladas sem cartão marcam a compra inteira como paga (não parcela a parcela) — use para casos
              simples; para acompanhar mês a mês, prefira lançar pelo cartão.
            </div>
          )}
        </>
      )}
      </Secao>

      {noPlanoMes.length > 0 && (
        <section className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Viraram dívida em {mesLabel(mes)}</div>
          <div className="cad-sub" style={{ marginBottom: 8 }}>Saíram do mês e passam a ser pagas pelo Plano de dívidas.</div>
          {noPlanoMes.map((x) => (
            <div key={x.id} className="divida-linha" style={{ padding: '8px 0' }}>
              <div className="divida-corpo"><b>{x.nome}</b><div className="cad-sub">{x.ativa === false ? 'quitada' : `deve ${fmt(Number(x.saldo))}`}{Number(x.saldo_inicial) ? ` · era ${fmt(Number(x.saldo_inicial))}` : ''}</div></div>
              <div className="divida-acoes">
                {irPara && <button className="btn btn-ghost btn-sm" onClick={() => irPara('dividas')}>Ver no plano</button>}
                <button className="btn btn-ghost btn-sm" onClick={async () => { if (window.confirm(`Voltar "${x.nome}" para as contas de ${mesLabel(mes)}? A dívida será apagada do plano.`)) await removerDivida(x.id) }}>Desfazer</button>
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
