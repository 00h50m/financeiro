import { useState } from 'react'
import { hojeSP } from '../../lib/utils'
import { patchEncerrar, previstasNaPausa } from '../../lib/aulas'

const dataBr = (d) => d.split('-').reverse().join('/')

// Períodos sem aula (férias, feriados): as aulas desse período deixam de ser geradas e as já previstas são canceladas, sem cobrança.
export default function ModalPausas({ store, alunos, onClose }) {
  const { aulasPausas, aulasPausasOk, aulas, criarPausa, removerPausa } = store
  const hoje = hojeSP()
  const [f, setF] = useState({ inicio: hoje, fim: hoje, motivo: '', alunoId: '' })
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const nome = (id) => alunos.find((a) => a.id === id)?.nome || 'aluno'

  async function adicionar() {
    if (!f.inicio || !f.fim || f.fim < f.inicio) { window.alert('Confira as datas: o fim não pode ser antes do início.'); return }
    const pausa = { aluno_id: f.alunoId || null, inicio: f.inicio, fim: f.fim, motivo: f.motivo.trim() || null }
    const afetadas = previstasNaPausa(aulas, pausa)
    const texto = afetadas.length
      ? `${afetadas.length} ${afetadas.length === 1 ? 'aula prevista cai' : 'aulas previstas caem'} nesse período e ${afetadas.length === 1 ? 'será cancelada' : 'serão canceladas'} (sem cobrança, por você). Continuar?`
      : 'Nenhuma aula prevista cai nesse período. Salvar mesmo assim?'
    if (!window.confirm(texto)) return
    setSalvando(true)
    const agora = new Date().toISOString()
    const ok = await criarPausa(pausa, afetadas.map((a) => ({ id: a.id, patch: patchEncerrar(a, 'cancelada', { quem: 'professora', motivo: pausa.motivo || 'Sem aulas no período' }, agora) })))
    setSalvando(false)
    if (ok) setF({ inicio: hoje, fim: hoje, motivo: '', alunoId: '' })
  }
  async function remover(p) {
    if (!window.confirm('Remover este período? As aulas já canceladas por ele continuam canceladas (você pode voltá-las para "prevista" uma a uma); as futuras ainda não criadas voltam a ser geradas.')) return
    await removerPausa(p.id)
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">Férias e dias sem aula</div>
        {!aulasPausasOk ? (
          <div className="alert alert-amber"><strong>Falta criar a tabela de períodos sem aula.</strong> Rode o arquivo <code>inbox/24_aulas_pausas.sql</code> no SQL Editor do Supabase e recarregue a página.</div>
        ) : (
          <>
            {aulasPausas.length > 0 && (
              <div className="fech-itens" style={{ marginBottom: 12 }}>
                {aulasPausas.map((p) => (
                  <div key={p.id} className="fech-item">
                    <span>{dataBr(p.inicio)}{p.fim !== p.inicio ? ` a ${dataBr(p.fim)}` : ''} · {p.aluno_id ? nome(p.aluno_id) : 'todos os alunos'}{p.motivo ? ` · ${p.motivo}` : ''}</span>
                    <button className="link-btn" onClick={() => remover(p)}>remover</button>
                  </div>
                ))}
              </div>
            )}
            <div className="form-row cols2">
              <div className="form-group"><label>De</label><input type="date" value={f.inicio} onChange={(e) => setF((x) => ({ ...x, inicio: e.target.value, fim: x.fim < e.target.value ? e.target.value : x.fim }))} /></div>
              <div className="form-group"><label>Até</label><input type="date" value={f.fim} min={f.inicio} onChange={set('fim')} /></div>
            </div>
            <div className="form-group"><label>Motivo (opcional)</label><input value={f.motivo} onChange={set('motivo')} placeholder="Férias de julho, feriado…" /></div>
            <div className="form-group">
              <label>Vale para</label>
              <select value={f.alunoId} onChange={set('alunoId')}>
                <option value="">Todos os alunos</option>
                {alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </div>
          </>
        )}
        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
          {aulasPausasOk && <button className="btn btn-primary" disabled={salvando} onClick={adicionar}>Adicionar período</button>}
        </div>
      </div>
    </div>
  )
}
