import { useEffect, useMemo, useState } from 'react'
import CartaoLinha from './CartaoLinha'
import PainelConciliacao from './PainelConciliacao'
import { fmt, mesLabel } from '../../lib/utils'
import { valorParcelaLinha, resumirAnalise } from '../../lib/importacao'
import { reaisParaCentavos } from '../../lib/aulas'
import { pendenciasDoLote } from '../../lib/importacaoLote'

const ROTULO_CONC = { conciliada: ['badge-green', 'Fatura conciliada'], parcial: ['badge-amber', 'Conciliação parcial'], pendente: ['badge-gray', 'Conciliação pendente'] }
const dataHora = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

// ============ 1. Selecionar ============
export function EtapaSelecionar({ a }) {
  const { arquivo, linhas, cartoes, cartaoId, mesFatura, modoValor, lendo, erro, rascunhos, importadas } = a
  const [totalTexto, setTotalTexto] = useState('')
  const soma = Math.round(linhas.filter((l) => l.valor !== '' && !Number.isNaN(Number(l.valor))).reduce((t, l) => t + Number(l.valor), 0) * 100) / 100
  const difBanco = arquivo?.totalBanco != null ? Math.round((soma - arquivo.totalBanco) * 100) / 100 : null
  const pronto = linhas.length > 0 && cartaoId && /^\d{4}-\d{2}$/.test(mesFatura)
  function aoDigitarTotal(t) {
    setTotalTexto(t)
    const c = t.trim() === '' ? null : reaisParaCentavos(t)
    if (t.trim() === '' || c != null) a.definirTotalBanco(c == null ? null : c / 100)
  }
  return (
    <div className="imp-etapa">
      {rascunhos.length > 0 && !arquivo && !lendo && (
        <div className="card imp-rascunhos">
          <b>Importações em andamento</b>
          <div className="cad-sub">Suas decisões ficaram salvas: continue de onde parou. Nada foi gravado ainda.</div>
          {rascunhos.map((r) => (
            <div key={r.id} className="imp-rascunho">
              <span><b>{r.arquivo_nome || 'Arquivo'}</b> · {mesLabel(r.mes)} · {(r.decisoes?.linhas || []).length} linhas <span className="cad-sub">· salva em {dataHora(r.atualizado_em)}</span></span>
              <span><button type="button" className="btn btn-primary btn-sm" onClick={() => a.retomar(r)}>Continuar</button> <button type="button" className="link-btn" onClick={() => window.confirm('Descartar este rascunho? Nada foi gravado, só as suas decisões se perdem.') && a.descartar(r.id)}>descartar</button></span>
            </div>
          ))}
        </div>
      )}

      {importadas.length > 0 && !arquivo && !lendo && (
        <div className="card imp-importadas">
          <b>Faturas já importadas</b>
          <div className="cad-sub">A importação e a conciliação são coisas diferentes: reabra uma fatura para resolver o que ficou pendente. O app compara de novo com o que está lançado agora.</div>
          {importadas.map((l) => {
            const [cor, rot] = ROTULO_CONC[l.status_conciliacao] || ROTULO_CONC.pendente
            const cartao = cartoes.find((c) => c.id === l.cartao_id)
            const n = pendenciasDoLote(l)
            return (
              <div key={l.id} className="imp-rascunho">
                <span><b>{cartao?.nome || 'Cartão'}</b> · {mesLabel(l.mes)} <span className="cad-sub">· {l.arquivo_nome || 'arquivo'} · importada em {dataHora(l.concluida_em)}</span><br />
                  <span className="badge badge-blue">Importação concluída</span> <span className={`badge ${cor}`}>{rot}</span>{n > 0 && l.status_conciliacao !== 'conciliada' && <span className="cad-sub"> · {n} pendência{n === 1 ? '' : 's'} registrada{n === 1 ? '' : 's'}</span>}</span>
                <span><button type="button" className="btn btn-ghost btn-sm" onClick={() => a.reconferir(l)}>{l.status_conciliacao === 'conciliada' ? 'Rever' : 'Conferir de novo'}</button></span>
              </div>
            )
          })}
        </div>
      )}

      {!arquivo && (
        <div className="card imp-escolher">
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Qual fatura você quer conferir?</div>
          <div className="cad-sub" style={{ marginBottom: 12 }}>Suba o PDF da fatura ou o CSV padronizado. O arquivo só é lido: nada é gravado até você confirmar no final.</div>
          <div className="imp-botoes-arquivo">
            <label className={`btn btn-primary ${lendo ? 'desabilitado' : ''}`}>PDF da fatura<input type="file" accept="application/pdf,.pdf" onChange={(e) => { a.abrirPdf(e.target.files[0]); e.target.value = '' }} disabled={!!lendo} hidden /></label>
            <label className={`btn btn-ghost ${lendo ? 'desabilitado' : ''}`}>CSV padronizado<input type="file" accept=".csv" onChange={(e) => { a.abrirCsv(e.target.files[0]); e.target.value = '' }} disabled={!!lendo} aria-label="Arquivo CSV da fatura" hidden /></label>
          </div>
          <div className="cad-sub" style={{ marginTop: 10 }}>Colunas do CSV: data, descricao, valor, categoria, parcela_atual, parcela_total, cartao, observacao. O PDF é lido por IA (limite de uns 3 MB).</div>
        </div>
      )}

      {lendo && <div className="alert alert-blue" role="status"><span className="imp-spinner" aria-hidden="true" /> {lendo}</div>}
      {erro && <div className="alert alert-red" role="alert">{erro}</div>}

      {arquivo && !lendo && (
        <>
          <div className="card imp-resumo-leitura">
            <div className="imp-arquivo-nome"><b>{arquivo.nome}</b> <span className="badge badge-gray">{arquivo.origem === 'pdf' ? 'PDF lido por IA' : 'CSV'}</span> <button type="button" className="link-btn" onClick={() => window.confirm('Trocar de arquivo? As decisões desta importação serão descartadas.') && a.descartar()}>trocar arquivo</button></div>
            <div className="kpi-faixa">
              <div className="kpi"><div className="kpi-rotulo">Lançamentos</div><div className="kpi-valor">{linhas.length}</div></div>
              <div className="kpi"><div className="kpi-rotulo">Total extraído</div><div className="kpi-valor mono">{fmt(soma)}</div><div className="kpi-sub">compras − créditos + encargos</div></div>
              <div className="kpi"><div className="kpi-rotulo">Total do banco</div><div className="kpi-valor mono">{arquivo.totalBanco != null ? fmt(arquivo.totalBanco) : '—'}</div><div className="kpi-sub">{difBanco == null ? 'não informado' : Math.abs(difBanco) <= 0.05 ? '✓ confere com o extraído' : `extraído ${difBanco > 0 ? 'acima' : 'abaixo'} em ${fmt(Math.abs(difBanco))}`}</div></div>
            </div>
            {arquivo.cartoesNoArquivo > 1 && <div className="alert alert-amber" style={{ marginBottom: 0 }}>Este arquivo tem lançamentos de mais de um cartão. O assistente confere um cartão por vez: todas as linhas serão tratadas como do cartão escolhido abaixo.</div>}
            {arquivo.origem === 'pdf' && (difBanco != null && Math.abs(difBanco) > 0.05 || arquivo.descartadas > 0) && (
              <div className="alert alert-amber" style={{ marginBottom: 0 }}>
                <b>Confira esta leitura.</b>
                {difBanco != null && Math.abs(difBanco) > 0.05 && <div>A soma das linhas lidas difere do total da fatura em {fmt(Math.abs(difBanco))}: pode haver encargo, crédito ou uma linha que a leitura não pegou.</div>}
                {arquivo.descartadas > 0 && <div>{arquivo.descartadas} linha{arquivo.descartadas > 1 ? 's' : ''} sem data ou valor válido ficou{arquivo.descartadas > 1 ? 'ram' : ''} de fora.</div>}
              </div>
            )}
          </div>

          <div className="card imp-config">
            <div className="form-row cols3">
              <div className="form-group"><label>Cartão desta fatura</label>
                <select value={cartaoId} onChange={(e) => a.definirCartao(e.target.value)}><option value="">Escolha…</option>{cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select>
              </div>
              <div className="form-group"><label>Mês da fatura</label><input type="month" value={mesFatura} onChange={(e) => e.target.value && a.definirMes(e.target.value)} /></div>
              <div className="form-group"><label>Total da fatura (banco) <span className="cad-sub">opcional</span></label><input inputMode="decimal" value={totalTexto || (arquivo.totalBanco != null ? String(arquivo.totalBanco).replace('.', ',') : '')} onChange={(e) => aoDigitarTotal(e.target.value)} placeholder="Ex.: 3.250,90" /></div>
            </div>
            <div className="form-group" style={{ maxWidth: 380, marginBottom: 0 }}><label>Valor das compras parceladas no arquivo</label>
              <select value={modoValor} onChange={(e) => a.definirModo(e.target.value)}><option value="parcela">É o valor da parcela (padrão de fatura)</option><option value="total">É o valor total da compra</option></select>
            </div>
            <div className="cad-sub" style={{ marginTop: 8 }}>Identificamos o cartão e o mês pelo arquivo; corrija se precisar. Informar o total do banco deixa a conciliação mais confiável.</div>
          </div>
          <div className="imp-navegacao"><span /><button type="button" className="btn btn-primary" disabled={!pronto} onClick={() => a.irPara(2)}>Analisar lançamentos →</button></div>
        </>
      )}
    </div>
  )
}

// ============ 2. Analisar ============
export function EtapaAnalise({ a, aoAbrirGrupo }) {
  const { analise, linhas } = a
  if (!analise) return <div className="alert alert-amber">Escolha o cartão e o mês na etapa anterior.</div>
  const c = analise.contadores
  const g = analise.grupos
  const v = (ls) => ls.reduce((t, l) => t + valorParcelaLinha(l, a.modoValor), 0)
  const resumo = resumirAnalise(linhas.filter((l) => l.cartao_id === a.cartaoId))
  const Cartao = ({ rotulo, n, valor, grupo, cor, sub }) => (
    <button type="button" className={`imp-resumo ${cor}`} onClick={() => aoAbrirGrupo(grupo)} disabled={n === 0}>
      <span className="imp-resumo-n">{n}</span><span className="imp-resumo-rotulo">{rotulo}</span>
      <span className="cad-sub mono">{valor != null ? fmt(valor) : sub || ' '}</span>
    </button>
  )
  return (
    <div className="imp-etapa">
      <p className="imp-lead"><b>{c.identificadas} lançamentos identificados</b> em {mesLabel(a.mesFatura)}. {c.pendencias === 0 ? 'Nada pendente.' : `${c.pendencias} ponto${c.pendencias === 1 ? '' : 's'} para você olhar.`}</p>
      {resumo.pareceJaImportado && c.novas === 0 && <div className="alert alert-amber"><b>Esta fatura parece já ter sido importada:</b> quase tudo já está lançado e nada novo sobrou. Se alguma linha for mesmo outra compra, abra e marque.</div>}
      <div className="imp-resumos">
        <Cartao rotulo="Já registradas" n={c.registradas} valor={v(g.registradas)} grupo="registradas" cor="ok" />
        <Cartao rotulo="Novas" n={c.novas} valor={v(g.novas)} grupo="novas" cor="novo" />
        <Cartao rotulo="Precisam de revisão" n={c.revisao} valor={v(g.revisao)} grupo="revisao" cor={c.revisao ? 'atencao' : 'ok'} />
        <Cartao rotulo="Só no aplicativo" n={c.divergenciasApp} valor={g.divergenciasApp.reduce((t, d) => t + Number(d.valor || 0), 0)} grupo="app" cor={c.divergenciasApp ? 'atencao' : 'ok'} sub="lançadas, fora da fatura" />
      </div>
      {c.ignoradas > 0 && <div className="cad-sub">{c.ignoradas} linha{c.ignoradas > 1 ? 's' : ''} de pagamento da fatura anterior ficou{c.ignoradas > 1 ? 'ram' : ''} de fora do total.</div>}
      <PainelConciliacao analise={analise} mostrarStatusAtual />
      <div className="imp-navegacao">
        <button type="button" className="btn btn-ghost" onClick={() => a.irPara(1)}>← Voltar</button>
        {c.pendencias === 0 ? <button type="button" className="btn btn-primary" onClick={() => a.irPara(4)}>Tudo certo: ir para confirmar →</button> : <button type="button" className="btn btn-primary" onClick={() => aoAbrirGrupo('revisao')}>Revisar pendências →</button>}
      </div>
    </div>
  )
}

// ============ 3. Revisar ============
export function EtapaRevisar({ a, filtroInicial, abrirCompra }) {
  const { analise } = a
  const [filtro, setFiltro] = useState(filtroInicial || (analise?.contadores.revisao ? 'revisao' : 'novas'))
  // Linhas que estavam em revisão e foram resolvidas aqui continuam visíveis (marcadas como prontas) até sair da tela:
  // sumir de repente dava a impressão de que a compra tinha sido lançada. Nada é gravado antes de "Confirmar importação".
  const [resolvidas, setResolvidas] = useState(() => new Set((analise?.grupos.revisao || []).map((l) => l._id)))
  useEffect(() => {
    const ids = analise?.grupos.revisao.map((l) => l._id) || []
    if (ids.some((id) => !resolvidas.has(id))) setResolvidas((r) => new Set([...r, ...ids]))
  }, [analise, resolvidas])
  const lista = useMemo(() => {
    if (!analise) return []
    const g = analise.grupos
    if (filtro === 'revisao') {
      const todas = [...g.revisao, ...g.novas, ...g.registradas].filter((l) => resolvidas.has(l._id))
      const ordem = new Map(a.linhas.map((l, i) => [l._id, i]))
      return todas.sort((x, y) => ordem.get(x._id) - ordem.get(y._id))
    }
    return { novas: g.novas, registradas: g.registradas, ignoradas: g.ignoradas, app: [] }[filtro] || []
  }, [analise, filtro, resolvidas, a.linhas])
  if (!analise) return null
  const c = analise.contadores
  const pills = [['revisao', `Revisão (${c.revisao})`], ['novas', `Novas (${c.novas})`], ['registradas', `Registradas (${c.registradas})`], ['app', `Só no app (${c.divergenciasApp})`], ...(c.ignoradas ? [['ignoradas', `Ignoradas (${c.ignoradas})`]] : [])]
  const acoes = { atualizarLinha: a.atualizarLinha, decidir: a.decidir, escolherParcelamento: a.escolherParcelamento, mudarCategoria: a.mudarCategoria }
  return (
    <div className="imp-etapa">
      <PainelConciliacao analise={analise} />
      <div className="imp-filtros" role="group" aria-label="Grupos de lançamentos">
        {pills.map(([k, rot]) => <button key={k} type="button" className={`btn btn-sm ${filtro === k ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={filtro === k} onClick={() => setFiltro(k)}>{rot}</button>)}
      </div>

      {filtro === 'revisao' && c.revisao === 0 && <div className="card"><div className="empty" style={{ padding: 14 }}>Nenhuma pendência de revisão. ✓{lista.length > 0 && ' As linhas que você resolveu continuam aqui até confirmar.'}</div></div>}
      {filtro === 'revisao' && lista.length > 0 && <p className="cad-sub">Nada é gravado agora: as compras só entram quando você confirmar a importação, no último passo.</p>}
      {filtro === 'app' ? (
        analise.grupos.divergenciasApp.length === 0 ? <div className="card"><div className="empty" style={{ padding: 14 }}>Tudo o que está lançado neste cartão e mês aparece na fatura. ✓</div></div> : (
          <>
            <p className="cad-sub">Lançadas no app para este cartão e mês, mas que não estão no arquivo. Pode ser compra de outra fatura, valor errado ou algo que não é desta fatura.</p>
            {analise.grupos.divergenciasApp.map((d, i) => (
              <article key={d.compra?.id || d.fixo?.id || i} className="imp-linha app">
                <div className="imp-linha-topo static"><span className="imp-data">{d.compra ? String(d.compra.data_compra).slice(8, 10) + '/' + String(d.compra.data_compra).slice(5, 7) : 'fixa'}</span><span className="imp-nome"><b>{d.compra ? (d.compra.identificacao || d.compra.descricao) : d.fixo.nome}</b><small>{d.compra ? `${d.compra.categoria}${Number(d.compra.parcelas) > 1 ? ` · ${d.parcela}/${d.de}` : ''}` : 'conta fixa neste cartão'}</small></span><span className="imp-valor mono">{fmt(d.valor)}</span></div>
                {d.compra && <div className="imp-linha-corpo"><button type="button" className="btn btn-ghost btn-sm" onClick={() => abrirCompra(d.compra)}>Editar a compra</button></div>}
              </article>
            ))}
          </>
        )
      ) : (
        lista.map((l) => (
          <CartaoLinha key={l._id} l={l} aberto={l.grupo === 'revisao'} valorLinha={valorParcelaLinha(l, a.modoValor)} mesFatura={a.mesFatura} cartaoId={a.cartaoId} cartoes={a.cartoes} fechamentos={a.fechamentos} categorias={a.categorias} pessoas={a.pessoas} bancoV2={a.bancoV2 !== false} modoValor={a.modoValor} acoes={acoes} />
        ))
      )}
      <div className="imp-navegacao"><button type="button" className="btn btn-ghost" onClick={() => a.irPara(2)}>← Voltar</button><button type="button" className="btn btn-primary" onClick={() => a.irPara(4)}>Continuar para confirmar →</button></div>
    </div>
  )
}

// ============ 4. Confirmar ============
export function EtapaConfirmar({ a }) {
  const { plano, analise } = a
  if (!plano || !analise) return null
  const { gravar, emAberto, previa } = { gravar: plano.previa.gravar, emAberto: plano.previa.emAberto, previa: plano.previa }
  const [corConc, rotConc] = { conciliada: ['badge-green', 'Fatura conciliada'], parcial: ['badge-amber', 'Conciliação parcial'], pendente: ['badge-gray', 'Conciliação pendente'] }[previa.statusProjetado]
  const nAberto = emAberto.revisao + emAberto.divergenciasApp + emAberto.deixadasDeFora
  return (
    <div className="imp-etapa">
      <PainelConciliacao analise={analise} />
      <div className="imp-confirmar-grade">
        <section className="card imp-gravar">
          <h3>Será gravado</h3>
          {!previa.temAlgoParaGravar && <p className="cad-sub">{a.conciliando ? 'Nada a gravar: ao confirmar, só o estado da conciliação é atualizado.' : 'Nada a gravar com as decisões atuais. Suas decisões ficam salvas como rascunho.'}</p>}
          {gravar.criar.qtd > 0 && (
            <div><b>{gravar.criar.qtd} nova{gravar.criar.qtd === 1 ? '' : 's'} compra{gravar.criar.qtd === 1 ? '' : 's'}</b> · {fmt(gravar.criar.valor)}
              <ul className="imp-lista">{gravar.criar.itens.slice(0, 6).map((i) => <li key={i.id}>{i.nome} <span className="cad-sub">· {i.categoria}</span> <span className="mono">{fmt(i.valor)}</span></li>)}{gravar.criar.itens.length > 6 && <li className="cad-sub">+ {gravar.criar.itens.length - 6} compras</li>}</ul>
            </div>
          )}
          {gravar.parcelamentos.length > 0 && (
            <div><b>{gravar.parcelamentos.length} parcelamento{gravar.parcelamentos.length === 1 ? '' : 's'} reconstruído{gravar.parcelamentos.length === 1 ? '' : 's'}</b>
              <ul className="imp-lista">{gravar.parcelamentos.map((p, i) => <li key={i}>{p.opcao === 'so_esta' ? <>{p.descricao}: parcela {p.parcelaAtual}/{p.total} · <b>só esta parcela</b> ({fmt(p.valorParcela)} em {mesLabel(a.mesFatura)}), sem mexer nos meses passados</> : <>{p.descricao}: parcela {p.parcelaAtual}/{p.total} · cria {p.total} parcelas de {mesLabel(p.primeiraParcela)} a {mesLabel(p.ultimaParcela)} ({p.anteriores} no passado, {p.restantes} daqui para frente) <span className="cad-sub">· data estimada</span>{p.mesesFechados.length > 0 && <span className="imp-erro"> · altera mês fechado: {p.mesesFechados.map(mesLabel).join(', ')}</span>}</>}</li>)}</ul>
            </div>
          )}
          {gravar.atualizar.length > 0 && (
            <div><b>{gravar.atualizar.length} valor{gravar.atualizar.length === 1 ? '' : 'es'} atualizado{gravar.atualizar.length === 1 ? '' : 's'}</b>
              <ul className="imp-lista">{gravar.atualizar.map((u) => <li key={u.compra_id}>{u.descricao}: {fmt(u.valor_anterior)} → <b>{fmt(u.valor_total)}</b>{u.dividida && <span className="imp-erro"> (compra dividida: não será alterada; edite em Compras)</span>}</li>)}</ul>
            </div>
          )}
          {gravar.mover.length > 0 && (
            <div><b>{gravar.mover.length} compra{gravar.mover.length === 1 ? '' : 's'} movida{gravar.mover.length === 1 ? '' : 's'} para esta fatura</b>
              <ul className="imp-lista">{gravar.mover.map((m) => <li key={m.compra_id}>{m.descricao}: {m.fatura_mes_anterior ? mesLabel(m.fatura_mes_anterior) : 'fatura automática'} → {mesLabel(m.fatura_mes)} <span className="mono">{fmt(m.valor)}</span></li>)}</ul>
            </div>
          )}
          {gravar.vinculadas > 0 && <div className="cad-sub">{gravar.vinculadas} linha{gravar.vinculadas === 1 ? '' : 's'} vinculada{gravar.vinculadas === 1 ? '' : 's'} a lançamentos existentes (nada é criado).</div>}
        </section>
        <section className="card imp-aberto">
          <h3>Continua em aberto</h3>
          {nAberto === 0 && previa.ignoradas === 0 && <p className="cad-sub">Nenhuma pendência. ✓</p>}
          {emAberto.revisao > 0 && <div>{emAberto.revisao} lançamento{emAberto.revisao === 1 ? '' : 's'} para revisar{emAberto.adiadas ? ` (${emAberto.adiadas} marcado${emAberto.adiadas === 1 ? '' : 's'} "revisar depois")` : ''}</div>}
          {emAberto.deixadasDeFora > 0 && <div>{emAberto.deixadasDeFora} linha{emAberto.deixadasDeFora === 1 ? '' : 's'} nova{emAberto.deixadasDeFora === 1 ? '' : 's'} deixada{emAberto.deixadasDeFora === 1 ? '' : 's'} de fora</div>}
          {emAberto.divergenciasApp > 0 && <div>{emAberto.divergenciasApp} lançamento{emAberto.divergenciasApp === 1 ? '' : 's'} no app sem par na fatura</div>}
          {previa.ignoradas > 0 && <div className="cad-sub">{previa.ignoradas} pagamento{previa.ignoradas === 1 ? '' : 's'} da fatura anterior ignorado{previa.ignoradas === 1 ? '' : 's'} (não entram no total)</div>}
          {nAberto > 0 && <p className="cad-sub">Divergências não resolvidas <b>não serão corrigidas automaticamente</b>: ficam guardadas para você conferir depois.</p>}
        </section>
      </div>
      <div className="imp-estados">
        <span>Importação: <span className="badge badge-blue">{a.conciliando ? 'já concluída' : previa.temAlgoParaGravar ? 'será concluída' : 'nada a gravar'}</span></span>
        <span>Conciliação depois de gravar: <span className={`badge ${corConc}`}>{rotConc}</span></span>
      </div>
      {a.erro && <div className="alert alert-red" role="alert" style={{ whiteSpace: 'pre-line' }}>{a.erro}</div>}
      <div className="imp-navegacao">
        <button type="button" className="btn btn-ghost" onClick={() => a.irPara(3)}>← Voltar</button>
        <button type="button" className="btn btn-primary" disabled={(!previa.temAlgoParaGravar && !a.conciliando) || a.confirmando} onClick={a.confirmar}>{a.confirmando ? 'Gravando…' : a.conciliando ? 'Confirmar conferência' : 'Confirmar importação'}</button>
      </div>
    </div>
  )
}

// ============ Resultado ============
export function Resultado({ a, aoVerFaturas }) {
  const r = a.resultado
  if (!r) return null
  const aberto = r.pendencias || { revisao: 0, divergenciasApp: 0, deixadasDeFora: 0 }
  const nAberto = aberto.revisao + aberto.divergenciasApp + aberto.deixadasDeFora
  return (
    <div className="imp-etapa">
      <div className={`alert ${r.tipo === 'aviso' ? 'alert-amber' : 'alert-green'}`}>
        <b>{r.tipo === 'ok' ? '✓ ' : ''}{r.titulo}</b>
        <div style={{ fontSize: 13, marginTop: 4 }}>{r.detalhe}</div>
        {r.aviso && <div style={{ fontSize: 12, marginTop: 6 }}>⚠ {r.aviso}</div>}
      </div>
      {r.r && !r.r.repetida && (
        <div className="card imp-resultado">
          <div className="kpi-faixa">
            <div className="kpi"><div className="kpi-rotulo">Compras criadas</div><div className="kpi-valor">{r.r.criadas ?? 0}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Valores atualizados</div><div className="kpi-valor">{r.r.atualizadas ?? 0}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Movidas de fatura</div><div className="kpi-valor">{r.r.movidas ?? 0}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Pendências abertas</div><div className="kpi-valor" style={{ color: nAberto ? 'var(--amber)' : 'var(--green)' }}>{nAberto}</div></div>
          </div>
          {nAberto > 0 && <p className="cad-sub">As divergências ficaram guardadas neste lote para você conferir depois.</p>}
        </div>
      )}
      <div className="imp-navegacao"><button type="button" className="btn btn-ghost" onClick={a.limpar}>Importar outra fatura</button><button type="button" className="btn btn-primary" onClick={aoVerFaturas}>Ver faturas →</button></div>
    </div>
  )
}
