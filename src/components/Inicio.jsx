import { useEffect, useState, useMemo } from 'react'
import { montarInicio, itensDeAtencao } from '../lib/inicio'
import { fmt, fmtK, mesLabel, nowYM, hojeSP } from '../lib/utils'
import { resumoDoPlano } from '../lib/dividasResumo'
import { cartaoAulasInicio } from '../lib/aulasInicio'
import { perfil } from '../lib/perfil'
import { retornosPendentes, aniversariantes } from '../lib/atendimentosExtra'
import { atendimentosDoMes, resumoMes as resumoAtendimentos, aReceber as atendimentoAReceber, porData } from '../lib/atendimentos'
import { patchRealizar, textoDuracao, valorAula } from '../lib/aulas'
import { mesFechado } from '../lib/fechamento'
import ModalCompra from './ModalCompra'
import LongoPrazo from './LongoPrazo'
import NavMes from './NavMes'
import { useProjecaoSazonal } from './RendaSazonal'
import { sb } from '../lib/supabase'
import { listarImportadas } from '../lib/importacaoLote'
import { cartoesDoMes } from '../lib/faturasMes'
import HeroInicio from './inicio/HeroInicio'
import Atencao from './inicio/Atencao'
import AcoesRapidas from './inicio/AcoesRapidas'

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
      <text x="70" y="64" textAnchor="middle" className="ini-rosca-t1">Gasto no mês</text>
      <text x="70" y="82" textAnchor="middle" className="ini-rosca-t2">{fmtK(total)}</text>
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
  const [importadas, setImportadas] = useState([]) // lotes de importação (para saber quais faturas faltam conciliar)
  useEffect(() => { listarImportadas(sb, 60).then(setImportadas).catch(() => setImportadas([])) }, [])
  // Aulas particulares: as de hoje, o que falta atualizar e o que ainda não foi recebido no mês
  const hojeISO = hojeSP()
  // Atendimentos (perfil esteticista): os de hoje e o que ainda não foi recebido no mês
  const atendCard = useMemo(() => {
    if (!perfil.atendimentos || !store.atendimentosOk || !(store.atendimentos || []).length || mes !== hojeISO.slice(0, 7)) return null
    const hojeLista = store.atendimentos.filter((a) => a.data === hojeISO && a.status !== 'cancelado').sort(porData)
    const atrasados = store.atendimentos.filter((a) => a.status === 'agendado' && a.data < hojeISO).length
    const r = resumoAtendimentos(atendimentosDoMes(store.atendimentos, mes))
    const receber = store.atendimentos.filter(atendimentoAReceber).reduce((t, a) => t + Number(a.valor), 0)
    const retornos = store.pacotesOk ? retornosPendentes({ clientes: store.clientes || [], atendimentos: store.atendimentos, servicos: store.servicos || [], hoje: hojeISO, antes: 3 }) : []
    const aniv = aniversariantes(store.clientes || [], hojeISO, 7)
    return hojeLista.length || atrasados || receber > 0 || r.faturado || r.previsto || retornos.length || aniv.length ? { hoje: hojeLista, atrasados, r, receber, retornos, aniv } : null
  }, [store.atendimentosOk, store.atendimentos, store.clientes, store.servicos, store.pacotesOk, mes, hojeISO])
  const aulasCard = useMemo(() => (perfil.aulas ? cartaoAulasInicio(store, hojeISO, mes) : null), [store.aulasOk, store.alunos, store.aulas, store.aulasFech, store.aulasMesBase, store.aulasPausas, store.inicioApp, mes, hojeISO]) // eslint-disable-line react-hooks/exhaustive-deps
  const realizarAula = (a) => store.atualizarAula(a.id, patchRealizar(a, a.duracao_min, new Date().toISOString()))
  const planoDividas = useMemo(() => (store.dividas?.length ? resumoDoPlano(store, hojeSP()) : null), [store.dividas, store.rendas, store.fixos, store.compras, store.faturas, store.fixosPagamentos, store.comprasPagamentos, store.adiamentos, store.rendaSazonal]) // eslint-disable-line react-hooks/exhaustive-deps
  const sazonal = useProjecaoSazonal(store, 12)
  const fechado = mesFechado(store.fechamentos, mes)
  const semRenda = d.entrada === 0 && d.saldoAnterior === 0
  const proximas = d.abertas.slice(0, 6)
  const { atrasadas, proximos7 } = d.atencao
  const trocarMes = (novo) => { setMes(novo); setDiaAberto(null) }

  // O que pede ação: vencidas, faturas com diferença ou sem conciliar, Inbox, a receber, dívidas, plano sazonal
  const inboxPendentes = (store.eventos || []).filter((e) => e.status === 'pendente' || e.status === 'aguardando_dados').length
  const cartoesMes = useMemo(() => cartoesDoMes({ faturas: store.faturas, compras: store.compras, cartoes: store.cartoes, fixos: store.fixos, importacoes: importadas, mes, hoje: hojeISO }), [store.faturas, store.compras, store.cartoes, store.fixos, importadas, mes, hojeISO])
  const aReceber = [
    ...(aulasCard?.mes?.aReceber > 0.005 ? [{ valor: aulasCard.mes.aReceber, rotulo: 'aulas ainda não recebidas', tela: 'aulas' }] : []),
    ...(atendCard?.receber > 0 ? [{ valor: atendCard.receber, rotulo: 'atendimentos ainda não recebidos', tela: 'atendimentos' }] : []),
  ]
  const janelaSazonal = sazonal.ativo && sazonal.plano.tem ? sazonal.plano.janelas[0] : null
  const itensAtencao = itensDeAtencao({
    semRenda, atrasadas, proximos7, inboxPendentes, aReceber, dividasAtrasadas: planoDividas?.atrasadas || 0,
    faturasComDiferenca: cartoesMes.filter((l) => ['faltam', 'excede'].includes(l.estados.diferenca)).map((l) => ({ nome: l.cartao.nome, diferenca: l.diferenca })),
    faturasParaConciliar: cartoesMes.filter((l) => ['importada', 'parcial'].includes(l.estados.conciliacao)).length,
    sazonal: janelaSazonal ? { mes: mesLabel(janelaSazonal.primeiroMes), buraco: janelaSazonal.buraco } : null,
  })

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
        <AcoesRapidas cls="so-desk" compacta aoNovaCompra={() => setNovaCompra(true)} semCartao={store.cartoes.length === 0} irPara={irPara} />
      </div>

      <div className="ini-grade">
        <HeroInicio d={d} mes={mes} semRenda={semRenda} irPara={irPara} />
        <Atencao itens={itensAtencao} irPara={irPara} />
        <AcoesRapidas cls="so-mob" aoNovaCompra={() => setNovaCompra(true)} semCartao={store.cartoes.length === 0} irPara={irPara} />

        <section className="ini-card ini-contas">
          <div className="ini-card-topo">
            <h2>Próximos pagamentos</h2>
            {d.contas.length > 0 && <span className="ini-card-dica">falta {fmt(d.aPagar)}</span>}
          </div>
          {d.linha.marcas.length > 0 && (
            <details className="ini-linha ini-linha-det">
              <summary className="ini-sub-rotulo">Linha do mês <span>· toque numa bolinha para ver o dia</span></summary>
              <LinhaDoMes linha={d.linha} aberto={diaAberto} onAbrir={setDiaAberto} />
            </details>
          )}
          {d.contas.length === 0 && <div className="ini-vazio">Nenhuma conta neste mês.</div>}
          {d.contas.length > 0 && proximas.length === 0 && <div className="ini-vazio">Tudo pago neste mês 🎉</div>}
          {proximas.map((c) => (
            <div key={c.chave} className={`ini-conta ${c.atrasada ? 'atrasada' : ''}`}>
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

        <div className="ini-lateral">
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
            <button className="ini-link" onClick={() => irPara('dashboard')}>Ver análises →</button>
          </section>

          {atendCard && (
            <section className="ini-card ini-aulas">
              <div className="ini-card-topo">
                <h2>Atendimentos</h2>
                <button className="link-btn" onClick={() => irPara('atendimentos')}>Abrir agenda →</button>
              </div>
              {atendCard.hoje.length > 0 ? (
                <div className="ini-aulas-hoje">
                  <div className="cad-sub">Hoje</div>
                  {atendCard.hoje.map((a) => (
                    <div key={a.id} className="ini-aula-linha">
                      <span><b>{a.horario ? `${a.horario} · ` : ''}{(store.clientes || []).find((c) => c.id === a.cliente_id)?.nome || '—'}</b> <span className="cad-sub">{a.servico_nome} · {fmt(a.valor)}{a.status === 'realizado' ? ' · feito' : a.status === 'faltou' ? ' · faltou' : ''}</span></span>
                    </div>
                  ))}
                </div>
              ) : <div className="cad-sub">Nenhum atendimento hoje.</div>}
              {atendCard.atrasados > 0 && <button className="ini-aulas-aviso" onClick={() => irPara('atendimentos')}>⚠ {atendCard.atrasados} {atendCard.atrasados === 1 ? 'atendimento de dia passado ainda agendado' : 'atendimentos de dias passados ainda agendados'}: toque para atualizar</button>}
              {atendCard.retornos.length > 0 && <button className="ini-aulas-aviso" onClick={() => irPara('atendimentos')}>📞 Para chamar: {atendCard.retornos.slice(0, 4).map((x) => x.cliente.nome.split(' ')[0]).join(', ')}{atendCard.retornos.length > 4 ? ` e mais ${atendCard.retornos.length - 4}` : ''}</button>}
              {atendCard.aniv.length > 0 && <button className="ini-aulas-aviso" onClick={() => irPara('atendimentos')}>🎂 Aniversário: {atendCard.aniv.map((x) => `${x.cliente.nome.split(' ')[0]} (${x.dias === 0 ? 'hoje' : x.data.split('-').reverse().slice(0, 2).join('/')})`).join(', ')}</button>}
              <div className="ini-aulas-mes">
                <span>{mesLabel(mes)}: <b className="mono">{fmt(atendCard.r.faturado)}</b> feitos{atendCard.r.previsto > 0 ? <> + <b className="mono">{fmt(atendCard.r.previsto)}</b> agendados</> : null}</span>
                {atendCard.receber > 0 && <span style={{ color: 'var(--amber)' }}>a receber <b className="mono">{fmt(atendCard.receber)}</b></span>}
              </div>
            </section>
          )}

          {aulasCard && (
            <section className="ini-card ini-aulas">
              <div className="ini-card-topo">
                <h2>Aulas particulares</h2>
                <button className="link-btn" onClick={() => irPara('aulas')}>Abrir aulas →</button>
              </div>
              {aulasCard.hoje.length > 0 ? (
                <div className="ini-aulas-hoje">
                  <div className="cad-sub">Hoje</div>
                  {aulasCard.hoje.map(({ aula, aluno }) => (
                    <div key={aula.id} className="ini-aula-linha">
                      <span><b>{aula.horario ? `${aula.horario} · ` : ''}{aluno.nome}</b> <span className="cad-sub">{textoDuracao(aula.duracao_min)} · {fmt(valorAula(aula.valor_hora_centavos, aula.duracao_min) / 100)}</span></span>
                      <button className="btn btn-primary btn-sm" onClick={() => realizarAula(aula)}>✓ Realizada</button>
                    </div>
                  ))}
                </div>
              ) : <div className="cad-sub">Nenhuma aula prevista para hoje.</div>}
              {aulasCard.atrasadas > 0 && (
                <button className="ini-aulas-aviso" onClick={() => irPara('aulas')}>⚠ {aulasCard.atrasadas} {aulasCard.atrasadas === 1 ? 'aula de dia passado ainda como prevista' : 'aulas de dias passados ainda como previstas'}: toque para atualizar</button>
              )}
              {aulasCard.followups.length > 0 && (
                <button className="ini-aulas-aviso" onClick={() => irPara('aulas')}>
                  📞 Follow-up: {aulasCard.followups.map((x) => `${x.aluno.nome} ${x.dias < 0 ? `(voltava em ${x.retorno.split('-').reverse().slice(0, 2).join('/')})` : x.dias === 0 ? '(volta hoje)' : `(volta em ${x.dias} ${x.dias === 1 ? 'dia' : 'dias'})`}`).join(', ')}
                </button>
              )}
              {aulasCard.saidas.length > 0 && (
                <button className="ini-aulas-aviso" onClick={() => irPara('aulas')}>
                  🎓 Saída prevista: {aulasCard.saidas.map((x) => `${x.aluno.nome} (${x.saida.split('-').reverse().slice(0, 2).join('/')})`).join(', ')}
                </button>
              )}
              {(aulasCard.mes || aulasCard.aReceberFechado > 0) && (
                <div className="ini-aulas-mes">
                  {aulasCard.mes && <span>{mesLabel(mes)}: <b className="mono">{fmt(aulasCard.mes.valor)}</b> em aulas{aulasCard.mes.projetada ? ' (previsto)' : ''}</span>}
                  {aulasCard.mes && aulasCard.mes.aReceber > 0.005 && <span>ainda não recebido <b className="mono">{fmt(aulasCard.mes.aReceber)}</b></span>}
                  {aulasCard.aReceberFechado > 0 && <span style={{ color: 'var(--amber)' }}>{aulasCard.nFechadas} {aulasCard.nFechadas === 1 ? 'mês fechado' : 'meses fechados'} sem recebimento: <b className="mono">{fmt(aulasCard.aReceberFechado)}</b></span>}
                </div>
              )}
            </section>
          )}

          {planoDividas && (
            <section className="ini-card ini-dividas">
              <div className="ini-card-topo">
                <h2>Dívidas</h2>
                <button className="link-btn" onClick={() => irPara('dividas')}>Abrir o plano →</button>
              </div>
              <div className="ini-dividas-linha">
                <div><div className="cad-sub">Você deve</div><div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--red)' }}>{fmt(planoDividas.total)}</div></div>
                <div style={{ textAlign: 'right' }}><div className="cad-sub">{planoDividas.livreMes ? 'Livre em' : 'Prazo'}</div><div className="mono" style={{ fontSize: 18, fontWeight: 600, color: 'var(--green)' }}>{planoDividas.livreMes ? mesLabel(planoDividas.livreMes) : '—'}</div></div>
              </div>
              <div className="aulas-meta-barra" role="progressbar" aria-valuenow={planoDividas.pctPago} aria-valuemin={0} aria-valuemax={100} aria-label="Já pago do total das dívidas"><span className="apur" style={{ width: `${planoDividas.pctPago}%` }} /></div>
              <div className="cad-sub">
                {planoDividas.pctPago > 0 ? `Já pagou ${fmt(planoDividas.pago)} (${planoDividas.pctPago}%). ` : ''}
                {planoDividas.proxima ? <>Próxima a quitar: <b>{planoDividas.proxima.nome}</b> em {mesLabel(planoDividas.proxima.mes)}.</> : 'Informe a parcela ou o valor por mês para o app estimar a quitação.'}
                {planoDividas.atrasadas > 0 ? ` ${planoDividas.atrasadas} ${planoDividas.atrasadas === 1 ? 'está atrasada' : 'estão atrasadas'}.` : ''}
              </div>
            </section>
          )}
        </div>

        <div className="ini-longo"><LongoPrazo store={store} irPara={irPara} compacto /></div>
      </div>
    </div>
  )
}
