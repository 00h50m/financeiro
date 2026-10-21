import { useEffect, useMemo, useRef, useState } from 'react'
import { fmt, fmtK, mesLabel, nowYM, hojeSP } from '../lib/utils'
import {
  aulasDoMes, centavosParaReais, diaDaSemana, frasePrevistoRealizado, gerarOcorrencias, mesDe, patchDesfazer, patchRealizar, pendenteDeAtualizacao,
  planejarGeracao, reposicaoAtiva, resumoMes, textoDuracao, valorAula, valorDaAula, duracaoEfetiva, STATUS, DIAS_CURTOS,
} from '../lib/aulas'
import NavMes from './NavMes'
import Secao from './Secao'
import ModalAluno from './aulas/ModalAluno'
import DialogosAula, { rotuloData } from './aulas/DialogosAula'
import SeletorDuracao from './aulas/SeletorDuracao'
import Calendario from './aulas/Calendario'
import ModalLote from './aulas/ModalLote'
import MetaAulas from './aulas/MetaAulas'
import { lerMeta, situacaoMeta } from '../lib/aulasMeta'
import Relatorio from './aulas/Relatorio'
import ModalConfigAulas from './aulas/ModalConfigAulas'
import ModalPausas from './aulas/ModalPausas'
import SimuladorAluno from './aulas/SimuladorAluno'
import { nomeSerieCurto } from '../lib/alunosCiclo'
import ModalFechamento from './aulas/ModalFechamento'
import { achaFechamento, fechadoStatus, valorAlunoMes } from '../lib/aulasFechamento'

const dataBr = (d) => d.split('-').reverse().join('/')
const COR_STATUS = { prevista: 'badge-blue', realizada: 'badge-green', cancelada: 'badge-gray', nao_realizada: 'badge-amber' }

const dataBrCurta = (d) => d.split('-').reverse().join('/').slice(0, 5) + '/' + d.slice(2, 4)
const somarUmDia = (iso) => new Date(Date.parse(`${iso}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)

export default function Aulas({ store }) {
  const { alunos, aulasProg, aulas, aulasPrevInicial, aulasFech, aulasPausas, aulasOk, loading, config, definirConfig, gerarAulas, atualizarAula, excluirAula } = store
  const hoje = hojeSP()
  const [mes, setMes] = useState(nowYM())
  const [filtro, setFiltro] = useState('')
  const [modalAluno, setModalAluno] = useState(null) // { aluno } | {}
  const [dialogo, setDialogo] = useState(null) // { tipo, aula? }
  const [menu, setMenu] = useState(null)
  const [visao, setVisao] = useState('lista') // 'lista' | 'calendario'
  const [dia, setDia] = useState(null)
  const [modoSel, setModoSel] = useState(false)
  const [sel, setSel] = useState(() => new Set())
  const [lote, setLote] = useState(false)
  const [compAberto, setCompAberto] = useState(false)
  const [pausasAberto, setPausasAberto] = useState(false)
  const [simuladorAberto, setSimuladorAberto] = useState(false)
  const [pausaAluno, setPausaAluno] = useState('') // aluno pré-selecionado ao abrir 'Pausar' pelo cadastro
  const [configAberta, setConfigAberta] = useState(false)
  const [fechando, setFechando] = useState(null) // aluno cujo fechamento está aberto
  const tentadas = useRef(new Set())

  // Gera as aulas previstas do mês de cada aluno ao abrir/navegar. Idempotente: só cria o que falta (e o banco impede duplicata).
  useEffect(() => {
    if (!aulasOk || loading) return
    const novas = []
    const previsoes = []
    for (const al of alunos) {
      const progs = aulasProg.filter((p) => p.aluno_id === al.id)
      const chave = [mes, al.id, al.ativo, al.inicio, al.fim || '', al.inativado_em || '', al.valor_hora_centavos, ...progs.map((p) => `${p.id}:${p.vigencia_fim || ''}`), ...aulasPausas.filter((x) => !x.aluno_id || x.aluno_id === al.id).map((x) => `${x.id}`)].join('|')
      if (tentadas.current.has(chave)) continue
      tentadas.current.add(chave)
      novas.push(...planejarGeracao(al, progs, aulas.filter((a) => a.aluno_id === al.id), mes, aulasPausas))
      if (!aulasPrevInicial.some((p) => p.aluno_id === al.id && p.mes === mes)) {
        const oc = gerarOcorrencias(al, progs, mes, aulasPausas)
        if (oc.length) previsoes.push({ aluno_id: al.id, mes, qtd: oc.length, minutos: oc.reduce((t, o) => t + o.duracao_min, 0), valor_centavos: oc.reduce((t, o) => t + valorAula(al.valor_hora_centavos, o.duracao_min), 0) })
      }
    }
    if (novas.length || previsoes.length) gerarAulas(novas, previsoes)
  }, [aulasOk, loading, alunos, aulasProg, aulas, aulasPrevInicial, aulasPausas, mes, gerarAulas])

  const alunoPorId = useMemo(() => new Map(alunos.map((a) => [a.id, a])), [alunos])
  const ativos = alunos.filter((a) => a.ativo !== false)
  const doMes = aulasDoMes(aulas, mes, filtro || null)
  const previsoesMes = aulasPrevInicial.filter((p) => p.mes === mes && (!filtro || p.aluno_id === filtro))
  const r = resumoMes(doMes, previsoesMes)
  const alunosVisiveis = alunos.filter((a) => (!filtro || a.id === filtro) && (a.ativo !== false || aulasDoMes(aulas, mes, a.id).length))
  const valores = alunosVisiveis.map((a) => ({ al: a, ...valorAlunoMes(aulas, aulasFech, a.id, mes) }))
  const nFechados = valores.filter((v) => fechadoStatus(v.fechamento)).length
  const fechadoValor = valores.filter((v) => fechadoStatus(v.fechamento)).reduce((t, v) => t + v.valor, 0)
  const aReceber = valores.reduce((t, v) => t + (fechadoStatus(v.fechamento) ? v.aReceber : 0), 0)
  const recebidoTotal = valores.reduce((t, v) => t + v.recebido, 0)
  const rotuloPag = !nFechados ? 'nada fechado' : aReceber <= 0 && recebidoTotal > 0 ? 'tudo recebido' : recebidoTotal > 0 ? 'recebimento parcial' : 'aguardando pagamento'
  // Meta do mês (todos os alunos). Mês ainda sem aulas geradas usa a projeção pela programação.
  const metaCent = lerMeta(config)
  const aulasDoMesTodas = aulasDoMes(aulas, mes)
  const rTodos = resumoMes(aulasDoMesTodas, [])
  const previstoMes = aulasDoMesTodas.length ? rTodos.previsto : Math.round((store.aulasMesBase?.[mes]?.valor || 0) * 100)
  const sitMeta = situacaoMeta({ metaCentavos: metaCent, previstoCentavos: previstoMes, apuradoCentavos: rTodos.apurado, aulasMes: aulasDoMesTodas, alunosAtivos: ativos })
  const fechado = (alunoId, m) => aulasFech.some((f) => f.aluno_id === alunoId && f.mes === m && (f.status === 'fechado' || f.status === 'sem_cobranca'))
  const bloqueia = (alunoId, ...meses) => {
    const m = meses.find((x) => fechado(alunoId, x))
    if (!m) return false
    window.alert(`O mês de ${mesLabel(m)} deste aluno está fechado. Para alterar a aula, reabra o fechamento do aluno primeiro.`)
    return true
  }

  if (!aulasOk) {
    return (
      <div className="page">
        <div className="alert alert-amber"><strong>Falta criar as tabelas das aulas particulares no banco.</strong> Rode o arquivo <code>inbox/23_aulas_particulares.sql</code> no SQL Editor do Supabase e recarregue esta página.</div>
      </div>
    )
  }

  async function realizar(a, minutos) {
    if (bloqueia(a.aluno_id, mesDe(a.data))) return
    await atualizarAula(a.id, patchRealizar(a, minutos, new Date().toISOString()))
  }
  async function mudarDuracao(a, minutos) {
    if (bloqueia(a.aluno_id, mesDe(a.data))) return
    const campo = a.status === 'realizada' ? { duracao_real_min: minutos, valor_centavos: valorAula(a.valor_hora_centavos, minutos) } : { duracao_min: minutos }
    await atualizarAula(a.id, { ...campo, historico: [...(a.historico || []), { em: new Date().toISOString(), tipo: 'editada', campos: [a.status === 'realizada' ? 'duracao_real' : 'duracao'] }] })
  }
  async function desfazer(a) {
    if (bloqueia(a.aluno_id, mesDe(a.data))) return
    if (!window.confirm('Voltar esta aula para "Prevista"? O valor registrado nela será desfeito.')) return
    await atualizarAula(a.id, patchDesfazer(a, new Date().toISOString()))
  }
  async function excluir(a) {
    if (!window.confirm('Excluir esta aula avulsa? Ela ainda não foi realizada.')) return
    await excluirAula(a.id)
  }
  const abrirDialogo = (tipo, aula) => {
    if (aula && bloqueia(aula.aluno_id, mesDe(aula.data))) return
    setMenu(null)
    setDialogo({ tipo, aula })
  }

  const alternar = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const selecionaveis = doMes.filter((a) => a.status === 'prevista' && !fechado(a.aluno_id, mesDe(a.data)))
  const selAulas = selecionaveis.filter((a) => sel.has(a.id))
  const sairSel = () => { setModoSel(false); setSel(new Set()) }
  const cardAula = (a) => {
    const al = alunoPorId.get(a.aluno_id)
    const pendente = pendenteDeAtualizacao(a, hoje)
    const original = a.data_original !== a.data && a.origem === 'recorrente' ? a.data_original : null
    const repo = (a.status === 'cancelada' || a.status === 'nao_realizada') ? reposicaoAtiva(a, aulas) : null
    return (
      <article key={a.id} className={`aula-card ${a.status} ${sel.has(a.id) ? 'marcada' : ''}`}>
        {modoSel && (a.status === 'prevista' && !fechado(a.aluno_id, mesDe(a.data))
          ? <input type="checkbox" className="aula-check" checked={sel.has(a.id)} onChange={() => alternar(a.id)} aria-label="Selecionar aula" />
          : <span className="aula-check" />)}
        <div className="aula-data"><b>{DIAS_CURTOS[diaDaSemana(a.data)]}</b><span>{dataBr(a.data).slice(0, 5)}</span>{a.horario && <em>{a.horario}</em>}</div>
        <div className="aula-corpo">
          <div className="aula-linha1">
            {!filtro && <strong>{al?.nome}</strong>}
            <span className={`badge ${COR_STATUS[a.status]}`}>{STATUS[a.status]}</span>
            {a.origem === 'avulsa' && <span className="badge badge-purple">Avulsa</span>}
            {a.origem === 'reposicao' && <span className="badge badge-purple">Reposição</span>}
            {original && <span className="badge badge-gray" title="Data original da aula">remarcada de {dataBr(original).slice(0, 5)}</span>}
            {a.data === hoje && <span className="badge badge-green">hoje</span>}
            {pendente && <span className="badge badge-amber" title="A data já passou: confirme se a aula aconteceu">atualizar</span>}
          </div>
          <div className="aula-linha2">
            {a.status === 'realizada' || a.status === 'prevista' ? (
              <>
                <SeletorDuracao valor={duracaoEfetiva(a)} onChange={(m) => mudarDuracao(a, m)} rotulo={a.status === 'realizada' ? 'Duração efetiva' : 'Duração prevista'} className="aula-dur" />
                <span className="mono aula-valor">{fmt(centavosParaReais(valorDaAula(a)))}</span>
                {a.status === 'realizada' && a.duracao_real_min !== a.duracao_min && <span className="cad-sub">prevista {textoDuracao(a.duracao_min)}</span>}
              </>
            ) : (
              <span className="cad-sub">{a.status === 'cancelada' ? 'Cancelada' : 'Não realizada'}{a.quem ? ` por ${a.quem === 'aluno' ? 'aluno/responsável' : 'professora'}` : ''}{a.motivo ? ` · ${a.motivo}` : ''} · sem cobrança</span>
            )}
            {repo && <span className="cad-sub">· reposição em {dataBr(repo.data).slice(0, 5)}</span>}
            {a.reposicao_de && <span className="cad-sub">· repõe aula de {dataBr(aulas.find((x) => x.id === a.reposicao_de)?.data || a.data).slice(0, 5)}</span>}
          </div>
          {a.observacao && <div className="cad-sub">{a.observacao}</div>}
        </div>
        <div className="aula-acoes">
          {a.status === 'prevista' && <button className="btn btn-primary btn-sm" onClick={() => realizar(a, a.duracao_min)}>✓ Realizada</button>}
          {(a.status === 'cancelada' || a.status === 'nao_realizada') && !repo && <button className="btn btn-ghost btn-sm" onClick={() => abrirDialogo('reposicao', a)}>Repor</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => setMenu(a)} aria-label="Mais ações da aula">⋯</button>
        </div>
      </article>
    )
  }

  const alunoFiltrado = filtro ? alunoPorId.get(filtro) : null

  return (
    <div className="page aulas-pg">
      {modalAluno && <ModalAluno store={store} aluno={modalAluno.aluno} inicialAvulso={!!modalAluno.avulso} onPausar={(al) => { setModalAluno(null); setPausaAluno(al.id); setPausasAberto(true) }} onClose={() => setModalAluno(null)} />}
      {lote && <ModalLote store={store} aulas={selAulas} alunoPorId={alunoPorId} onClose={(ok) => { setLote(false); if (ok) sairSel() }} />}
      {configAberta && <ModalConfigAulas modo={store.modoRendaAulas} definirConfig={definirConfig} onClose={() => setConfigAberta(false)} />}
      {simuladorAberto && <SimuladorAluno store={store} metaCentavos={metaCent} onClose={() => setSimuladorAberto(false)} />}
      {pausasAberto && <ModalPausas store={store} alunos={alunos} alunoInicial={pausaAluno} onClose={() => { setPausasAberto(false); setPausaAluno('') }} />}
      {fechando && <ModalFechamento store={store} aluno={fechando} mes={mes} onClose={() => setFechando(null)} />}
      {dialogo && (
        <DialogosAula
          store={store} tipo={dialogo.tipo} aula={dialogo.aula} aluno={dialogo.aula ? alunoPorId.get(dialogo.aula.aluno_id) : alunoFiltrado || ativos[0]}
          alunos={ativos} dataInicial={dialogo.data} onNovoAluno={dialogo.tipo === 'avulsa' ? () => { setDialogo(null); setModalAluno({ avulso: true }) } : undefined} onClose={() => setDialogo(null)}
          bloqueado={(tipo, f) => (tipo === 'remarcar' || tipo === 'editar' ? bloqueia(dialogo.aula.aluno_id, mesDe(f.data)) : (tipo === 'reposicao' || tipo === 'avulsa') ? bloqueia(dialogo.aula?.aluno_id || f.alunoId, mesDe(f.data)) : false)}
        />
      )}
      {menu && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setMenu(null) }}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-title">{alunoPorId.get(menu.aluno_id)?.nome} · {rotuloData(menu.data)}</div>
            <div className="aula-menu">
              <button className="btn btn-ghost" onClick={() => abrirDialogo('editar', menu)}>Editar data, horário, duração ou valor</button>
              {menu.status === 'prevista' && <button className="btn btn-ghost" onClick={() => abrirDialogo('remarcar', menu)}>Remarcar</button>}
              {menu.status === 'prevista' && <button className="btn btn-ghost" onClick={() => abrirDialogo('cancelada', menu)}>Cancelar a aula</button>}
              {menu.status === 'prevista' && <button className="btn btn-ghost" onClick={() => abrirDialogo('nao_realizada', menu)}>Marcar como não realizada</button>}
              {(menu.status === 'cancelada' || menu.status === 'nao_realizada') && !reposicaoAtiva(menu, aulas) && <button className="btn btn-ghost" onClick={() => abrirDialogo('reposicao', menu)}>Criar reposição</button>}
              {menu.status !== 'prevista' && <button className="btn btn-ghost" onClick={() => { const a = menu; setMenu(null); desfazer(a) }}>Voltar para prevista</button>}
              {menu.origem === 'avulsa' && menu.status === 'prevista' && <button className="btn btn-danger" style={{ padding: '10px 16px', fontSize: 13 }} onClick={() => { const a = menu; setMenu(null); excluir(a) }}>Excluir aula avulsa</button>}
              {(menu.historico || []).length > 0 && (
                <details className="aula-hist"><summary>Histórico ({menu.historico.length})</summary>
                  {menu.historico.map((h, i) => (
                    <div key={i}>{new Date(h.em).toLocaleDateString('pt-BR')} · {h.tipo === 'remarcada' ? `remarcada de ${dataBr(h.de)} para ${dataBr(h.para)}${h.duracao_para ? `, duração de ${textoDuracao(h.duracao_de)} para ${textoDuracao(h.duracao_para)}` : ''}${h.motivo ? ` (${h.motivo})` : ''}` : h.tipo === 'editada' ? `editada (${(h.campos || []).join(', ')})` : h.tipo === 'realizada' ? `realizada (${textoDuracao(h.minutos)})` : h.tipo === 'reaberta' ? 'voltou para prevista' : `${STATUS[h.tipo] || h.tipo}${h.quem ? ` por ${h.quem === 'aluno' ? 'aluno/responsável' : 'professora'}` : ''}${h.motivo ? ` (${h.motivo})` : ''}`}</div>
                  ))}
                </details>
              )}
            </div>
            <div className="modal-footer"><button className="btn btn-ghost" onClick={() => setMenu(null)}>Fechar</button></div>
          </div>
        </div>
      )}

      <div className="pag-topo">
        <NavMes mes={mes} onChange={setMes} />
        <div className="aulas-acoes">
          <select value={filtro} onChange={(e) => setFiltro(e.target.value)} aria-label="Filtrar por aluno">
            <option value="">Todos os alunos</option>
            {alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}{a.ativo === false ? ' (inativo)' : ''}</option>)}
          </select>
          {ativos.length > 0 && <button className="btn btn-ghost" onClick={() => setDialogo({ tipo: 'avulsa' })}>+ Aula avulsa</button>}
          {alunos.length > 0 && <button className="btn btn-ghost" onClick={() => setPausasAberto(true)}>Férias / sem aulas</button>}
          {alunos.length > 0 && <button className="btn btn-ghost" onClick={() => setSimuladorAberto(true)}>Simular novo aluno</button>}
          <button className="btn btn-ghost" onClick={() => setConfigAberta(true)} aria-label="Configurações das aulas" title="Configurações das aulas">⚙ Configurar</button>
          <button className="btn btn-primary" onClick={() => setModalAluno({})}>+ Aluno</button>
        </div>
      </div>

      {alunos.length === 0 ? (
        <div className="card"><div className="empty">Nenhum aluno cadastrado ainda.{'\n'}Cadastre o primeiro aluno e a programação semanal: as aulas do mês são criadas sozinhas.</div></div>
      ) : (
        <>
          {visao !== 'relatorio' && (<>
          <div className="kpi-faixa" aria-label={`Resumo de ${mesLabel(mes)}`}>
            <div className="kpi"><div className="kpi-rotulo">Previstas</div><div className="kpi-valor azul">{r.previstas}</div><div className="kpi-sub">{r.previstas ? 'aguardando definição' : 'nenhuma pendente'}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Realizadas</div><div className="kpi-valor verde">{r.realizadas}</div><div className="kpi-sub">{textoDuracao(r.minutosRealizados)} efetivas</div></div>
            <div className="kpi"><div className="kpi-rotulo">Canceladas</div><div className="kpi-valor">{r.canceladas + r.naoRealizadas}</div><div className="kpi-sub">{r.canceladas} cancelada{r.canceladas === 1 ? '' : 's'} · {r.naoRealizadas} não realizada{r.naoRealizadas === 1 ? '' : 's'}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Horas realizadas</div><div className="kpi-valor">{textoDuracao(r.minutosRealizados)}</div><div className="kpi-sub">{r.reposicoes ? `${r.reposicoes} reposição(ões)` : 'no mês'}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Valor previsto</div><div className="kpi-valor ambar">{fmtK(centavosParaReais(r.previsto))}</div><div className="kpi-sub">{r.inicial.qtd ? `inicial ${fmtK(centavosParaReais(r.inicial.valor))}` : 'realizadas + previstas'}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Valor apurado</div><div className="kpi-valor verde">{fmtK(centavosParaReais(r.apurado))}</div><div className="kpi-sub">aulas realizadas</div></div>
            <div className="kpi"><div className="kpi-rotulo">Fechado</div><div className="kpi-valor">{nFechados ? fmtK(centavosParaReais(fechadoValor)) : '—'}</div><div className="kpi-sub">{nFechados}/{valores.length} aluno{valores.length === 1 ? '' : 's'} fechado{nFechados === 1 ? '' : 's'}</div></div>
            <div className="kpi"><div className="kpi-rotulo">Pagamento</div><div className={`kpi-valor ${aReceber > 0 ? 'ambar' : recebidoTotal > 0 ? 'verde' : ''}`}>{nFechados ? fmtK(centavosParaReais(aReceber > 0 ? aReceber : recebidoTotal)) : '—'}</div><div className="kpi-sub">{rotuloPag}{aReceber > 0 && recebidoTotal > 0 ? ' · a receber' : aReceber > 0 ? ' · a receber' : ''}</div></div>
          </div>
          {frasePrevistoRealizado(r) && <div className="aulas-frase">{frasePrevistoRealizado(r)}</div>}

          {!filtro && <MetaAulas mes={mes} sit={sitMeta} definirConfig={definirConfig} />}
          {r.inicial.qtd > 0 && (
            <Secao titulo="Previsto × realizado" info="planejamento do início do mês" aberto={compAberto} onToggle={() => setCompAberto((x) => !x)}>
              <div className="aulas-comp">
                <div className="aulas-comp-l cab"><span /><span>Início do mês</span><span>Agora</span><span>Apurado</span></div>
                <div className="aulas-comp-l"><span>Aulas</span><b>{r.inicial.qtd}</b><b>{r.realizadas + r.previstas}</b><b>{r.realizadas}</b></div>
                <div className="aulas-comp-l"><span>Horas</span><b>{textoDuracao(r.inicial.minutos)}</b><b>{textoDuracao(r.minutosRealizados + doMes.filter((a) => a.status === 'prevista').reduce((t, a) => t + a.duracao_min, 0))}</b><b>{textoDuracao(r.minutosRealizados)}</b></div>
                <div className="aulas-comp-l"><span>Valor</span><b className="mono">{fmtK(centavosParaReais(r.inicial.valor))}</b><b className="mono">{fmtK(centavosParaReais(r.previsto))}</b><b className="mono">{fmtK(centavosParaReais(r.apurado))}</b></div>
                <div className="cad-sub" style={{ marginTop: 6 }}>{r.canceladas + r.naoRealizadas} sem cobrança · {r.reposicoes} reposição(ões) · {r.avulsas} avulsa(s) · {r.remarcacoes} remarcação(ões)</div>
              </div>
            </Secao>
          )}
          {!filtro && (
            <Secao titulo="Alunos" info={`${ativos.length} ativo${ativos.length === 1 ? '' : 's'}`} aberto onToggle={() => {}}>
              <div className="aulas-alunos">
                {alunos.map((al) => {
                  const rr = resumoMes(aulasDoMes(aulas, mes, al.id), aulasPrevInicial.filter((p) => p.aluno_id === al.id && p.mes === mes))
                  return (
                    <article key={al.id} className={`aulas-aluno ${al.ativo === false ? 'inativo' : ''}`}>
                      <div className="aulas-aluno-topo">
                        <div style={{ minWidth: 0 }}>
                          <div className="cad-tile-nome">{al.nome}{al.ativo === false && <span className="badge badge-gray" style={{ marginLeft: 6 }}>inativo</span>}{!aulasProg.some((p) => p.aluno_id === al.id && !p.vigencia_fim) && <span className="badge badge-gray" style={{ marginLeft: 6 }} title="Sem dia fixo: as aulas são registradas como avulsas">avulso</span>}</div>
                          <div className="cad-sub">{al.responsavel} · {fmt(centavosParaReais(al.valor_hora_centavos))}/h{al.serie ? ` · ${nomeSerieCurto(al.serie)}` : ''}</div>
                          {(() => {
                            const pausa = aulasPausas.find((x) => x.aluno_id === al.id && x.inicio <= hoje && x.fim >= hoje)
                            return (
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                                {pausa && <span className="badge badge-amber">pausado · volta {dataBrCurta(somarUmDia(pausa.fim))}</span>}
                                {al.ativo !== false && al.saida_prevista && <span className="badge badge-amber">sai em {dataBrCurta(al.saida_prevista)}</span>}
                                {al.ativo === false && al.motivo_encerramento && <span className="badge badge-gray">{al.motivo_encerramento}</span>}
                              </div>
                            )
                          })()}
                        </div>
                        <button className="btn btn-ghost btn-sm" onClick={() => setModalAluno({ aluno: al })}>Editar</button>
                      </div>
                      <div className="aulas-aluno-nums">
                        <span><b>{rr.realizadas}</b>/{rr.realizadas + rr.previstas} aulas</span>
                        <span>{textoDuracao(rr.minutosRealizados)} realizadas</span>
                        <span>previsto <b className="mono">{fmtK(centavosParaReais(rr.previsto))}</b></span>
                        <span>apurado <b className="mono">{fmtK(centavosParaReais(rr.apurado))}</b></span>
                      </div>
                      {(() => {
                        const v = valorAlunoMes(aulas, aulasFech, al.id, mes)
                        const f = v.fechamento
                        const txt = !f ? 'Mês aberto' : f.status === 'sem_cobranca' ? 'Fechado sem cobrança' : f.status === 'reaberto' ? 'Fechamento reaberto' : f.recebido && v.aReceber <= 0 ? 'Fechado · recebido' : f.recebido ? 'Fechado · recebido em parte' : 'Fechado · a receber'
                        return (
                          <div className="aulas-aluno-fech">
                            <span className={`badge ${f && f.status === 'fechado' ? (f.recebido && v.aReceber <= 0 ? 'badge-green' : 'badge-amber') : f?.status === 'reaberto' ? 'badge-amber' : 'badge-gray'}`}>{txt}</span>
                            <button className="btn btn-ghost btn-sm" onClick={() => setFechando(al)}>{f && fechadoStatus(f) ? 'Ver fechamento' : 'Fechar mês'}</button>
                          </div>
                        )
                      })()}
                      <button className="link-btn" onClick={() => setFiltro(al.id)}>Ver as aulas de {al.nome} →</button>
                    </article>
                  )
                })}
              </div>
            </Secao>
          )}
          {filtro && (
            <div className="grupos-barra"><span>{alunoFiltrado?.nome} · {alunoFiltrado?.responsavel}</span><span>{alunoFiltrado && <button className="link-btn" onClick={() => setFechando(alunoFiltrado)}>{achaFechamento(aulasFech, alunoFiltrado.id, mes) && fechadoStatus(achaFechamento(aulasFech, alunoFiltrado.id, mes)) ? 'Ver fechamento' : 'Fechar mês'}</button>} · <button className="link-btn" onClick={() => setModalAluno({ aluno: alunoFiltrado })}>Editar aluno</button> · <button className="link-btn" onClick={() => setFiltro('')}>Ver todos</button></span></div>
          )}
          </>)}

          {(doMes.length > 0 || visao === 'relatorio') && (
            <div className="aulas-barra">
              <div className="aulas-visao" role="group" aria-label="Visão">
                <button className={visao === 'lista' ? 'ativo' : ''} onClick={() => setVisao('lista')}>Lista</button>
                <button className={visao === 'calendario' ? 'ativo' : ''} onClick={() => setVisao('calendario')}>Calendário</button>
                <button className={visao === 'relatorio' ? 'ativo' : ''} onClick={() => setVisao('relatorio')}>Relatório</button>
              </div>
              {visao !== 'relatorio' && selecionaveis.length > 0 && (modoSel
                ? <div className="aulas-sel">
                    <button className="link-btn" onClick={() => setSel(new Set(selecionaveis.filter((a) => a.data <= hoje).map((a) => a.id)))}>Já passaram</button>
                    <button className="link-btn" onClick={() => setSel(new Set(selecionaveis.map((a) => a.id)))}>Todas</button>
                    <button className="link-btn" onClick={sairSel}>Cancelar</button>
                    <button className="btn btn-primary btn-sm" disabled={!selAulas.length} onClick={() => setLote(true)}>Marcar {selAulas.length} como realizada{selAulas.length === 1 ? '' : 's'}</button>
                  </div>
                : <button className="btn btn-ghost btn-sm" onClick={() => { setModoSel(true); setVisao('lista') }}>Selecionar várias</button>)}
            </div>
          )}

          {visao === 'relatorio' && <Relatorio store={store} alunos={alunos} aulas={aulas} aulasFech={aulasFech} alunoId={filtro} metaCentavos={metaCent} />}

          {visao === 'calendario' && doMes.length > 0 && (
            <>
              <Calendario mes={mes} aulas={doMes} pausas={aulasPausas.filter((x) => !filtro || !x.aluno_id || x.aluno_id === filtro)} alunoPorId={alunoPorId} hoje={hoje} dia={dia} onDia={setDia} mostrarAluno={!filtro} />
              <div className="aulas-lista">
                {dia ? (doMes.filter((a) => a.data === dia).length ? doMes.filter((a) => a.data === dia).map((a) => cardAula(a)) : <div className="card"><div className="empty" style={{ padding: 14 }}>Sem aulas em {rotuloData(dia)}.{ativos.length > 0 && <> <button className="link-btn" onClick={() => setDialogo({ tipo: 'avulsa', data: dia })}>Criar aula avulsa neste dia</button></>}</div></div>) : <div className="cad-sub" style={{ textAlign: 'center' }}>Toque em um dia para ver as aulas.</div>}
              </div>
            </>
          )}

          <div className="aulas-lista">
            {visao === 'relatorio' || (visao === 'calendario' && doMes.length > 0) ? null : doMes.length === 0 ? (
              <div className="card"><div className="empty">Nenhuma aula em {mesLabel(mes)}{filtro ? ' para este aluno' : ''}.{'\n'}As aulas aparecem sozinhas pela programação semanal; use "+ Aula avulsa" para uma aula fora dela.</div></div>
            ) : visao === 'calendario' ? null : doMes.map((a) => cardAula(a))}
          </div>
        </>
      )}
    </div>
  )
}
