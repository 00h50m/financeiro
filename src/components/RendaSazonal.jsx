import { Fragment, useMemo, useState } from 'react'
import { RENDA_CAMPOS, fmt, fmtK, mesLabel, nowYM, rendaDigitada } from '../lib/utils'
import { perfilDeLinhas, fatorDe, valorFixoDe, baseDaFonte, fatorParaValor, proximoFator, projecaoRenda, planoDeReserva, resumoDaProjecao, temPerfil, mesesComFerias } from '../lib/rendaSazonal'
import { lerNum } from '../lib/adiamentoPref'
import { saldoMeta } from '../lib/metas'
import Secao from './Secao'
import { Pilulas } from './NavMes'
import { perfil, rotuloRenda } from '../lib/perfil'

const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
const TODOS_OS_MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
const rotuloFator = (f) => (f === 0 ? '0' : `${Math.round(f * 100)}%`)
const classeFator = (f) => (f >= 0.995 ? 'normal' : f === 0 ? 'zero' : f <= 0.5 ? 'fraco' : 'menos')
const CHAVE_VISAO = 'renda_sazonal_visao'
const lerVisao = () => { try { return localStorage.getItem(CHAVE_VISAO) === 'valor' ? 'valor' : 'percentual' } catch { return 'percentual' } }
const gravarVisao = (v) => { try { localStorage.setItem(CHAVE_VISAO, v) } catch { /* segue sem lembrar */ } }
// Texto digitado só vale se tiver algum dígito ("abc" não vira 0 sem querer).
const textoValido = (t) => /\d/.test(String(t ?? ''))
const emReais = (n) => Number(n).toLocaleString('pt-BR', { minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2, maximumFractionDigits: 2 })
const r2 = (n) => Math.round(n * 100) / 100
// Nomes da tela (o "Extra" não inclui as aulas particulares, que têm linha própria).
const ROTULOS = { extra_sabrina: perfil.aulas ? 'Extra Sabrina (além das aulas)' : rotuloRenda('extra_sabrina', 'Extra') }
const rotuloDe = (campo, padrao) => ROTULOS[campo] || padrao
// Fontes na ordem da projeção: as aulas particulares entram logo depois do extra.
const FONTES_PROJECAO = [
  ...RENDA_CAMPOS.slice(0, 3),
  ['__aulas', 'Aulas particulares'],
  ...RENDA_CAMPOS.slice(3),
]
const valorDaFonte = (m, campo) => (campo === '__aulas' ? m.aulas : m.fontes?.[campo]) || 0

// Reserva atual: saldo da meta de reserva ativa (tela Reserva), se existir.
export function reservaAtualDe(store) {
  const meta = (store.metas || []).find((m) => m.tipo === 'reserva' && m.ativa !== false)
  return meta ? Math.max(0, saldoMeta(store.metasMovimentos || [], meta.id)) : 0
}

// Dados da projeção, compartilhados com o aviso do Início.
export function useProjecaoSazonal(store, n = 12) {
  const perfil = useMemo(() => perfilDeLinhas(store.rendaSazonal), [store.rendaSazonal])
  const meses = useMemo(() => projecaoRenda(store, perfil, nowYM(), n), [store, perfil, n])
  const plano = useMemo(() => planoDeReserva(meses, reservaAtualDe(store)), [meses, store])
  return { perfil, meses, plano, ativo: temPerfil(perfil) }
}

// Uma célula de mês no modo "valor": a pessoa digita o que espera receber naquele mês do ano.
// Vazio = volta a valer o valor normal × fator. Salva ao sair do campo ou com Enter.
function CelulaValor({ nome, esperado, digitado, desabilitado, onSalvar, rotuloAcessivel }) {
  const [texto, setTexto] = useState(null) // null = não está editando
  const mostrado = texto ?? (esperado == null ? '' : emReais(esperado))
  const confirmar = () => {
    if (texto === null) return
    const t = texto.trim()
    setTexto(null)
    if (t === '') { if (digitado != null) onSalvar(null); return }
    if (!textoValido(t)) return
    const v = lerNum(t)
    if (digitado == null || Math.abs(v - digitado) > 0.004) onSalvar(v)
  }
  return (
    <label className={`rs-celula ${digitado != null ? 'digitado' : ''}`}>
      <span>{nome}</span>
      <input
        inputMode="decimal" autoComplete="off" disabled={desabilitado}
        value={mostrado} placeholder="—"
        onFocus={(e) => { setTexto(esperado == null ? '' : emReais(esperado)); e.target.select() }}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => { if (e.key === 'Enter') { confirmar(); e.currentTarget.blur() } if (e.key === 'Escape') { setTexto(null); e.currentTarget.blur() } }}
        aria-label={rotuloAcessivel}
      />
    </label>
  )
}

// Atalho: o mesmo valor nos 12 meses (mesada, aluguel recebido, salário fixo...).
function ValorNosDozeMeses({ rotulo, desabilitado, onAplicar }) {
  const [texto, setTexto] = useState('')
  const pronto = textoValido(texto)
  const aplicar = () => { if (!pronto) return; onAplicar(lerNum(texto)); setTexto('') }
  return (
    <div className="rs-lote">
      <input
        inputMode="decimal" autoComplete="off" disabled={desabilitado} placeholder="mesmo valor em todos os meses"
        value={texto} onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') aplicar() }}
        aria-label={`${rotulo}: valor para repetir nos 12 meses`}
      />
      <button type="button" className="btn btn-sm" disabled={desabilitado || !pronto} onClick={aplicar}>Aplicar aos 12 meses</button>
    </div>
  )
}

export default function RendaSazonal({ store }) {
  const { rendas, rendaSazonal, rendaSazonalOk, definirFatorSazonal, definirValorSazonal, definirSazonalEmLote, aulasPausas } = store
  const { perfil, meses, plano } = useProjecaoSazonal(store)
  const [abertas, setAbertas] = useState({ resumo: true, perfil: true, proj: true, fontes: true, plano: true })
  const [visao, setVisaoEstado] = useState(lerVisao)
  const [mesAberto, setMesAberto] = useState(null)
  const setVisao = (v) => { setVisaoEstado(v); gravarVisao(v) }
  const alt = (k) => () => setAbertas((a) => ({ ...a, [k]: !a[k] }))
  const maior = Math.max(1, ...meses.map((m) => Math.max(m.renda, m.comprometido)))
  const hoje = nowYM()
  const ferias = useMemo(() => mesesComFerias(aulasPausas), [aulasPausas])
  const resumo = useMemo(() => resumoDaProjecao(meses), [meses])
  // Só há coluna "valor" no banco depois do inbox/32: se já existem linhas e nenhuma traz o campo, ainda não foi rodado.
  const colunaValorOk = !(rendaSazonal || []).length || 'valor' in rendaSazonal[0]

  // Todas as fontes de renda aparecem, mesmo as que ainda não têm nada cadastrado (extra, mesada, outros).
  const fontes = RENDA_CAMPOS.map(([campo, rotuloPadrao]) => {
    const base = baseDaFonte(rendas, perfil, campo)
    const personalizado = TODOS_OS_MESES.some((m) => Math.abs(fatorDe(perfil, campo, `2026-${String(m).padStart(2, '0')}`) - 1) > 0.005 || valorFixoDe(perfil, campo, `2026-${String(m).padStart(2, '0')}`) != null)
    const esperadoNoMes = (i) => {
      const mesRef = `2026-${String(i + 1).padStart(2, '0')}`
      const fixo = valorFixoDe(perfil, campo, mesRef)
      return fixo != null ? fixo : (base > 0 ? r2(base * fatorDe(perfil, campo, mesRef)) : 0)
    }
    const ano = r2(TODOS_OS_MESES.reduce((t, _, i) => t + esperadoNoMes(i), 0))
    return { campo, rotulo: rotuloDe(campo, rotuloPadrao), base, personalizado, ano, semValor: base <= 0 && ano <= 0 }
  })
  const semValor = fontes.filter((f) => f.semValor).map((f) => f.rotulo.replace(' (além das aulas)', ''))
  const temAulas = !!store.aulasOk && ((store.alunos || []).length > 0 || meses.some((m) => m.aulas > 0))
  const mesesFeriasNaProjecao = meses.filter((m) => ferias.has(m.mes)).map((m) => mesLabel(m.mes))

  // Quanto cada fonte rende nos 12 meses projetados (quem não rende nada some da lista).
  const porFonte = FONTES_PROJECAO
    .map(([campo, rotulo]) => ({ campo, rotulo: rotuloDe(campo, rotulo), total: r2(meses.reduce((t, m) => t + valorDaFonte(m, campo), 0)) }))
    .filter((f) => f.total > 0)
  const totalFontes = porFonte.reduce((t, f) => t + f.total, 0)

  return (
    <div className="rs">
      {resumo && (
        <Secao titulo="Resumo dos próximos 12 meses" info={resumo.vermelhos ? `${resumo.vermelhos} ${resumo.vermelhos === 1 ? 'mês' : 'meses'} no vermelho` : 'nenhum mês no vermelho'} aberto={abertas.resumo} onToggle={alt('resumo')}>
          <div className="rs-corpo">
            <div className="kpi-faixa rs-kpis">
              <div className="kpi">
                <span className="kpi-rotulo">Renda média</span>
                <span className="kpi-valor">{fmtK(resumo.media)}</span>
                <span className="kpi-sub">por mês · {fmtK(resumo.total)} no total</span>
              </div>
              <div className="kpi">
                <span className="kpi-rotulo">Mês mais apertado</span>
                <span className={`kpi-valor ${resumo.pior.sobra < -0.005 ? 'vermelho' : 'verde'}`}>{resumo.pior.sobra < 0 ? '−' : '+'}{fmtK(Math.abs(resumo.pior.sobra))}</span>
                <span className="kpi-sub">{mesLabel(resumo.pior.mes)} · renda {fmtK(resumo.pior.renda)}</span>
              </div>
              <div className="kpi">
                <span className="kpi-rotulo">Meses no vermelho</span>
                <span className={`kpi-valor ${resumo.vermelhos ? 'vermelho' : 'verde'}`}>{resumo.vermelhos} de {resumo.n}</span>
                <span className={`kpi-sub ${resumo.vermelhos ? 'ruim' : ''}`}>{resumo.vermelhos ? `faltam ${fmtK(resumo.falta)} no total` : 'tudo coberto'}</span>
              </div>
              <div className="kpi">
                <span className="kpi-rotulo">Renda mais fraca</span>
                <span className="kpi-valor ambar">{fmtK(resumo.menorRenda.renda)}</span>
                <span className="kpi-sub">{mesLabel(resumo.menorRenda.mes)} · a melhor é {fmtK(resumo.maiorRenda.renda)} em {mesLabel(resumo.maiorRenda.mes)}</span>
              </div>
            </div>
            <ul className="rs-atencao">
              {resumo.previstos > 0 && <li>{resumo.previstos} de {resumo.n} meses ainda não têm renda cadastrada: valem a <b>previsão</b> (valor normal × a sua marcação de cada mês).</li>}
              {semValor.length > 0 && <li>Sem nenhum valor: <b>{semValor.join(', ')}</b>. Contam R$ 0 na projeção; se você recebe, digite abaixo.</li>}
              {mesesFeriasNaProjecao.length > 0 && <li>Férias ou dias sem aula em <b>{mesesFeriasNaProjecao.join(', ')}</b>: as aulas desses dias saem da renda.</li>}
            </ul>
          </div>
        </Secao>
      )}

      <Secao titulo="Como a renda muda ao longo do ano" info={visao === 'valor' ? 'digite o valor de cada mês' : 'toque no mês para alternar'} aberto={abertas.perfil} onToggle={alt('perfil')}>
        <div className="rs-corpo">
          {!rendaSazonalOk && (
            <div className="alert alert-amber">Para guardar os meses fracos, rode o arquivo <code>inbox/22_renda_sazonal.sql</code> no Supabase e recarregue a página.</div>
          )}
          {rendaSazonalOk && !colunaValorOk && (
            <div className="alert alert-amber">Para guardar <b>valores digitados</b> por mês, rode o arquivo <code>inbox/32_renda_sazonal_valor.sql</code> no Supabase e recarregue a página. Enquanto isso, o valor digitado vira uma porcentagem do valor normal.</div>
          )}
          <div className="rs-visao">
            <Pilulas
              rotulo="Como informar a renda de cada mês"
              valor={visao} onChange={setVisao}
              opcoes={[['percentual', 'Por porcentagem'], ['valor', 'Digitar o valor']]}
            />
          </div>
          {visao === 'percentual' ? (
            <p className="rs-ajuda">Cada toque muda o mês: <b>100%</b> (normal) → <b>70%</b> → <b>40%</b> (fraco) → <b>0</b> (não recebe). A projeção usa isso nos meses em que você ainda não cadastrou a renda. Prefere números? Mude para <b>Digitar o valor</b>.</p>
          ) : (
            <p className="rs-ajuda">Digite quanto você espera receber de cada fonte em cada mês (vale para todo ano; apague para voltar ao valor normal). O número que você digita é guardado como está, mesmo que a renda normal mude depois. O que aparece em cinza é a previsão automática.</p>
          )}
          {fontes.map(({ campo, rotulo, base, personalizado, ano, semValor: vazia }) => (
            <div key={campo} className="rs-fonte">
              <div className="rs-fonte-nome">
                <span>{rotulo}{base > 0 && <span className="rs-base"> · valor normal {fmt(base)}</span>}</span>
                {ano > 0 && <span className="rs-base rs-ano">{fmtK(ano)} no ano</span>}
              </div>
              {visao === 'percentual' && vazia ? (
                <div className="rs-vazia">
                  Ainda sem valor. <button type="button" className="link-btn" onClick={() => setVisao('valor')}>Digitar o valor</button> ou cadastre a renda de um mês na tela Renda.
                </div>
              ) : visao === 'percentual' ? (
                <div className="rs-chips">
                  {MESES_CURTOS.map((nome, i) => {
                    const mesRef = `2026-${String(i + 1).padStart(2, '0')}`
                    const f = fatorDe(perfil, campo, mesRef)
                    const digitado = valorFixoDe(perfil, campo, mesRef)
                    return (
                      <button
                        key={nome}
                        className={`rs-chip ${classeFator(f)} ${digitado != null ? 'digitado' : ''}`}
                        disabled={!rendaSazonalOk}
                        // tocar num mês com valor digitado volta para o modo porcentagem (o valor digitado é apagado)
                        onClick={() => definirFatorSazonal(campo, i + 1, proximoFator(f), { limparValor: digitado != null })}
                        aria-label={`${rotulo}, ${nome}: ${digitado != null ? `${fmt(digitado)} digitado` : f === 0 ? 'não recebe' : rotuloFator(f)}. Toque para alterar`}
                        title={digitado != null ? `Valor digitado: ${fmt(digitado)}. Tocar volta para porcentagem.` : undefined}
                      >
                        <span>{nome}</span><b>{digitado != null ? fmtK(digitado) : rotuloFator(f)}</b>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <>
                  <div className="rs-celulas">
                    {MESES_CURTOS.map((nome, i) => {
                      const mesRef = `2026-${String(i + 1).padStart(2, '0')}`
                      const digitado = valorFixoDe(perfil, campo, mesRef)
                      const automatico = base > 0 ? r2(base * fatorDe(perfil, campo, mesRef)) : null
                      return (
                        <CelulaValor
                          key={nome} nome={nome}
                          esperado={digitado ?? automatico} digitado={digitado}
                          desabilitado={!rendaSazonalOk}
                          rotuloAcessivel={`${rotulo}, ${nome}: valor esperado em reais`}
                          onSalvar={(v) => (v == null
                            ? definirFatorSazonal(campo, i + 1, 1) // apagar = volta ao valor normal (a linha some)
                            : definirValorSazonal(campo, i + 1, { valor: v, fator: fatorParaValor(v, base) }))}
                        />
                      )
                    })}
                  </div>
                  <ValorNosDozeMeses
                    rotulo={rotulo} desabilitado={!rendaSazonalOk}
                    onAplicar={(v) => definirSazonalEmLote(campo, TODOS_OS_MESES, { valor: v, fator: fatorParaValor(v, base) })}
                  />
                </>
              )}
              {personalizado && (
                <button type="button" className="link-btn rs-limpar" disabled={!rendaSazonalOk} onClick={() => definirSazonalEmLote(campo, TODOS_OS_MESES)}>
                  Limpar {rotulo.replace(' (além das aulas)', '')} e voltar tudo ao normal
                </button>
              )}
            </div>
          ))}

          {temAulas && (
            <div className="rs-fonte">
              <div className="rs-fonte-nome">
                <span>Aulas particulares <span className="rs-base"> · pela agenda, sem precisar digitar</span></span>
                {resumo && <span className="rs-base rs-ano">{fmtK(r2(meses.reduce((t, m) => t + (m.aulas || 0), 0)))} em 12 meses</span>}
              </div>
              <div className="rs-celulas">
                {meses.map((m) => (
                  <div key={m.mes} className={`rs-celula rs-aula ${ferias.has(m.mes) ? 'ferias' : ''}`} title={ferias.has(m.mes) ? 'Há férias ou dias sem aula neste mês' : undefined}>
                    <span>{mesLabel(m.mes)}{ferias.has(m.mes) && <em> · férias</em>}</span>
                    <b className="mono">{m.aulas > 0 ? fmtK(m.aulas) : '—'}</b>
                  </div>
                ))}
              </div>
              <p className="rs-ajuda rs-aula-nota">Vem dos alunos e horários da tela Aulas e já desconta as férias que você cadastrou lá. Para mudar, altere a agenda ou as férias em Aulas.</p>
            </div>
          )}
        </div>
      </Secao>

      <Secao titulo="Projeção dos próximos 12 meses" info="renda × comprometido" aberto={abertas.proj} onToggle={alt('proj')}>
        <div className="rs-corpo">
          <div className="rs-barras" role="img" aria-label="Renda prevista e comprometido em cada um dos próximos 12 meses">
            {meses.map((m) => (
              <div key={m.mes} className={`rs-mes ${m.sobra < -0.005 ? 'neg' : ''}`} title={`${mesLabel(m.mes)}: renda ${fmt(m.renda)}${m.estimada ? ' (prevista)' : ''} · comprometido ${fmt(m.comprometido)} · ${m.sobra < 0 ? 'falta' : 'sobra'} ${fmt(Math.abs(m.sobra))}`}>
                <div className="rs-par">
                  <div className="rs-b renda" style={{ height: `${(m.renda / maior) * 100}%` }} />
                  <div className="rs-b comp" style={{ height: `${(m.comprometido / maior) * 100}%` }} />
                </div>
                <div className="rs-mes-nome">{mesLabel(m.mes).slice(0, 3)}</div>
              </div>
            ))}
          </div>
          <div className="lp-leg"><span><i className="rs-lg renda" />renda</span><span><i className="rs-lg comp" />comprometido</span><span><i className="rs-lg neg" />mês no vermelho</span></div>
          <table className="tabela-compacta lp-tabela">
            <thead><tr><th>Mês <span className="rs-prev">(toque para ver as fontes)</span></th><th style={{ textAlign: 'right' }}>Renda</th><th style={{ textAlign: 'right' }} className="col-opc">Comprometido</th><th style={{ textAlign: 'right' }}>Sobra / falta</th></tr></thead>
            <tbody>
              {meses.map((m) => {
                const aberto = mesAberto === m.mes
                const detalhe = FONTES_PROJECAO.map(([campo, rotulo]) => ({ campo, rotulo: rotuloDe(campo, rotulo), valor: valorDaFonte(m, campo) })).filter((f) => f.valor > 0)
                return (
                  <Fragment key={m.mes}>
                    <tr>
                      <td>
                        <button type="button" className="rs-linha-btn" aria-expanded={aberto} onClick={() => setMesAberto(aberto ? null : m.mes)}>
                          <span className="rs-seta" aria-hidden="true">{aberto ? '▾' : '▸'}</span>{mesLabel(m.mes)}
                        </button>
                        {m.mes === hoje && <span className="badge badge-green" style={{ marginLeft: 6, fontSize: 10 }}>atual</span>}
                        {ferias.has(m.mes) && <span className="badge badge-blue" style={{ marginLeft: 6, fontSize: 10 }} title="Há férias ou dias sem aula cadastrados neste mês (tela Aulas): as aulas desses dias não entram na renda prevista">férias nas aulas</span>}
                      </td>
                      <td className="mono" style={{ textAlign: 'right' }}>{fmtK(m.renda)}{m.estimada && rendaDigitada(rendas.find((r) => r.mes === m.mes)) === 0 && <span className="rs-prev" title="Renda prevista pelos meses fracos que você marcou"> prev.</span>}</td>
                      <td className="mono col-opc" style={{ textAlign: 'right' }}>{fmtK(m.comprometido)}</td>
                      <td className="mono" style={{ textAlign: 'right', color: m.sobra < -0.005 ? 'var(--red)' : 'var(--green)' }}>{m.sobra < 0 ? '−' : '+'}{fmtK(Math.abs(m.sobra))}</td>
                    </tr>
                    {aberto && (
                      <tr className="rs-detalhe">
                        <td colSpan={4}>
                          {detalhe.length === 0 ? <span className="rs-prev">Nenhuma fonte de renda neste mês.</span> : detalhe.map((f) => (
                            <span key={f.campo} className="rs-fonte-chip">{f.rotulo} <b className="mono">{fmtK(f.valor)}</b></span>
                          ))}
                          <span className="rs-fonte-chip comp">Comprometido <b className="mono">{fmtK(m.comprometido)}</b></span>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            {resumo && (
              <tfoot>
                <tr>
                  <td><b>12 meses</b></td>
                  <td className="mono" style={{ textAlign: 'right' }}><b>{fmtK(resumo.total)}</b></td>
                  <td className="mono col-opc" style={{ textAlign: 'right' }}><b>{fmtK(r2(meses.reduce((t, m) => t + m.comprometido, 0)))}</b></td>
                  <td className="mono" style={{ textAlign: 'right' }}><b>{fmtK(r2(meses.reduce((t, m) => t + m.sobra, 0)))}</b></td>
                </tr>
              </tfoot>
            )}
          </table>
          <div className="lp-nota">Meses futuros usam as parcelas já lançadas e as contas fixas ativas; compras novas e valores variáveis ainda não entram. Mês com renda cadastrada vale o cadastrado. As aulas particulares entram pela agenda e <b>não contam</b> nos dias de férias cadastrados em Aulas.</div>
        </div>
      </Secao>

      {porFonte.length > 0 && (
        <Secao titulo="De onde vem a renda" info="soma dos próximos 12 meses" aberto={abertas.fontes} onToggle={alt('fontes')}>
          <div className="rs-corpo">
            {porFonte.map((f) => (
              <div key={f.campo} className="rs-origem">
                <div className="rs-origem-topo">
                  <span>{f.rotulo}</span>
                  <span className="mono">{fmtK(f.total)} <span className="rs-prev">· {Math.round((f.total / totalFontes) * 100)}%</span></span>
                </div>
                <div className="kpi-barra"><div className="ok" style={{ width: `${(f.total / totalFontes) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Secao>
      )}

      <Secao titulo="Plano de reserva" info={plano.tem ? 'tem mês no vermelho' : 'tudo coberto'} destaque={plano.tem && plano.precisa > 0 ? `guardar ${fmt(plano.precisa)}` : null} aberto={abertas.plano} onToggle={alt('plano')}>
        <div className="rs-corpo rs-plano">
          {!plano.tem ? (
            <p>✓ Nos próximos 12 meses nenhum mês fica no vermelho com a renda prevista.</p>
          ) : (
            <>
              <p>Nos próximos 12 meses faltam <b className="mono">{fmt(plano.buraco)}</b> no total{plano.reservaAtual > 0 ? <>. Você já tem <b className="mono">{fmt(plano.reservaAtual)}</b> na reserva{plano.precisa === 0 ? ', o que cobre tudo' : `; ainda precisa juntar ${fmt(plano.precisa)}`}</> : ''}.</p>
              {plano.janelas.map((w) => (
                <div key={w.primeiroMes} className="rs-janela">
                  <div className="rs-janela-tit">{w.meses.length === 1 ? mesLabel(w.meses[0]) : `${mesLabel(w.meses[0])} a ${mesLabel(w.meses[w.meses.length - 1])}`} <span className="mono">· faltam {fmt(w.buraco)}</span></div>
                  {w.precisa === 0 && <p>✓ A reserva cobre esse período.</p>}
                  {w.precisa > 0 && w.mesesAntes > 0 && (
                    <>
                      <p className="rs-destaque">Guarde <b className="mono">{fmt(w.porMes)}</b> por mês durante {w.mesesAntes} {w.mesesAntes === 1 ? 'mês' : 'meses'} ({mesLabel(w.inicioGuardar)}{w.inicioGuardar !== w.fimGuardar ? ` a ${mesLabel(w.fimGuardar)}` : ''}).</p>
                      <p className={w.cobreComSobras ? '' : 'rs-aviso'}>
                        {w.cobreComSobras
                          ? <>A sobra prevista nesses meses é de {fmt(w.sobraAntes)}, o que cobre, desde que você guarde mesmo.</>
                          : <>A sobra prevista nesses meses é de apenas {fmt(w.sobraAntes)}, menos do que o necessário. Vale reduzir gastos ou aumentar a renda.</>}
                      </p>
                    </>
                  )}
                  {w.precisa > 0 && w.mesesAntes === 0 && (
                    <p className="rs-destaque ruim">Esse período já começa no vermelho, então não dá para juntar antes. Vale usar a reserva, cortar gastos ou antecipar renda.</p>
                  )}
                </div>
              ))}
              <button className="link-btn" onClick={() => store.irPara?.('reserva')}>Abrir a tela Reserva</button>
            </>
          )}
        </div>
      </Secao>
    </div>
  )
}
