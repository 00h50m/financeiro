import { useMemo, useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import {
  DIAS, afetadasPorMudanca, aulasParaNovoValor, centavosParaReais, diferencaProgramacao, reaisParaCentavos, textoDuracao, DIAS_CURTOS,
} from '../../lib/aulas'
import { Pilulas } from '../NavMes'
import CampoHorario from './CampoHorario'
import SeletorDuracao from './SeletorDuracao'
import { SERIES, saidaSugerida, riscoDeSaida } from '../../lib/alunosCiclo'

const MOTIVOS = ['Terminou o ciclo (formou/vestibular)', 'Parou por conta própria', 'Preço', 'Mudou de cidade', 'Horário não encaixa', 'Outro']

const linhaVazia = () => ({ dia_semana: 2, horario: '', duracao_min: 60 })
const dataBr = (d) => d.split('-').reverse().join('/')

// Cadastro enxuto do aluno + programação semanal. Ao editar, mudanças de programação e de valor/hora valem a partir de uma data,
// com a lista do que será afetado antes de aplicar.
export default function ModalAluno({ store, aluno, onClose, onPausar, inicialAvulso = false }) {
  const { criarAluno, atualizarAluno, mudarProgramacao, aulas, aulasProg } = store
  const edicao = !!aluno
  const hoje = hojeSP()
  const atuais = useMemo(() => (aluno ? aulasProg.filter((p) => p.aluno_id === aluno.id && !p.vigencia_fim) : []), [aluno, aulasProg])
  const [f, setF] = useState(() => ({
    nome: aluno?.nome || '', responsavel: aluno?.responsavel || '', valor: aluno ? String(centavosParaReais(aluno.valor_hora_centavos)).replace('.', ',') : '',
    inicio: aluno?.inicio || hoje, telefone: aluno?.telefone || '', fim: aluno?.fim || '', observacoes: aluno?.observacoes || '',
    serie: aluno?.serie || '', saida: aluno?.saida_prevista || '',
  }))
  const [encerrando, setEncerrando] = useState(null) // { data, motivo, outro }
  const [linhas, setLinhas] = useState(() => (atuais.length ? atuais.map((p) => ({ id: p.id, dia_semana: p.dia_semana, horario: p.horario || '', duracao_min: p.duracao_min })) : [linhaVazia()]))
  const [tipo, setTipo] = useState(() => (inicialAvulso || (aluno && atuais.length === 0) ? 'avulso' : 'fixo')) // fixo = tem dia da semana · avulso = aulas quando combinar
  const [desde, setDesde] = useState(hoje)
  const [detalhes, setDetalhes] = useState(!!(aluno?.fim || aluno?.observacoes))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const mudarSerie = (e) => {
    const serie = e.target.value
    setF((x) => ({ ...x, serie, saida: !x.saida || x.saida === saidaSugerida(x.serie, hoje) ? saidaSugerida(serie, hoje) : x.saida }))
  }
  const setLinha = (i, patch) => setLinhas((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const valorCent = reaisParaCentavos(f.valor)
  const limpas = tipo === 'avulso' ? [] : linhas.map((l) => ({ dia_semana: Number(l.dia_semana), horario: l.horario || null, duracao_min: Number(l.duracao_min) }))
  const valido = f.nome.trim() && valorCent != null && valorCent >= 0 && f.inicio && (tipo === 'avulso' || limpas.length > 0)

  // Impacto de mudanças (só em edição)
  const dif = edicao ? diferencaProgramacao(atuais, limpas) : { sai: [], entra: [], fica: [] }
  const mudouProg = dif.sai.length > 0 || dif.entra.length > 0
  const mudouValor = edicao && valorCent != null && valorCent !== Number(aluno.valor_hora_centavos)
  const impacto = useMemo(() => {
    if (!edicao || !mudouProg) return { removiveis: [], preservadas: [] }
    return afetadasPorMudanca(aulas, aluno.id, dif.sai.map((l) => l.id), desde)
  }, [edicao, mudouProg, aulas, aluno, dif.sai, desde])
  const aulasValor = useMemo(() => (mudouValor ? aulasParaNovoValor(aulas, aluno.id, desde) : []), [mudouValor, aulas, aluno, desde])

  async function salvar() {
    if (!valido) return
    setSalvando(true)
    const base = {
      nome: f.nome.trim(), responsavel: f.responsavel.trim(), telefone: f.telefone.trim() || null, valor_hora_centavos: valorCent,
      inicio: f.inicio, fim: f.fim || null, observacoes: f.observacoes.trim() || null,
      serie: f.serie || null, saida_prevista: f.saida || null,
    }
    let ok
    if (!edicao) {
      ok = !!(await criarAluno({ ...base, ativo: true }, limpas.map((l) => ({ ...l, vigencia_inicio: f.inicio }))))
    } else {
      ok = await atualizarAluno(aluno.id, { ...base, valor_hora_centavos: aluno.valor_hora_centavos }) // o valor novo entra pela regra "a partir de"
      if (ok && (mudouProg || mudouValor)) {
        ok = await mudarProgramacao({
          alunoId: aluno.id, desde, encerrarIds: dif.sai.map((l) => l.id), novas: dif.entra.map((l) => ({ ...l })),
          apagarAulaIds: impacto.removiveis.map((a) => a.id), novoValorHora: mudouValor ? valorCent : null, aulasNovoValorIds: aulasValor.map((a) => a.id),
        })
      }
    }
    setSalvando(false)
    if (ok) onClose()
  }

  async function reativar() {
    if (!window.confirm(`Reativar ${aluno.nome}? As aulas voltam a ser previstas a partir de hoje.`)) return
    const ok = await atualizarAluno(aluno.id, { ativo: true, inativado_em: null, motivo_encerramento: null })
    if (ok) onClose()
  }
  async function encerrar() {
    const motivo = encerrando.motivo === 'Outro' ? encerrando.outro.trim() || 'Outro' : encerrando.motivo
    const ok = await atualizarAluno(aluno.id, { ativo: false, inativado_em: encerrando.data, motivo_encerramento: motivo })
    if (ok) onClose()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 620 }}>
        <div className="modal-title">{edicao ? `Editar ${aluno.nome}` : 'Novo aluno'}</div>

        <div className="form-group" style={{ marginBottom: 14 }}>
          <label>Como são as aulas?</label>
          <Pilulas rotulo="Tipo de aluno" valor={tipo} onChange={setTipo} opcoes={[['fixo', 'Fixo (dia da semana)'], ['avulso', 'Avulso (quando combinar)']]} />
          {tipo === 'avulso' && <div className="cad-sub" style={{ margin: '6px 0 14px' }}>Nenhuma aula é criada sozinha. Quando der uma aula, use "+ Aula avulsa" e escolha este aluno; o valor/hora vale para todas.</div>}
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Nome do aluno</label><input value={f.nome} onChange={set('nome')} autoFocus placeholder="Ex.: Ana" /></div>
          <div className="form-group"><label>Responsável financeiro <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input value={f.responsavel} onChange={set('responsavel')} placeholder="Ex.: Maria" /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Valor por hora (R$)</label><input inputMode="decimal" value={f.valor} onChange={set('valor')} placeholder="Ex.: 80" /></div>
          <div className="form-group"><label>Início das aulas</label><input type="date" value={f.inicio} onChange={set('inicio')} /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Série <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label>
            <select value={f.serie} onChange={mudarSerie}><option value="">Não informada</option>{SERIES.map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select>
          </div>
          <div className="form-group"><label>Saída prevista <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(opcional)</span></label><input type="date" value={f.saida} onChange={set('saida')} /></div>
        </div>
        {riscoDeSaida(f.serie) && <div className="cad-sub" style={{ margin: '-6px 0 12px' }}>Quem está nessa série costuma encerrar as aulas no fim do ano: o app avisa quando a saída se aproximar.</div>}
        <div className="form-row">
          <div className="form-group"><label>WhatsApp do responsável (com DDD)</label><input inputMode="tel" value={f.telefone} onChange={set('telefone')} placeholder="(11) 91234-5678" /></div>
        </div>

        {tipo === 'fixo' && <div className="section-label" style={{ marginTop: 8 }}>programação semanal</div>}
        {tipo === 'fixo' && <div className="aluno-prog">
          {linhas.map((l, i) => (
            <div key={i} className="aluno-prog-linha">
              <label className="prog-campo prog-dia">Dia
                <select aria-label="Dia da semana" value={l.dia_semana} onChange={(e) => setLinha(i, { dia_semana: Number(e.target.value) })}>
                  {DIAS.map((d, n) => <option key={n} value={n}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                </select>
              </label>
              <label className="prog-campo">Horário<CampoHorario valor={l.horario} onChange={(h) => setLinha(i, { horario: h })} /></label>
              <label className="prog-campo">Duração<SeletorDuracao valor={l.duracao_min} onChange={(m) => setLinha(i, { duracao_min: m })} /></label>
              {linhas.length > 1 && <button type="button" className="link-btn prog-remover" onClick={() => setLinhas((x) => x.filter((_, j) => j !== i))}>Remover este dia</button>}
            </div>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => setLinhas((l) => [...l, linhaVazia()])}>+ Adicionar dia ou horário</button>
          <div className="cad-sub">O mesmo dia pode ter mais de uma aula, em horários diferentes. As aulas do mês são geradas sozinhas a partir daqui.</div>
        </div>}

        <button className="link-btn" style={{ margin: '10px 0' }} onClick={() => setDetalhes((v) => !v)}>{detalhes ? 'Menos detalhes' : 'Mais detalhes (término, observações)'}</button>
        {detalhes && (
          <>
            <div className="form-row cols2">
              <div className="form-group"><label>Término das aulas</label><input type="date" value={f.fim} onChange={set('fim')} /></div>
              <div className="form-group"><label>Observações</label><input value={f.observacoes} onChange={set('observacoes')} placeholder="Opcional" /></div>
            </div>
          </>
        )}

        {edicao && (mudouProg || mudouValor) && (
          <div className="alert alert-amber" style={{ marginTop: 10 }}>
            <div className="form-row" style={{ marginBottom: 8 }}>
              <div className="form-group"><label>As mudanças valem a partir de</label><input type="date" value={desde} onChange={(e) => setDesde(e.target.value || hoje)} /></div>
            </div>
            {mudouProg && (
              <div style={{ fontSize: 12, lineHeight: 1.6 }}>
                {dif.sai.length > 0 && <div>Deixam de valer: {dif.sai.map((l) => `${DIAS_CURTOS[l.dia_semana]} ${textoDuracao(l.duracao_min)}`).join(', ')}.</div>}
                {dif.entra.length > 0 && <div>Passam a valer: {dif.entra.map((l) => `${DIAS_CURTOS[l.dia_semana]}${l.horario ? ` ${l.horario}` : ''} ${textoDuracao(l.duracao_min)}`).join(', ')}.</div>}
                <div><b>{impacto.removiveis.length}</b> aula(s) prevista(s) intacta(s) a partir de {dataBr(desde)} serão recriadas pela nova programação.</div>
                {impacto.preservadas.length > 0 && <div><b>{impacto.preservadas.length}</b> aula(s) já editada(s) ou remarcada(s) ficam como estão: {impacto.preservadas.map((a) => dataBr(a.data)).join(', ')}.</div>}
                <div>Aulas realizadas, canceladas e fechamentos não são alterados.</div>
              </div>
            )}
            {mudouValor && (
              <div style={{ fontSize: 12, lineHeight: 1.6, marginTop: 6 }}>
                Novo valor por hora: <b>{fmt(centavosParaReais(valorCent))}</b>. Vale para {aulasValor.length} aula(s) prevista(s) a partir de {dataBr(desde)} (as com valor ajustado à mão e as realizadas não mudam).
              </div>
            )}
          </div>
        )}

        {encerrando && (
          <div className="alert alert-amber" style={{ marginTop: 10 }}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>Encerrar {aluno.nome}</div>
            <div className="form-row cols2">
              <div className="form-group"><label>Última aula em</label><input type="date" value={encerrando.data} onChange={(e) => setEncerrando((x) => ({ ...x, data: e.target.value || hoje }))} /></div>
              <div className="form-group"><label>Motivo</label>
                <select value={encerrando.motivo} onChange={(e) => setEncerrando((x) => ({ ...x, motivo: e.target.value }))}>{MOTIVOS.map((m) => <option key={m}>{m}</option>)}</select>
              </div>
            </div>
            {encerrando.motivo === 'Outro' && <div className="form-group"><label>Qual?</label><input value={encerrando.outro} onChange={(e) => setEncerrando((x) => ({ ...x, outro: e.target.value }))} /></div>}
            <div className="cad-sub">Nenhuma aula nova é prevista depois dessa data. O histórico, as aulas registradas e os fechamentos continuam guardados, e dá para reativar depois.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={encerrar}>Confirmar encerramento</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEncerrando(null)}>Voltar</button>
            </div>
          </div>
        )}
        <div className="modal-footer">
          {edicao && aluno.ativo === false && <button className="btn btn-ghost" style={{ marginRight: 'auto' }} onClick={reativar}>Reativar aluno</button>}
          {edicao && aluno.ativo !== false && !encerrando && (
            <span style={{ marginRight: 'auto', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {onPausar && <button className="btn btn-ghost" onClick={() => onPausar(aluno)}>Pausar</button>}
              <button className="btn btn-ghost" onClick={() => setEncerrando({ data: hoje, motivo: MOTIVOS[0], outro: '' })}>Encerrar aluno</button>
            </span>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={!valido || salvando}>{salvando ? 'Salvando...' : edicao && (mudouProg || mudouValor) ? 'Aplicar e salvar' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}
