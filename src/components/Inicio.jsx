import { useState, useMemo } from 'react'
import { montarInicio } from '../lib/inicio'
import { fmt, mesLabel, nowYM, addMonths } from '../lib/utils'
import { mesFechado } from '../lib/fechamento'
import ModalCompra from './ModalCompra'

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

export default function Inicio({ store, irPara }) {
  const hojeMes = nowYM()
  const [mes, setMes] = useState(hojeMes)
  const [novaCompra, setNovaCompra] = useState(false)
  const d = useMemo(() => montarInicio(store, mes), [store, mes])
  const fechado = mesFechado(store.fechamentos, mes)
  const negativo = d.podeGastar < 0
  const semRenda = d.entrada === 0 && d.saldoAnterior === 0
  const proximas = d.abertas.slice(0, 6)

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

      <div className="ini-mes">
        <button className="icon-btn" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior">‹</button>
        <div className="ini-mes-nome">{mesLabel(mes)}{fechado && <span className="badge badge-gray" style={{ marginLeft: 8 }}>fechado</span>}</div>
        <button className="icon-btn" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">›</button>
        {mes !== hojeMes && <button className="btn btn-ghost btn-sm" onClick={() => setMes(hojeMes)}>Hoje</button>}
      </div>

      <section className={`ini-hero ${negativo ? 'neg' : ''}`} aria-label="Saldo disponível">
        <div className="ini-hero-rotulo">{negativo ? 'Faltando para fechar o mês' : 'Pode gastar'}</div>
        <div className="ini-hero-valor mono">{negativo ? '−' : ''}{fmt(Math.abs(d.podeGastar))}</div>
        <div className="ini-hero-sub">
          {semRenda ? 'Cadastre a renda do mês para o saldo ficar certo.' : negativo ? 'Entradas menores que o que já está comprometido.' : 'Já descontando tudo o que ainda falta pagar no mês.'}
        </div>
        {semRenda && <button className="btn btn-primary btn-sm" onClick={() => irPara('renda')}>Cadastrar renda</button>}
      </section>

      <div className="ini-duo">
        <div className="ini-mini">
          <div className="ini-mini-rotulo"><span className="ini-seta up">↑</span> Entrada no mês</div>
          <div className="ini-mini-valor mono verde">{fmt(d.entrada)}</div>
        </div>
        <div className="ini-mini">
          <div className="ini-mini-rotulo"><span className="ini-seta down">↓</span> Comprometido</div>
          <div className="ini-mini-valor mono">{fmt(d.comprometido)}</div>
        </div>
      </div>

      <div className="ini-acoes">
        <button className="ini-btn ini-btn-gasto" onClick={() => setNovaCompra(true)} disabled={store.cartoes.length === 0}>+ Gasto</button>
        <button className="ini-btn ini-btn-entrada" onClick={() => irPara('renda')}>+ Entrada</button>
      </div>

      <section className="ini-card">
        <div className="ini-card-topo">
          <h2>Contas a pagar</h2>
          {d.contas.length > 0 && <span className="ini-card-dica">{d.pctPago}% pago · falta {fmt(d.aPagar)}</span>}
        </div>
        {d.contas.length > 0 && <div className="ini-barra" aria-hidden="true"><div style={{ width: `${d.pctPago}%` }} /></div>}
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

      <section className="ini-card">
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
    </div>
  )
}
