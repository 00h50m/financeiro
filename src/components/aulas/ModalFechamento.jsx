import { useEffect, useMemo, useState } from 'react'
import { fmt, hojeSP, mesLabel } from '../../lib/utils'
import { aulasDoMes, centavosParaReais, reaisParaCentavos, textoDuracao } from '../../lib/aulas'
import { achaFechamento, diferencaRecebimento, fechadoStatus, linkWhatsApp, mensagemFechamento, montarFechamento, pendenciasDoMes } from '../../lib/aulasFechamento'

const dataBr = (d) => d.split('-').reverse().join('/')
const reais = (c) => fmt(centavosParaReais(c))

// Fechamento do mês de um aluno: confere pendências, fecha (ou fecha sem cobrança), gera a mensagem, registra o recebimento e reabre.
export default function ModalFechamento({ store, aluno, mes, onClose }) {
  const { aulas, aulasFech, fecharAluno, reabrirAluno, registrarRecebimento, desfazerRecebimento, historicoFechamento } = store
  const fech = achaFechamento(aulasFech, aluno.id, mes)
  const fechado = fechadoStatus(fech)
  const pend = pendenciasDoMes(aulas, aluno.id, mes)
  const doMes = aulasDoMes(aulas, mes, aluno.id)
  const foto = useMemo(() => (fechado ? { itens: fech.itens || [], valor_centavos: fech.valor_centavos } : montarFechamento(aulas, aluno.id, mes)), [fechado, fech, aulas, aluno.id, mes])
  const [resumo, setResumo] = useState(false)
  const gerada = useMemo(() => mensagemFechamento(aluno, mes, foto.itens, foto.valor_centavos, { resumo, aulasMes: doMes }), [aluno, mes, foto, resumo, doMes])
  const [msg, setMsg] = useState(fech?.mensagem || gerada)
  const [editada, setEditada] = useState(!!fech?.mensagem)
  useEffect(() => { if (!editada) setMsg(gerada) }, [gerada, editada])
  const [copiado, setCopiado] = useState(false)
  const [recData, setRecData] = useState(hojeSP())
  const [recValor, setRecValor] = useState(String(centavosParaReais(fech?.valor_centavos ?? foto.valor_centavos)).replace('.', ','))
  const [motivo, setMotivo] = useState('')
  const [confirmaDif, setConfirmaDif] = useState(false)
  const [hist, setHist] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  // Reabriu um mês já recebido: ao fechar de novo, a diferença precisa ser conferida.
  const dif = fech && fech.status === 'reaberto' ? diferencaRecebimento(fech, foto.valor_centavos) : 0
  const exigeConferir = fech?.status === 'reaberto' && fech.recebido && dif !== 0

  async function copiar() {
    try { await navigator.clipboard.writeText(msg); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { window.prompt('Copie a mensagem:', msg) }
  }
  async function agir(fn) { setOcupado(true); await fn(); setOcupado(false) }
  async function verHist() { setHist(await historicoFechamento(aluno.id, mes)) }

  const recebido = fech?.recebido
  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-title">Fechamento · {aluno.nome} · {mesLabel(mes)}</div>

        {fech && (
          <div className={`alert ${fech.status === 'reaberto' ? 'alert-amber' : 'alert-green'}`} style={{ marginBottom: 12 }}>
            {fech.status === 'fechado' && <>Mês fechado em {new Date(fech.fechado_em).toLocaleDateString('pt-BR')}: <b>{reais(fech.valor_centavos)}</b> ({fech.qtd_aulas} {fech.qtd_aulas === 1 ? 'aula' : 'aulas'}, {textoDuracao(fech.minutos)}).</>}
            {fech.status === 'sem_cobranca' && <>Mês fechado <b>sem cobrança</b>.</>}
            {fech.status === 'reaberto' && <>Fechamento reaberto (revisão {fech.revisao}). Ajuste as aulas e feche de novo.{fech.recebido && <> Já havia {reais(fech.recebido_centavos ?? fech.valor_centavos)} recebidos.</>}</>}
          </div>
        )}

        {!fechado && pend.length > 0 && (
          <div className="alert alert-amber" style={{ marginBottom: 12 }}>
            <b>Falta resolver {pend.length} {pend.length === 1 ? 'aula' : 'aulas'}</b> antes de fechar: marque como realizada, cancelada ou não realizada.
            <div className="cad-sub">{pend.map((a) => dataBr(a.data).slice(0, 5)).join(', ')}</div>
          </div>
        )}

        <div className="cad-sub" style={{ marginBottom: 6 }}>{fechado ? 'Aulas cobradas' : 'Aulas realizadas (o que será cobrado)'}:</div>
        {foto.itens.length === 0 ? <div className="empty" style={{ padding: 12 }}>Nenhuma aula realizada no mês.</div> : (
          <div className="fech-itens">
            {foto.itens.map((i) => <div key={i.aula_id || i.data + i.horario} className="fech-item"><span>{dataBr(i.data).slice(0, 5)}{i.horario ? ` · ${i.horario}` : ''} · {textoDuracao(i.minutos)}</span><b className="mono">{reais(i.valor_centavos)}</b></div>)}
            <div className="fech-item total"><span>Total</span><b className="mono">{reais(foto.valor_centavos)}</b></div>
          </div>
        )}

        <div className="form-group" style={{ marginTop: 14 }}>
          <label>Mensagem para o responsável <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(só aulas realizadas; você pode editar; nada é enviado sozinho)</span></label>
          <textarea rows={Math.min(14, msg.split('\n').length + 1)} value={msg} onChange={(e) => { setMsg(e.target.value); setEditada(true) }} />
          <label className="check-linha"><input type="checkbox" checked={resumo} onChange={(e) => { setResumo(e.target.checked); setEditada(false) }} /> Incluir resumo de cancelamentos e reposições</label>
          <div className="modal-footer" style={{ justifyContent: 'flex-start', marginTop: 6 }}>
            <a className="btn btn-primary btn-sm" href={linkWhatsApp(aluno.telefone, msg)} target="_blank" rel="noopener noreferrer" title={aluno.telefone ? 'Abre a conversa com o responsável, com a mensagem pronta' : 'Sem telefone cadastrado: o WhatsApp pede para escolher o contato'}>Abrir no WhatsApp</a>
            <button className="btn btn-ghost btn-sm" onClick={copiar}>{copiado ? 'Copiado ✓' : 'Copiar mensagem'}</button>
            {editada && <button className="btn btn-ghost btn-sm" onClick={() => setEditada(false)}>Refazer a mensagem</button>}
          </div>
          {!aluno.telefone && <div className="cad-sub">Cadastre o WhatsApp do responsável em Editar aluno para abrir direto na conversa.</div>}
        </div>

        {exigeConferir && (
          <div className="alert alert-amber" style={{ margin: '10px 0' }}>
            O valor mudou em relação ao que já foi recebido: <b>{dif > 0 ? `faltam ${reais(dif)} a receber` : `${reais(-dif)} recebidos a mais (a devolver ou abater no próximo mês)`}</b>.
            <label className="check-linha"><input type="checkbox" checked={confirmaDif} onChange={(e) => setConfirmaDif(e.target.checked)} /> Conferi a diferença</label>
          </div>
        )}

        {!fechado ? (
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={onClose}>Fechar janela</button>
            <button className="btn btn-ghost" disabled={ocupado || pend.length > 0 || (exigeConferir && !confirmaDif)} title={pend.length ? 'Resolva as aulas previstas' : ''} onClick={() => { if (window.confirm('Fechar o mês sem cobrar nada deste aluno?')) agir(async () => { if (await fecharAluno(aluno.id, mes, { semCobranca: true, mensagem: null })) onClose() }) }}>Fechar sem cobrança</button>
            <button className="btn btn-primary" disabled={ocupado || pend.length > 0 || (exigeConferir && !confirmaDif)} onClick={() => agir(async () => { if (await fecharAluno(aluno.id, mes, { mensagem: msg })) onClose() })}>Fechar o mês</button>
          </div>
        ) : (
          <>
            {fech.status === 'fechado' && (
              <div className="form-group">
                <label>Recebimento</label>
                {recebido ? (
                  <div className="cad-sub">Recebido em {dataBr(fech.recebido_em)}: <b>{reais(fech.recebido_centavos ?? fech.valor_centavos)}</b> · <button className="link-btn" disabled={ocupado} onClick={() => agir(() => desfazerRecebimento(aluno.id, mes))}>desfazer</button></div>
                ) : (
                  <div className="form-row cols2">
                    <input type="date" value={recData} onChange={(e) => setRecData(e.target.value)} aria-label="Data do recebimento" />
                    <input inputMode="decimal" value={recValor} onChange={(e) => setRecValor(e.target.value)} aria-label="Valor recebido" />
                    <button className="btn btn-primary btn-sm" disabled={ocupado || reaisParaCentavos(recValor) == null} onClick={() => agir(() => registrarRecebimento(aluno.id, mes, { data: recData, valorCentavos: reaisParaCentavos(recValor) }))}>Marcar como recebido</button>
                  </div>
                )}
                <div className="cad-sub">O recebimento não cria outra renda: só tira o valor de "a receber".</div>
              </div>
            )}
            <div className="form-group">
              <label>Reabrir o fechamento</label>
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ex.: esqueci uma aula)" />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={verHist}>Histórico</button>
              <button className="btn btn-ghost" onClick={onClose}>Fechar janela</button>
              <button className="btn btn-danger" style={{ padding: '10px 16px', fontSize: 13 }} disabled={ocupado || motivo.trim().length < 3} onClick={() => agir(async () => { if (await reabrirAluno(aluno.id, mes, motivo.trim())) onClose() })}>Reabrir</button>
            </div>
          </>
        )}
        {hist && (
          <div className="aula-hist" style={{ marginTop: 10 }}>
            {hist.length === 0 ? 'Sem histórico.' : hist.map((h) => <div key={h.id}>{new Date(h.quando).toLocaleString('pt-BR')} · rev. {h.revisao} · {h.acao}{h.valor_centavos != null ? ` · ${reais(h.valor_centavos)}` : ''}{h.motivo ? ` · ${h.motivo}` : ''}{h.usuario ? ` · ${h.usuario}` : ''}</div>)}
          </div>
        )}
      </div>
    </div>
  )
}
