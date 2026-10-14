import { useState } from 'react'
import { fmt, hojeSP } from '../../lib/utils'
import {
  DIAS_CURTOS, centavosParaReais, diaDaSemana, novaAvulsa, novaReposicao, patchEditar, patchEncerrar, patchRealizar, patchRemarcar, reaisParaCentavos, textoDuracao,
  valorAula,
} from '../../lib/aulas'
import CampoHorario from './CampoHorario'
import SeletorDuracao from './SeletorDuracao'

const dataBr = (d) => d.split('-').reverse().join('/')
export const rotuloData = (d) => `${DIAS_CURTOS[diaDaSemana(d)]} ${dataBr(d).slice(0, 5)}`

// Um único diálogo para as ações de uma aula: editar, remarcar, cancelar / não realizada, reposição e aula avulsa.
export default function DialogosAula({ store, tipo, aula, aluno, alunos, onClose, bloqueado, dataInicial, onNovoAluno }) {
  const { atualizarAula, inserirAula } = store
  const agoraISO = () => new Date().toISOString()
  const [f, setF] = useState(() => ({
    alunoId: aluno?.id || alunos?.[0]?.id || '',
    data: tipo === 'reposicao' || tipo === 'avulsa' ? dataInicial || hojeSP() : aula?.data || hojeSP(),
    horario: aula?.horario || '',
    duracao: aula?.duracao_min || 60,
    duracaoReal: aula?.duracao_real_min || aula?.duracao_min || 60,
    valorHora: aula ? String(centavosParaReais(aula.valor_hora_centavos)).replace('.', ',') : '',
    realizada: false,
    observacao: aula?.observacao || '',
    motivo: '',
    quem: 'aluno',
  }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const valorCent = reaisParaCentavos(f.valorHora)

  const titulos = { editar: 'Editar aula', remarcar: 'Remarcar aula', cancelada: 'Cancelar aula', nao_realizada: 'Aula não realizada', reposicao: 'Criar reposição', avulsa: 'Nova aula avulsa' }

  async function salvar() {
    if (bloqueado?.(tipo, f)) return
    setSalvando(true)
    let ok = false
    const agora = agoraISO()
    if (tipo === 'editar') {
      const patch = patchEditar(aula, {
        data: f.data, horario: f.horario, duracao_min: f.duracao, observacao: f.observacao,
        ...(aula.status === 'realizada' ? { duracao_real_min: f.duracaoReal } : {}),
        ...(valorCent != null ? { valor_hora_centavos: valorCent } : {}),
      }, agora)
      ok = patch ? await atualizarAula(aula.id, patch) : true
    } else if (tipo === 'remarcar') {
      ok = await atualizarAula(aula.id, patchRemarcar(aula, f.data, { horario: f.horario, motivo: f.motivo.trim() }, agora))
    } else if (tipo === 'cancelada' || tipo === 'nao_realizada') {
      const patch = patchEncerrar(aula, tipo, { quem: f.quem, motivo: f.motivo.trim() }, agora)
      if (f.observacao.trim()) patch.observacao = f.observacao.trim()
      ok = await atualizarAula(aula.id, patch)
    } else if (tipo === 'reposicao') {
      ok = await inserirAula({ ...novaReposicao(aula, aluno, { data: f.data, horario: f.horario, duracao_min: f.duracao }), observacao: f.observacao.trim() || null })
    } else if (tipo === 'avulsa') {
      const al = alunos.find((a) => a.id === f.alunoId)
      let nova = novaAvulsa(al, { data: f.data, horario: f.horario, duracao_min: f.duracao, observacao: f.observacao.trim() })
      if (valorCent != null && f.valorHora.trim() !== '') nova = { ...nova, valor_hora_centavos: valorCent, valor_hora_manual: true } // valor só desta aula
      if (f.realizada) nova = { ...nova, ...patchRealizar(nova, f.duracao, agora) } // aula que já aconteceu: entra como realizada
      ok = await inserirAula(nova)
    }
    setSalvando(false)
    if (ok) onClose()
  }

  const nome = aula ? `${aluno?.nome || ''} · ${rotuloData(aula.data)}` : ''
  const rotuloSalvar = { editar: 'Salvar', remarcar: 'Remarcar', cancelada: 'Cancelar a aula', nao_realizada: 'Registrar', reposicao: 'Criar reposição', avulsa: 'Criar aula' }[tipo]
  const horaAula = tipo === 'avulsa' ? alunos.find((a) => a.id === f.alunoId)?.valor_hora_centavos : aluno?.valor_hora_centavos
  const horaEfetiva = tipo === 'avulsa' && f.valorHora.trim() !== '' && valorCent != null ? valorCent : horaAula
  const previa = (tipo === 'avulsa' || tipo === 'reposicao') && horaEfetiva != null ? valorAula(horaEfetiva, f.duracao) : null

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{titulos[tipo]}</div>
        {nome && <div className="cad-sub" style={{ marginBottom: 12 }}>{nome}</div>}

        {tipo === 'avulsa' && (
          <div className="form-row"><div className="form-group"><label>Aluno</label>
            <select value={f.alunoId} onChange={set('alunoId')}>{alunos.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}</select>
            {onNovoAluno && <button type="button" className="link-btn" style={{ marginTop: 6 }} onClick={onNovoAluno}>Aluno novo? Cadastrar (fixo ou avulso)</button>}
          </div></div>
        )}

        {(tipo === 'cancelada' || tipo === 'nao_realizada') && (
          <>
            <div className="form-row"><div className="form-group"><label>{tipo === 'cancelada' ? 'Quem cancelou' : 'Quem faltou'}</label>
              <div className="pilulas" role="group" aria-label="Quem">
                {[['aluno', 'Aluno / responsável'], ['professora', 'Professora']].map(([v, r]) => (
                  <button key={v} className={f.quem === v ? 'ativo' : ''} onClick={() => setF((x) => ({ ...x, quem: v }))} aria-pressed={f.quem === v}>{r}</button>
                ))}
              </div>
            </div></div>
            <div className="form-row"><div className="form-group"><label>Motivo (opcional)</label><input value={f.motivo} onChange={set('motivo')} placeholder="Ex.: gripe, viagem, imprevisto" /></div></div>
            <div className="cad-sub">{tipo === 'cancelada' ? 'A aula continua no histórico e não é cobrada.' : 'A aula continua no histórico, não é cobrada e não impede o fechamento.'}</div>
          </>
        )}

        {(tipo === 'editar' || tipo === 'remarcar' || tipo === 'reposicao' || tipo === 'avulsa') && (
          <div className="form-row cols2">
            <div className="form-group"><label>{tipo === 'remarcar' ? 'Nova data' : 'Data'}</label><input type="date" value={f.data} onChange={set('data')} /></div>
            <div className="form-group"><label>Horário (opcional)</label><CampoHorario valor={f.horario} onChange={(h) => setF((x) => ({ ...x, horario: h }))} /></div>
          </div>
        )}

        {(tipo === 'editar' || tipo === 'reposicao' || tipo === 'avulsa') && (
          <div className="form-row cols2">
            <div className="form-group"><label>Duração{tipo === 'editar' ? ' prevista' : ''}</label><SeletorDuracao valor={f.duracao} onChange={(m) => setF((x) => ({ ...x, duracao: m }))} /></div>
            {tipo === 'editar' && aula.status === 'realizada' && (
              <div className="form-group"><label>Duração efetiva</label><SeletorDuracao valor={f.duracaoReal} onChange={(m) => setF((x) => ({ ...x, duracaoReal: m }))} /></div>
            )}
          </div>
        )}

        {(tipo === 'editar' || tipo === 'avulsa') && (
          <div className="form-row"><div className="form-group">
            <label>Valor por hora só desta aula (R$){tipo === 'avulsa' ? ' · opcional' : ''}</label>
            <input inputMode="decimal" value={f.valorHora} onChange={set('valorHora')} placeholder={tipo === 'avulsa' ? 'Vazio = valor do aluno' : undefined} />
            <div className="cad-sub">{tipo === 'avulsa' ? 'Use para combinar um preço diferente nesta aula.' : 'Mudar aqui não altera o valor padrão do aluno.'}</div>
          </div></div>
        )}
        {tipo === 'avulsa' && (
          <label className="check-linha"><input type="checkbox" checked={f.realizada} onChange={(e) => setF((x) => ({ ...x, realizada: e.target.checked }))} /> Esta aula já aconteceu (registrar como realizada)</label>
        )}

        {tipo === 'remarcar' && (
          <div className="form-row"><div className="form-group"><label>Motivo (opcional)</label><input value={f.motivo} onChange={set('motivo')} placeholder="Ex.: prova, feriado" /></div></div>
        )}

        {tipo !== 'remarcar' && (
          <div className="form-row"><div className="form-group"><label>Observação (opcional)</label><input value={f.observacao} onChange={set('observacao')} /></div></div>
        )}

        {tipo === 'remarcar' && <div className="cad-sub">É a mesma aula: a data original fica no histórico e ela não é cobrada duas vezes.</div>}
        {previa != null && <div className="cad-sub">Valor previsto: <b>{fmt(centavosParaReais(previa))}</b> ({textoDuracao(f.duracao)}).{tipo === 'reposicao' ? ' Só a reposição é cobrada, quando for realizada.' : ''}</div>}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>Voltar</button>
          <button className={`btn ${tipo === 'cancelada' ? 'btn-danger' : 'btn-primary'}`} style={tipo === 'cancelada' ? { padding: '8px 16px', fontSize: 13 } : undefined}
            onClick={salvar} disabled={salvando || ((tipo === 'avulsa') && !f.alunoId) || ((tipo === 'editar' || tipo === 'remarcar' || tipo === 'reposicao' || tipo === 'avulsa') && !f.data)}>
            {salvando ? 'Salvando...' : rotuloSalvar}
          </button>
        </div>
      </div>
    </div>
  )
}
