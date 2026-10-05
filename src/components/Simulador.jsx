import { useMemo, useState } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths, calcMesInicio, limiteUsado, totalRenda, hojeSP } from '../lib/utils'
import { detalhePagamentos, rendaDoMes } from '../lib/financeiro'

const MAX_PARCELAS = 48
const CENARIOS = [1, 2, 3, 4, 5, 6, 10, 12, 18, 24]
const MESES_ADIAR = 12 // quantos meses à frente procurar um início melhor

const hojeISO = () => hojeSP() // data de hoje em Brasília

// Parcela com juros (Tabela Price). juros em % ao mês; 0 = sem juros.
const valorParcela = (total, n, juros) => {
  if (!juros) return total / n
  const i = juros / 100
  return (total * i) / (1 - Math.pow(1 + i, -n))
}
// Inverso: quanto à vista uma parcela máxima consegue pagar em n vezes.
const valorAVista = (parcela, n, juros) => {
  if (!juros) return parcela * n
  const i = juros / 100
  return (parcela * (1 - Math.pow(1 + i, -n))) / i
}

const ordemStatus = { green: 0, amber: 1, red: 2 }

export default function Simulador({ store }) {
  const { compras, cartoes, rendas, fixos, faturas, fixosPagamentos, comprasPagamentos, comprasPagamentosOk } = store
  const hoje = nowYM()

  const [modo, setModo] = useState('total') // 'total' | 'parcela'
  const [valor, setValor] = useState('')
  const [parcelas, setParcelas] = useState(10)
  const [cartaoId, setCartaoId] = useState('')
  const [data, setData] = useState(hojeISO)
  const [margem, setMargem] = useState(10)
  const [juros, setJuros] = useState(0)

  const cartoesAtivos = cartoes.filter((c) => c.ativo !== false)
  const cartao = cartoes.find((c) => c.id === cartaoId)
  const inicio = calcMesInicio(data || hojeISO(), cartao)

  const n = Math.min(MAX_PARCELAS, Math.max(1, parseInt(parcelas) || 1))
  const v = Number(valor) || 0
  const taxa = modo === 'total' ? Math.max(0, Number(juros) || 0) : 0
  const margemPct = Math.min(100, Math.max(0, Number(margem) || 0))

  // O que já está comprometido em cada mês: a mesma conta da aba Pagamentos (motor financeiro único),
  // com cache por mês para não refazer a conta a cada cenário.
  const baseDe = useMemo(() => {
    const cache = new Map()
    const dados = { fixos, fixosPagamentos, cartoes, compras, faturas, comprasPagamentos, comprasPagamentosOk }
    return (m) => {
      if (!cache.has(m)) cache.set(m, detalhePagamentos(dados, m).comprometido)
      return cache.get(m)
    }
  }, [fixos, fixosPagamentos, cartoes, compras, faturas, comprasPagamentos, comprasPagamentosOk])

  const rendasComValor = useMemo(
    () => rendas.filter((r) => totalRenda(r) > 0).sort((a, b) => a.mes.localeCompare(b.mes)),
    [rendas]
  )

  // Mês sem renda cadastrada repete a última renda informada antes dele.
  const rendaDe = (m) => rendaDoMes(rendas, m, { estimar: true })
  const folgaDe = (m) => {
    const r = rendaDe(m).valor
    // "Com folga" = respeitar a margem E não passar de 70% da renda (mesma regra do veredito).
    return Math.min(r - baseDe(m) - (r * margemPct) / 100, r * 0.7 - baseDe(m))
  }
  const menorFolga = (start, qtd) =>
    Math.min(...Array.from({ length: qtd }, (_, k) => folgaDe(addMonths(start, k))))

  const temRenda = rendasComValor.length > 0
  const limite = Number(cartao?.limite) || 0
  const limiteLivre = limite ? limite - limiteUsado(cartao.id, compras, cartoes, faturas, hoje).usado : 0
  const parcela = modo === 'parcela' ? v : v > 0 ? valorParcela(v, n, taxa) : 0
  const totalPago = parcela * n
  const folgaJanela = menorFolga(inicio, n)
  const parcelaMax = Math.max(0, folgaJanela)
  const valorMax = valorAVista(parcelaMax, n, taxa)

  const menorN = useMemo(() => {
    if (modo !== 'total' || v <= 0) return null
    for (let k = 1; k <= MAX_PARCELAS; k++) {
      if (valorParcela(v, k, taxa) <= Math.max(0, menorFolga(inicio, k))) return k
    }
    return 0
  }, [modo, v, taxa, inicio, margemPct, baseDe, rendas])

  // Linha mês a mês
  const ultimoMes = addMonths(inicio, n - 1)
  const fimTabela = [addMonths(hoje, 5), addMonths(ultimoMes, 1)].sort().pop()
  const limiteTabela = addMonths(hoje, 23)
  const meses = []
  for (let m = hoje; m <= fimTabela && m <= limiteTabela; m = addMonths(m, 1)) meses.push(m)

  // Situação de um mês com a nova parcela somada ao que já está comprometido.
  const situacao = (m, nova) => {
    const r = rendaDe(m)
    const base = baseDe(m)
    const saldoAntes = r.valor - base
    const saldoDepois = saldoAntes - nova
    const pct = r.valor > 0 ? Math.round(((base + nova) / r.valor) * 100) : 0
    let status = 'green'
    if (r.valor === 0) status = 'gray'
    else if (saldoDepois < 0 || pct > 90) status = 'red'
    else if (pct > 70 || saldoDepois < (r.valor * margemPct) / 100) status = 'amber'
    return { mes: m, renda: r.valor, estimada: r.estimada, base, nova, saldoAntes, saldoDepois, pct, status }
  }

  const linhas = meses.map((m) => situacao(m, parcela > 0 && m >= inicio && m <= ultimoMes ? parcela : 0))

  // Pior mês dentro do período da compra
  const janela = Array.from({ length: n }, (_, k) => situacao(addMonths(inicio, k), parcela))
  const pior = janela.reduce((a, b) => (b.saldoDepois < a.saldoDepois ? b : a), janela[0])
  const statusGeral = janela.reduce(
    (s, l) => (ordemStatus[l.status] > ordemStatus[s] ? l.status : s),
    'green'
  )

  // Em qual mês de início a compra caberia?
  let inicioMelhor = null
  if (parcela > 0 && statusGeral !== 'green') {
    for (let o = 1; o <= MESES_ADIAR; o++) {
      const s = addMonths(inicio, o)
      if (menorFolga(s, n) >= parcela) { inicioMelhor = s; break }
    }
  }

  const cenarios = modo === 'total' && v > 0
    ? [...new Set([...CENARIOS, n])].sort((a, b) => a - b).map((k) => {
        const p = valorParcela(v, k, taxa)
        const folga = menorFolga(inicio, k)
        return { k, p, total: p * k, folga, cabe: p <= folga }
      })
    : []

  const corStatus = { green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', gray: 'var(--text3)' }
  const badge = {
    green: ['badge-green', 'Tranquilo'],
    amber: ['badge-amber', 'Aperta'],
    red: ['badge-red', 'Estoura'],
    gray: ['badge-gray', 'Sem renda'],
  }

  function veredito() {
    if (!temRenda) {
      return <div className="alert alert-amber">Cadastre a renda de pelo menos um mês (aba Renda) para o simulador calcular quanto sobra.</div>
    }
    if (parcela <= 0) {
      return <div className="alert alert-blue">Informe o valor da compra (ou da parcela) para ver o impacto no seu orçamento.</div>
    }
    const piorTxt = `${mesLabel(pior.mes)}: saldo de ${fmt(pior.saldoDepois)} (${pior.pct}% da renda comprometida)`
    if (statusGeral === 'green') {
      return <div className="alert alert-green"><strong>Cabe com folga.</strong> Mês mais apertado — {piorTxt}.</div>
    }
    if (statusGeral === 'amber') {
      return <div className="alert alert-amber"><strong>Cabe, mas aperta</strong> (passa de 70% da renda ou fura sua margem de {margemPct}%). Mês mais apertado — {piorTxt}.</div>
    }
    return <div className="alert alert-red"><strong>Não recomendo.</strong> Mês mais apertado — {piorTxt}.</div>
  }

  return (
    <div className="page">
      <div className="sim-grid">
        <div>
          <div className="section-label">sua compra</div>
          <div className="card" style={{ padding: 16 }}>
            <div className="form-row">
              <div className="form-group">
                <label>O valor que vou informar é</label>
                <select value={modo} onChange={(e) => setModo(e.target.value)}>
                  <option value="total">O valor total da compra</option>
                  <option value="parcela">O valor de cada parcela</option>
                </select>
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>{modo === 'total' ? 'Valor total (R$)' : 'Valor da parcela (R$)'}</label>
                <input type="number" step="0.01" min="0" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
              </div>
              <div className="form-group">
                <label>Parcelas</label>
                <input type="number" min="1" max={MAX_PARCELAS} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Cartão</label>
                <select value={cartaoId} onChange={(e) => setCartaoId(e.target.value)}>
                  <option value="">Sem cartão</option>
                  {cartoesAtivos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Data da compra</label>
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>Margem de segurança (% da renda)</label>
                <input type="number" min="0" max="100" value={margem} onChange={(e) => setMargem(e.target.value)} />
              </div>
              {modo === 'total' && (
                <div className="form-group">
                  <label>Juros ao mês (%)</label>
                  <input type="number" step="0.01" min="0" value={juros} onChange={(e) => setJuros(e.target.value)} />
                </div>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
              1ª parcela em <strong style={{ color: 'var(--text2)' }}>{mesLabel(inicio)}</strong>
              {cartao?.fechamento ? ` (fechamento dia ${cartao.fechamento})` : ''}.
              A margem é quanto da renda você quer deixar livre depois da compra.
            </div>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div className="section-label">resultado</div>
          {veredito()}
          {parcela > 0 && limite > 0 && n * parcela > limiteLivre && (
            <div className="alert alert-amber">
              <strong>Limite do cartão:</strong> essa compra ocupa {fmt(n * parcela)} do limite, e o {cartao.nome} tem {fmt(Math.max(0, limiteLivre))} disponível.
            </div>
          )}

          <div className="metric-grid">
            <div className="metric">
              <div className="metric-label">Parcela</div>
              <div className="metric-val amber">{parcela > 0 ? fmt(parcela) : '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">{taxa > 0 ? 'Total com juros' : 'Total'}</div>
              <div className="metric-val">{parcela > 0 ? fmtK(totalPago) : '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Parcela máx. em {n}x</div>
              <div className="metric-val blue">{temRenda ? fmt(parcelaMax) : '—'}</div>
            </div>
            <div className="metric">
              <div className="metric-label">Compra máx. em {n}x</div>
              <div className="metric-val green">{temRenda ? fmtK(valorMax) : '—'}</div>
            </div>
          </div>

          {parcela > 0 && temRenda && statusGeral !== 'green' && (
            <div className="alert alert-blue">
              {inicioMelhor
                ? <>Com a primeira parcela em <strong>{mesLabel(inicioMelhor)}</strong> ela caberia com folga (ex.: comprar depois do fechamento do cartão ou esperar algumas parcelas antigas acabarem).</>
                : <>Nem adiando a primeira parcela em até {MESES_ADIAR} meses essa parcela cabe com folga.</>}
              {modo === 'total' && menorN !== null && (
                menorN > 0
                  ? <> Para esse valor, o menor parcelamento que cabe é <strong>{menorN}x</strong> de {fmt(valorParcela(v, menorN, taxa))}.</>
                  : <> Esse valor não cabe em até {MAX_PARCELAS}x.</>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="section-label">mês a mês · com e sem a compra</div>
      <div className="card sim-tabela">
        <table>
          <thead>
            <tr>
              <th>Mês</th>
              <th style={{ textAlign: 'right' }}>Renda</th>
              <th style={{ textAlign: 'right' }}>Já comprometido</th>
              <th style={{ textAlign: 'right' }}>Nova parcela</th>
              <th style={{ textAlign: 'right' }}>Sobra antes</th>
              <th style={{ textAlign: 'right' }}>Sobra depois</th>
              <th style={{ width: 150 }}>% da renda</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.mes}>
                <td>
                  {mesLabel(l.mes)}
                  {l.mes === hoje && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>hoje</span>}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text2)' }} title={l.estimada && l.renda > 0 ? 'Renda deste mês não cadastrada: repetindo a última informada' : undefined}>
                  {l.renda > 0 ? fmtK(l.renda) + (l.estimada ? '*' : '') : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text2)' }}>{fmtK(l.base)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: l.nova ? 'var(--amber)' : 'var(--text3)' }}>
                  {l.nova ? fmt(l.nova) : '—'}
                </td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text2)' }}>{l.renda > 0 ? fmtK(l.saldoAntes) : '—'}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: l.renda > 0 ? (l.saldoDepois >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--text3)' }}>
                  {l.renda > 0 ? fmtK(l.saldoDepois) : '—'}
                </td>
                <td>
                  {l.renda > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="prog-bar" style={{ flex: 1 }}>
                        <div className="prog-fill" style={{ width: Math.min(100, l.pct) + '%', background: corStatus[l.status] }} />
                      </div>
                      <span style={{ fontSize: 11, color: 'var(--text3)', minWidth: 32 }}>{l.pct}%</span>
                    </div>
                  )}
                </td>
                <td><span className={`badge ${badge[l.status][0]}`}>{badge[l.status][1]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 16 }}>
        * mês sem renda cadastrada: repete a última renda informada. O cálculo usa a renda, as contas fixas ativas
        (respeitando o mês de término) e as parcelas já lançadas; gastos variáveis que você ainda não lançou não entram.
        {meses.length >= 24 && ' Mostrando os próximos 24 meses.'}
      </div>

      {cenarios.length > 0 && (
        <>
          <div className="section-label">e se eu parcelar em outro número de vezes?</div>
          <div className="card sim-tabela">
            <table>
              <thead>
                <tr>
                  <th>Parcelas</th>
                  <th style={{ textAlign: 'right' }}>Valor da parcela</th>
                  <th style={{ textAlign: 'right' }}>Total pago</th>
                  <th style={{ textAlign: 'right' }}>Folga no pior mês</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {cenarios.map((c) => (
                  <tr key={c.k} style={c.k === n ? { background: 'var(--bg3)' } : undefined}>
                    <td>{c.k}x{c.k === n && <span className="badge badge-gray" style={{ marginLeft: 6, fontSize: 10 }}>simulado</span>}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{fmt(c.p)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: 'var(--text2)' }}>{fmt(c.total)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 12, color: c.folga - c.p >= 0 ? 'var(--green)' : 'var(--red)' }}>
                      {fmtK(c.folga - c.p)}
                    </td>
                    <td>
                      <span className={`badge ${c.cabe ? 'badge-green' : 'badge-red'}`}>{c.cabe ? 'Cabe' : 'Não cabe'}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
            "Folga no pior mês" é o que sobra, depois da parcela, acima da sua margem de segurança no mês mais apertado do parcelamento.
          </div>
        </>
      )}
    </div>
  )
}
