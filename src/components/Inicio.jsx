import { useState, useMemo } from 'react'
import { montarInicio } from '../lib/inicio'
import { fmt, mesLabel, nowYM } from '../lib/utils'
import { mesFechado } from '../lib/fechamento'
import ModalCompra from './ModalCompra'
import LongoPrazo from './LongoPrazo'
import NavMes from './NavMes'
import { useProjecaoSazonal } from './RendaSazonal'

const CORES = ['var(--ini-1)', 'var(--ini-2)', 'var(--ini-3)', 'var(--ini-4)', 'var(--ini-5)']
const ICONE_TIPO = { fixo: '🏠', fatura: '💳', compra: '🛍️' }

function Rosca({ itens, total }) {
  const R = 52
  const C = 2 * Math.PI * R
  let acumulado = 0
  return (
    <svg className="ini-rosca" viewBox="0 0 140 140" role="img" aria-label="Gastos por categoria neste mês">
      <circle cx="70" cy="70" r={R} fill="none" stroke="var(--bg4)" strokeWidth="18" />
      {itens.map((c, i) => {
        const parte = (c.valor / total) * C
        const el = (
          <circle key={c.nome} cx="70" cy="70" r={R} fill="none" stroke={CORES[i % CORES.length]} strokeWidth="18"
            strokeDasharray={`${Math.max(parte - 1.5, 0.5)} ${C}`} strokeDashoffset={-acumulado} transform="rotate(-90 70 70)" />
        )
        acumulado += parte
        return el
      })}
      <text x="70" y="66" textAnchor="middle" className="ini-rosca-t1">Neste</text>
      <text x="70" y="82" textAnchor="middle" className="ini-rosca-t1">mês</text>
    </svg>
  )
}

const TOM_LINHA = { pago: 'pago', atrasada: 'atrasada', aberta: 'aberta' }

// Linha do mês: cada bolinha é um dia com vencimento (tamanho = valor). Toque/clique mostra o que vence nele.
function LinhaDoMes({ linha, aberto, onAbrir }) {
  const maior = Math.max(1, ...linha.marcas.map((m) => m.valor))
  const pos = (dia) => `${((dia - 1) / Math.max(1, linha.ultimoDia - 1)) * 100}%`
  const marcaAberta = linha.marcas.find((m) => m.dia === aberto)
  return (
    <div>
      <div className="ini-linha-trilho">
        <div className="ini-linha-eixo" />
        {linha.hoje != null && (
          <div className="ini-linha-hoje" style={{ left: pos(linha.hoje) }}><span>hoje</span></div>
        )}
        {linha.marcas.map((m) => {
          const tam = Math.round(10 + 12 * Math.sqrt(m.valor / maior))
          return (
            <button
              key={m.dia}
              className={`ini-ponto-dia ${TOM_LINHA[m.estado]} ${aberto === m.dia ? 'sel' : ''}`}
              style={{ left: pos(m.dia), width: tam, height: tam }}
              onClick={() => onAbrir(aberto === m.dia ? null : m.dia)}
              aria-label={`Dia ${m.dia}: ${m.itens.map((i) => i.nome).join(', ')}, ${fmt(m.valor)}`}
              aria-pressed={aberto === m.dia}
            />
          )
        })}
      </div>
      <div className="ini-linha-escala" aria-hidden="true">
        {[1, 10, 20, linha.ultimoDia].map((d) => <span key={d} style={{ left: pos(d) }}>{d}</span>)}
      </div>
      {marcaAberta ? (
        <div className="ini-linha-detalhe">
          <strong>Dia {marcaAberta.dia}</strong>
          {marcaAberta.itens.map((i) => (
            <div key={i.nome} className="ini-linha-item"><span>{i.pago ? '✓ ' : ''}{i.nome}</span><span className="mono">{fmt(i.valor)}</span></div>
          ))}
        </div>
      ) : (
        <div className="ini-linha-legenda">
          <span><i className="aberta" /> a pagar</span><span><i className="atrasada" /> atrasada</span><span><i className="pago" /> paga</span>
          {linha.semData > 0 && <span className="ini-linha-sem">+ {linha.semData} sem data</span>}
        </div>
      )}
    </div>
  )
}

export default function Inicio({ store, irPara }) {
  const hojeMes = nowYM()
  const [mes, setMes] = useState(hojeMes)
  const [novaCompra, setNovaCompra] = useState(false)
  const [diaAberto, setDiaAberto] = useState(null)
  const d = useMemo(() => montarInicio(store, mes), [store, mes])
  const sazonal = useProjecaoSazonal(store, 12)
  const fechado = mesFechado(store.fechamentos, mes)
  const negativo = d.podeGastar < 0
  const semRenda = d.entrada === 0 && d.saldoAnterior === 0
  const proximas = d.abertas.slice(0, 6)
  const { atrasadas, proximos7 } = d.atencao
  const trocarMes = (novo) => { setMes(novo); setDiaAberto(null) }

  const acoes = (cls) => (
    <div className={`ini-acoes ${cls}`}>
      <button className="ini-btn ini-btn-gasto" onClick={() => setNovaCompra(true)} disabled={store.cartoes.length === 0}>+ Gasto</button>
      <button className="ini-btn ini-btn-entrada" onClick={() => irPara('renda')}>+ Entrada</button>
    </div>
  )

  return (
    <div className="page inicio">
      {novaCompra && (
        <ModalCompra
          cartoes={store.cartoes}
          categorias={store.categorias}
          pessoas={store.pessoas}
          gruposOk={store.compras.some((c) => 'grupo_id' in c)}
          faturaMesOk={store.compras.some((c) => 'fatura_mes' in c)}
          comprasExistentes={store.compras}
          onSave={store.addCompra}
          onSaveDivisao={store.salvarDivisao}
          onClose={() => setNovaCompra(false)}
        />
      )}

      <div className="ini-topo">
        <NavMes mes={mes} onChange={trocarMes} fechado={fechado} />
        {acoes('so-desk')}
      </div>

      <div className="ini-grade">
        <section className={`ini-hero ${negativo ? 'neg' : ''}`} aria-label="Saldo do mês">
          <div className="ini-hero-rotulo">{negativo ? 'Faltando para fechar o mês' : 'Pode gastar'}</div>
          <div className="ini-hero-valor mono">{negativo ? '−' : ''}{fmt(Math.abs(d.podeGastar))}</div>
          <div className="ini-hero-sub">
            {semRenda ? 'Cadastre a renda do mês para o saldo ficar certo.'
              : negativo ? 'As contas do mês passam do que entrou.'
                : d.porDia != null ? <>≈ <strong>{fmt(d.porDia)}</strong> por dia · {d.diasRestantes} {d.diasRestantes === 1 ? 'dia' : 'dias'} até o fim do mês</>
                  : 'Depois de pagar tudo o que falta no mês.'}
          </div>
          {semRenda && <button className="btn btn-primary btn-sm" onClick={() => irPara('renda')}>Cadastrar renda</button>}
          {d.reparto.total > 0 && (
            <div className="ini-reparto">
              <div className="ini-reparto-barra" role="img" aria-label={d.reparto.partes.map((p) => `${p.rotulo} ${fmt(p.valor)}`).join(', ')}>
                {d.reparto.partes.filter((p) => p.pct > 0).map((p) => <div key={p.chave} className={`ini-seg ${p.chave}`} style={{ width: `${p.pct}%` }} />)}
              </div>
              <div className="ini-reparto-leg">
                {d.reparto.partes.filter((p) => p.valor > 0).map((p) => (
                  <span key={p.chave}><i className={p.chave} />{p.rotulo} <b className="mono">{fmt(p.valor)}</b></span>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="ini-kpis" aria-label="Resumo do mês">
          <div className="ini-mini">
            <div className="ini-mini-rotulo"><span className="ini-seta up">↑</span> Entrada</div>
            <div className="ini-mini-valor mono verde">{fmt(d.entrada)}</div>
          </div>
          <div className="ini-mini">
            <div className="ini-mini-rotulo"><span className="ini-seta down">↓</span> Comprometido</div>
            <div className="ini-mini-valor mono">{fmt(d.comprometido)}</div>
          </div>
          <div className="ini-mini">
            <div className="ini-mini-rotulo"><span className="ini-seta ok">✓</span> Já pago</div>
            <div className="ini-mini-valor mono">{fmt(d.pago)}</div>
            {d.comprometido > 0 && <div className="ini-mini-nota">{d.pctPago}% das contas</div>}
          </div>
        </section>

        {acoes('so-mob')}

        <section className={`ini-atencao ${atrasadas.n ? 'ruim' : proximos7.n ? 'aviso' : 'ok'}`} aria-live="polite">
          {atrasadas.n > 0 ? (
            <>⚠ <b>{atrasadas.n} {atrasadas.n === 1 ? 'conta atrasada' : 'contas atrasadas'}</b> · {fmt(atrasadas.valor)}{proximos7.n > 0 && <span> · e {fmt(proximos7.valor)} vence nos próximos 7 dias</span>}</>
          ) : proximos7.n > 0 ? (
            <>🗓 <b>{fmt(proximos7.valor)}</b> vence nos próximos 7 dias ({proximos7.n} {proximos7.n === 1 ? 'conta' : 'contas'})</>
          ) : d.contas.length > 0 && d.abertas.length === 0 ? (
            <>🎉 Tudo pago neste mês</>
          ) : (
            <>✓ Nada vencendo nos próximos 7 dias</>
          )}
        </section>

        {sazonal.ativo && sazonal.plano.tem && (() => {
          const w = sazonal.plano.janelas[0]
          return (
            <section className="ini-atencao aviso" aria-live="polite">
              🗓 <b>{mesLabel(w.primeiroMes)}</b> deve ficar no vermelho (faltam {fmt(w.buraco)}).{' '}
              {w.precisa > 0 && w.mesesAntes > 0 ? <>Guarde <b>{fmt(w.porMes)}</b> por mês até lá. </> : null}
              <button className="link-btn" onClick={() => irPara('renda')}>Ver o plano</button>
            </section>
          )
        })()}

        {d.linha.marcas.length > 0 && (
          <section className="ini-card ini-linha">
            <div className="ini-card-topo"><h2>Linha do mês</h2><span className="ini-card-dica">toque numa bolinha para ver o dia</span></div>
            <LinhaDoMes linha={d.linha} aberto={diaAberto} onAbrir={setDiaAberto} />
          </section>
        )}

        <section className="ini-card ini-contas">
          <div className="ini-card-topo">
            <h2>Contas a pagar</h2>
            {d.contas.length > 0 && <span className="ini-card-dica">falta {fmt(d.aPagar)}</span>}
          </div>
          {d.contas.length === 0 && <div className="ini-vazio">Nenhuma conta neste mês.</div>}
          {d.contas.length > 0 && proximas.length === 0 && <div className="ini-vazio">Tudo pago neste mês 🎉</div>}
          {proximas.map((c) => (
            <div key={c.chave} className="ini-conta">
              <span className="ini-conta-ic" aria-hidden="true">{ICONE_TIPO[c.tipo]}</span>
              <div className="ini-conta-meio">
                <div className="ini-conta-nome">{c.nome}</div>
                <div className={`ini-conta-quando ${c.atrasada ? 'atrasada' : c.dias != null && c.dias <= 3 ? 'perto' : ''}`}>{c.texto}{c.estimado ? ' · estimado' : ''}</div>
              </div>
              <div className="ini-conta-valor mono">{fmt(c.valor)}</div>
            </div>
          ))}
          {d.abertas.length > proximas.length && <div className="ini-mais">+ {d.abertas.length - proximas.length} contas em aberto</div>}
          <button className="ini-link" onClick={() => irPara('pagamentos')}>Ver tudo e marcar como pago →</button>
        </section>

        <section className="ini-card ini-cats-card">
          <div className="ini-card-topo"><h2>Gastos por categoria</h2></div>
          {d.categorias.total === 0 ? <div className="ini-vazio">Sem gastos neste mês ainda.</div> : (
            <div className="ini-cats">
              <Rosca itens={d.categorias.itens} total={d.categorias.total} />
              <ul className="ini-legenda">
                {d.categorias.itens.map((c, i) => (
                  <li key={c.nome}>
                    <span className="ini-ponto" style={{ background: CORES[i % CORES.length] }} />
                    <span className="ini-leg-nome">{c.nome}</span>
                    <span className="ini-leg-valor mono">{fmt(c.valor)}</span>
                    <span className="ini-leg-pct">{String(c.pct).replace('.', ',')}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button className="ini-link" onClick={() => irPara('dashboard')}>Detalhes por categoria →</button>
        </section>

        <div className="ini-longo"><LongoPrazo store={store} irPara={irPara} compacto /></div>
      </div>
    </div>
  )
}
