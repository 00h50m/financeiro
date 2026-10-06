import { useMemo, useState } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths, gerarParcelas } from '../lib/utils'
import { resumoDoMes } from '../lib/financeiro'
import { saldoMeta } from '../lib/metas'
import { simular, analisar, melhorInicio, taxaMensalDeAnual, saldoDevedorEstimado, taxaDaObservacao, LIMITES } from '../lib/emprestimo'
import { terminandoLogo } from '../lib/parcelamentos'

const lerNum = (t) => {
  const s = String(t ?? '').trim()
  if (!s) return NaN
  return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
}
const pctTxt = (x, c = 2) => (x * 100).toFixed(c).replace('.', ',') + '%'
const COR = { cabe: 'green', apertado: 'amber', nao_cabe: 'red', sem_dados: 'blue' }
const TITULO = {
  cabe: '✓ Cabe no seu orçamento',
  apertado: '⚠ Cabe, mas apertado',
  nao_cabe: '✕ Não cabe no seu orçamento',
  sem_dados: 'Falta cadastrar a renda para analisar',
}
const COR_PONTO = { bom: 'var(--green)', atencao: 'var(--amber)', ruim: 'var(--red)', aviso: 'var(--blue)', info: 'var(--text3)' }
const ICONE_PONTO = { bom: '●', atencao: '●', ruim: '●', aviso: '●', info: '○' }
const CHAVE_CENARIOS = 'emprestimos_cenarios'
const lerLocal = () => { try { return JSON.parse(localStorage.getItem(CHAVE_CENARIOS) || '[]') } catch { return [] } }
const gravarLocal = (l) => { try { localStorage.setItem(CHAVE_CENARIOS, JSON.stringify(l)) } catch { /* sem armazenamento: não lembra */ } }

export default function Emprestimos({ store, irPara }) {
  const { compras, cartoes, categorias, pessoas, metas, metasMovimentos, metasOk, config, configOk, definirConfig, addCompra } = store
  const hoje = nowYM()
  const [f, setF] = useState({
    nome: '', valor: '', tipoTaxa: 'mes', taxa: '', prazo: '24', sistema: 'price', iof: '', tarifa: '', seguro: '',
    financiarCustos: true, primeiro: addMonths(hoje, 1), dia: '10', pessoa: pessoas[0]?.nome || '',
  })
  const [salvando, setSalvando] = useState(false)
  // Propostas guardadas: na conta (tabela config) quando existe, para aparecerem no celular e no computador; senão só neste aparelho.
  const cenarios = configOk && Array.isArray(config?.[CHAVE_CENARIOS]) ? config[CHAVE_CENARIOS] : configOk ? [] : lerLocal()
  const salvarCenarios = (lista) => (configOk ? definirConfig(CHAVE_CENARIOS, lista) : gravarLocal(lista))
  const [verCronograma, setVerCronograma] = useState(false)
  const s = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))

  const valor = lerNum(f.valor), prazo = Number(f.prazo), taxaIn = lerNum(f.taxa)
  const taxaMes = Number.isFinite(taxaIn) ? (f.tipoTaxa === 'ano' ? taxaMensalDeAnual(taxaIn / 100) : taxaIn / 100) : NaN
  const sim = useMemo(() => {
    if (!(valor > 0) || !Number.isInteger(prazo) || prazo < 1 || prazo > 120 || !(taxaMes >= 0)) return null
    return simular({ valor, taxaMes, prazo, sistema: f.sistema, iofPct: lerNum(f.iof) || 0, tarifa: lerNum(f.tarifa) || 0, seguroMes: lerNum(f.seguro) || 0, financiarCustos: f.financiarCustos })
  }, [valor, taxaMes, prazo, f.sistema, f.iof, f.tarifa, f.seguro, f.financiarCustos])

  const analise = useMemo(() => {
    if (!sim || !/^\d{4}-\d{2}$/.test(f.primeiro)) return null
    const cacheDetalhes = new Map()
    const dadosDoMes = (m) => { const r = resumoDoMes(store, m, { usarSaldoAnterior: false, cacheDetalhes }); return { renda: r.renda, comprometido: r.comprometido } }
    let rendaFallback = 0
    for (let i = 0; i <= 12 && !rendaFallback; i++) rendaFallback = dadosDoMes(addMonths(hoje, -i)).renda
    const reserva = metasOk ? (() => { const m = metas.find((x) => x.tipo === 'reserva'); return m ? saldoMeta(metasMovimentos, m.id) : null })() : Number(config?.reserva_valor) || null
    const acabam = terminandoLogo(compras, cartoes, hoje, 24).map((a) => ({ mes: a.termino, libera: a.libera }))
    const a = analisar({ sim, primeiroMes: f.primeiro, dadosDoMes, rendaFallback, reserva, parcelamentosQueAcabam: acabam })
    return { ...a, melhor: a.veredito === 'cabe' || a.semRenda ? null : melhorInicio(sim, f.primeiro, dadosDoMes, rendaFallback, 12) }
  }, [sim, f.primeiro, store.compras, store.fixos, store.rendas, store.faturas, store.cartoes])

  const contratados = compras.filter((c) => c.origem === 'emprestimo')

  async function contratar() {
    if (!sim) return
    const nome = f.nome.trim() || 'Empréstimo'
    if (analise?.veredito === 'nao_cabe' && !confirm('A análise diz que essa parcela NÃO cabe no seu orçamento.\n\nQuer adicionar mesmo assim?')) return
    if (!confirm(`Adicionar "${nome}" ao app?\n\n${sim.prazo} parcelas de ${fmt(sim.primeira)} a partir de ${mesLabel(f.primeiro)} (total ${fmt(sim.total)}). Elas passam a contar em Pagamentos, Parcelamentos e no Dashboard.${f.sistema === 'sac' ? '\n\nAtenção: no sistema SAC as parcelas diminuem, mas o app registra parcelas iguais (a média).' : ''}`)) return
    setSalvando(true)
    const cat = categorias.find((c) => c.nome === 'Financeiro') || categorias[0]
    const dia = String(Math.min(28, Math.max(1, Number(f.dia) || 10))).padStart(2, '0')
    const ok = await addCompra({
      data_compra: `${f.primeiro}-${dia}`,
      descricao: `Empréstimo ${nome}`.trim(),
      categoria: cat?.nome || 'Financeiro',
      subcategoria: cat?.subcategorias?.includes('Empréstimos') ? 'Empréstimos' : cat?.subcategorias?.[0] || 'Outros',
      pessoa: f.pessoa || pessoas[0]?.nome || '',
      cartao_id: null,
      valor_total: sim.total,
      parcelas: sim.prazo,
      origem: 'emprestimo',
      pago: false,
      obs: `Empréstimo de ${fmt(sim.valor)} · taxa ${pctTxt(sim.taxaMes)} a.m. · CET ${pctTxt(sim.cetMes)} a.m. (${pctTxt(sim.cetAno, 1)} a.a.) · ${sim.sistema === 'sac' ? 'SAC' : 'Price'}`,
    })
    setSalvando(false)
    if (ok) { alert('Empréstimo adicionado. Confira em Parcelamentos e Pagamentos.\n\nLembrete: o dinheiro que entrou na sua conta não é lançado como renda automaticamente — se quiser, registre em Renda.'); irPara?.('parcelamentos') }
  }

  function guardar() {
    if (!sim || !analise) return
    const novo = { id: Date.now(), nome: f.nome.trim() || `${fmtK(sim.valor)} em ${sim.prazo}x`, valor: sim.valor, prazo: sim.prazo, taxaMes: sim.taxaMes, primeira: sim.primeira, total: sim.total, cetAno: sim.cetAno, veredito: analise.veredito, sistema: sim.sistema }
    salvarCenarios([novo, ...cenarios].slice(0, 5))
  }
  const removerCenario = (id) => salvarCenarios(cenarios.filter((c) => c.id !== id))

  const erroEntrada = !f.valor.trim() ? '' : !(valor > 0) ? 'Digite o valor que vai receber (ex.: 10000).' : !Number.isFinite(taxaIn) ? 'Digite a taxa de juros (ex.: 2,1).' : !Number.isInteger(prazo) || prazo < 1 || prazo > 120 ? 'O prazo deve ser de 1 a 120 meses.' : ''

  return (
    <div className="page">
      <div className="alert alert-blue">
        Simule um empréstimo antes de contratar: o app calcula a parcela e o <b>custo real (CET)</b> e cruza com a sua renda, contas fixas, faturas e parcelamentos
        para dizer <b>mês a mês se cabe no orçamento</b>. Nada é gravado até você clicar em "Contratar".
      </div>

      <div className="section-label">dados da proposta</div>
      <div className="card" style={{ padding: 16, overflow: 'visible' }}>
        <div className="form-row cols2">
          <div className="form-group"><label>Nome / banco (opcional)</label><input value={f.nome} onChange={s('nome')} placeholder="Ex: Banco X — reforma" /></div>
          <div className="form-group"><label>Quanto você vai receber (R$)</label><input value={f.valor} onChange={s('valor')} inputMode="decimal" placeholder="10000" /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group">
            <label>Taxa de juros (%)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={f.taxa} onChange={s('taxa')} inputMode="decimal" placeholder="2,1" />
              <select value={f.tipoTaxa} onChange={s('tipoTaxa')} style={{ width: 120 }}><option value="mes">ao mês</option><option value="ano">ao ano</option></select>
            </div>
          </div>
          <div className="form-group"><label>Prazo (meses)</label><input type="number" min="1" max="120" value={f.prazo} onChange={s('prazo')} /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group">
            <label>Sistema de amortização</label>
            <select value={f.sistema} onChange={s('sistema')}>
              <option value="price">Parcelas iguais (Price) — o mais comum</option>
              <option value="sac">Parcelas decrescentes (SAC)</option>
            </select>
          </div>
          <div className="form-group"><label>1ª parcela em</label><input type="month" value={f.primeiro} onChange={s('primeiro')} min={hoje} /></div>
        </div>
        <details>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--text2)', margin: '4px 0 10px' }}>Custos extras (IOF, tarifa, seguro) — deixam a análise mais exata</summary>
          <div className="form-row cols2">
            <div className="form-group"><label>IOF total (% do valor)</label><input value={f.iof} onChange={s('iof')} inputMode="decimal" placeholder="Ex: 3,5" /></div>
            <div className="form-group"><label>Tarifa de contratação (R$)</label><input value={f.tarifa} onChange={s('tarifa')} inputMode="decimal" placeholder="0" /></div>
          </div>
          <div className="form-row cols2">
            <div className="form-group"><label>Seguro por mês (R$)</label><input value={f.seguro} onChange={s('seguro')} inputMode="decimal" placeholder="0" /></div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={f.financiarCustos} onChange={s('financiarCustos')} /> IOF e tarifa entram no financiamento
              </label>
            </div>
          </div>
        </details>
        {erroEntrada && <div className="alert alert-amber" style={{ marginBottom: 0 }}>{erroEntrada}</div>}
      </div>

      {!sim && !erroEntrada && <div className="empty">Preencha o valor, a taxa e o prazo para ver a simulação.</div>}

      {sim && analise && (
        <>
          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">{sim.sistema === 'sac' ? 'Parcela (1ª → última)' : 'Parcela'}</div>
              <div className="metric-val blue">{sim.sistema === 'sac' ? `${fmtK(sim.primeira)} → ${fmtK(sim.ultima)}` : fmt(sim.primeira)}</div>
            </div>
            <div className="metric"><div className="metric-label">Total que você paga</div><div className="metric-val amber">{fmt(sim.total)}</div></div>
            <div className="metric"><div className="metric-label">Custo (juros e taxas)</div><div className="metric-val red">{fmt(sim.custo)}</div></div>
            <div className="metric"><div className="metric-label">CET (custo real)</div><div className="metric-val">{pctTxt(sim.cetMes)} a.m.</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{pctTxt(sim.cetAno, 1)} ao ano</div></div>
          </div>

          <div className={`alert alert-${COR[analise.veredito]}`} style={{ padding: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>{TITULO[analise.veredito]}</div>
            {analise.melhor && analise.melhor.espera > 0 && (
              <div style={{ marginBottom: 8 }}>💡 Começando em <b>{mesLabel(analise.melhor.inicio)}</b> (daqui a {analise.melhor.espera} mese{analise.melhor.espera > 1 ? 's' : ''}) o orçamento comporta essa parcela com folga.</div>
            )}
            {analise.veredito !== 'cabe' && analise.veredito !== 'sem_dados' && !analise.melhor && (
              <div style={{ marginBottom: 8 }}>💡 Nos próximos 12 meses não achei um mês de início em que essa parcela caiba com folga. Considere um valor menor ou um prazo maior.</div>
            )}
            {analise.pontos.map((p, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, lineHeight: 1.6, marginTop: 4 }}>
                <span style={{ color: COR_PONTO[p.tipo], flex: '0 0 auto' }}>{ICONE_PONTO[p.tipo]}</span><span>{p.texto}</span>
              </div>
            ))}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 10 }}>
              Análise automática com os dados do app (renda, contas fixas, faturas e parcelamentos de cada mês). Referências como "parcela até {Math.round(LIMITES.parcelaSobreRenda * 100)}% da renda" são regras gerais de planejamento, não recomendação financeira personalizada.
            </div>
          </div>

          <div className="section-label">impacto mês a mês (primeiros {Math.min(12, analise.meses.length)} meses)</div>
          <div className="card">
            <table>
              <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Renda</th><th style={{ textAlign: 'right' }}>Comprometido hoje</th><th style={{ textAlign: 'right' }}>Parcela</th><th style={{ textAlign: 'right' }}>Sobra sem o empréstimo</th><th style={{ textAlign: 'right' }}>Sobra com o empréstimo</th></tr></thead>
              <tbody>
                {analise.meses.slice(0, 12).map((m) => (
                  <tr key={m.mes}>
                    <td className="mono">{mesLabel(m.mes)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(m.renda)}{m.rendaEstimada && <span title="Sem renda cadastrada: usei a última conhecida" style={{ color: 'var(--text3)' }}>*</span>}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(m.antes)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(m.parcela)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(m.sobraAntes)}</td>
                    <td style={{ textAlign: 'right', color: m.sobraDepois < 0 ? 'var(--red)' : m.renda > 0 && m.sobraDepois < m.renda * LIMITES.folgaMinima ? 'var(--amber)' : 'var(--green)' }} className="mono">{fmt(m.sobraDepois)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {analise.meses.some((m) => m.rendaEstimada) && <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text3)', borderTop: '1px solid var(--border)' }}>* mês sem renda cadastrada: usei a última renda conhecida.</div>}
          </div>

          <div className="section-label">e se o prazo fosse outro? (mesma taxa e custos)</div>
          <div className="card">
            <table>
              <thead><tr><th>Prazo</th><th style={{ textAlign: 'right' }}>{sim.sistema === 'sac' ? '1ª parcela' : 'Parcela'}</th><th style={{ textAlign: 'right' }}>Total pago</th><th style={{ textAlign: 'right' }}>Custo</th><th style={{ textAlign: 'right' }}>Parcela / renda</th><th>Cabe?</th></tr></thead>
              <tbody>
                {analise.alternativas.map((a) => (
                  <tr key={a.prazo} style={a.atual ? { background: 'var(--bg3)' } : undefined}>
                    <td>{a.prazo} meses {a.atual && <span className="badge badge-blue" style={{ fontSize: 10 }}>simulado</span>}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(a.primeira)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(a.total)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{fmt(a.custo)}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{analise.semRenda ? '—' : Math.round(a.maiorPct * 100) + '%'}</td>
                    <td>{analise.semRenda ? '—' : a.folgado ? <span className="badge badge-green">com folga</span> : a.cabe ? <span className="badge badge-amber">apertado</span> : <span className="badge badge-red">não cabe</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="toolbar" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={contratar} disabled={salvando}>{salvando ? 'Adicionando...' : 'Contratar e adicionar ao app'}</button>
            <button className="btn btn-ghost" onClick={guardar}>Guardar para comparar</button>
            <button className="btn btn-ghost" onClick={() => setVerCronograma((v) => !v)}>{verCronograma ? 'Esconder' : 'Ver'} tabela de parcelas</button>
          </div>

          {verCronograma && (
            <div className="card" style={{ maxHeight: 360, overflow: 'auto' }}>
              <table>
                <thead><tr><th>#</th><th>Mês</th><th style={{ textAlign: 'right' }}>Parcela</th><th style={{ textAlign: 'right' }}>Juros</th><th style={{ textAlign: 'right' }}>Amortização</th><th style={{ textAlign: 'right' }}>Saldo devedor</th></tr></thead>
                <tbody>
                  {sim.parcelas.map((p) => (
                    <tr key={p.n}><td>{p.n}</td><td className="mono">{mesLabel(addMonths(f.primeiro, p.n - 1))}</td><td style={{ textAlign: 'right' }} className="mono">{fmt(p.valor)}</td><td style={{ textAlign: 'right' }} className="mono">{fmt(p.juros)}</td><td style={{ textAlign: 'right' }} className="mono">{fmt(p.amort)}</td><td style={{ textAlign: 'right' }} className="mono">{fmt(p.saldo)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {cenarios.length > 0 && (
        <>
          <div className="section-label">propostas guardadas para comparar</div>
          <div className="card">
            <table>
              <thead><tr><th>Proposta</th><th style={{ textAlign: 'right' }}>Valor</th><th style={{ textAlign: 'right' }}>Prazo</th><th style={{ textAlign: 'right' }}>Parcela</th><th style={{ textAlign: 'right' }}>Total pago</th><th style={{ textAlign: 'right' }}>CET a.a.</th><th>Cabe?</th><th /></tr></thead>
              <tbody>
                {cenarios.map((c) => {
                  const melhorCet = Math.min(...cenarios.map((x) => x.cetAno))
                  return (
                    <tr key={c.id}>
                      <td>{c.nome}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(c.valor)}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{c.prazo}x</td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(c.primeira)}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(c.total)}</td>
                      <td style={{ textAlign: 'right', color: c.cetAno === melhorCet && cenarios.length > 1 ? 'var(--green)' : undefined }} className="mono">{pctTxt(c.cetAno, 1)}</td>
                      <td><span className={`badge badge-${COR[c.veredito] === 'blue' ? 'gray' : COR[c.veredito]}`}>{c.veredito === 'cabe' ? 'cabe' : c.veredito === 'apertado' ? 'apertado' : c.veredito === 'nao_cabe' ? 'não cabe' : '—'}</span></td>
                      <td><button className="btn btn-danger" onClick={() => removerCenario(c.id)} aria-label="Remover proposta">×</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div style={{ padding: '8px 14px', fontSize: 11, color: 'var(--text3)' }}>Compare pelo CET (custo real), não pela taxa anunciada. {configOk ? 'Ficam guardadas na sua conta.' : 'Guardado só neste aparelho (rode config.sql no Supabase para guardar na conta).'}</div>
          </div>
        </>
      )}

      {contratados.length > 0 && (
        <>
          <div className="section-label">empréstimos contratados no app</div>
          <div className="card">
            <table>
              <thead><tr><th>Empréstimo</th><th style={{ textAlign: 'right' }}>Parcela</th><th style={{ textAlign: 'center' }}>Parcelas</th><th style={{ textAlign: 'right' }}>Falta pagar</th><th style={{ textAlign: 'right' }} title="Valor presente das parcelas que faltam, à taxa do contrato: é o que o banco deve cobrar para quitar hoje (estimativa)">Quitando hoje (estim.)</th><th>Termina</th></tr></thead>
              <tbody>
                {contratados.map((c) => {
                  const ps = gerarParcelas(c, cartoes)
                  const resta = ps.filter((p) => p.mes >= hoje)
                  return (
                    <tr key={c.id}>
                      <td>{c.descricao}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.obs}</div></td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(ps[0].valor)}</td>
                      <td style={{ textAlign: 'center' }} className="mono">{ps.length - resta.length}/{ps.length}</td>
                      <td style={{ textAlign: 'right' }} className="mono">{fmt(resta.reduce((t, p) => t + p.valor, 0))}</td>
                      <td style={{ textAlign: 'right' }} className="mono">
                        {(() => {
                          const taxa = taxaDaObservacao(c.obs)
                          const est = resta.length && taxa != null ? saldoDevedorEstimado(resta.map((p) => p.valor), taxa) : null
                          if (est == null) return '—'
                          const total = resta.reduce((t, p) => t + p.valor, 0)
                          return <>{fmt(est)}<div style={{ fontSize: 11, color: 'var(--green)' }}>economiza ~{fmt(total - est)}</div></>
                        })()}
                      </td>
                      <td className="mono">{resta.length ? mesLabel(ps[ps.length - 1].mes) : 'quitado'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
