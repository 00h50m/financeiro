import { useState } from 'react'
import { fmt, hojeSP } from '../lib/utils'
import { lerNum } from '../lib/adiamentoPref'

export const TIPOS_DIVIDA = { cartao: 'Cartão', boleto: 'Boleto / conta atrasada', emprestimo: 'Empréstimo', financiamento: 'Financiamento', outro: 'Outra' }

const txt = (n) => (Number(n) ? String(n).replace('.', ',') : '')

// Cadastro de uma dívida. Só nome e saldo são obrigatórios; parcela e juros ajudam a simular melhor.
export default function ModalDivida({ divida, onSalvar, onRemover, onClose }) {
  const [f, setF] = useState(() => ({
    nome: divida?.nome || '', tipo: divida?.tipo || 'cartao', saldo: txt(divida?.saldo), parcela: txt(divida?.parcela), juros: txt(divida?.juros_mes),
    dia: divida?.vencimento_dia ? String(divida.vencimento_dia) : '', atrasada: !!divida?.atrasada, obs: divida?.observacao || '',
  }))
  const [salvando, setSalvando] = useState(false)
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const saldo = lerNum(f.saldo)
  const valido = f.nome.trim() && saldo > 0
  const dia = Number(f.dia)

  async function salvar(extra = {}) {
    if (!valido && !extra.quitar) return
    setSalvando(true)
    const reg = {
      ...(divida?.id ? { id: divida.id } : {}),
      nome: f.nome.trim(), tipo: f.tipo, saldo: extra.quitar ? 0 : saldo, parcela: lerNum(f.parcela), juros_mes: lerNum(f.juros),
      vencimento_dia: dia >= 1 && dia <= 31 ? dia : null, atrasada: f.atrasada, observacao: f.obs.trim() || null,
      ...(extra.quitar ? { ativa: false, quitada_em: hojeSP() } : { ativa: true, quitada_em: null }),
    }
    const ok = await onSalvar(reg)
    setSalvando(false)
    if (ok) onClose()
  }

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-title">{divida ? 'Editar dívida' : 'Nova dívida'}</div>
        <div className="form-group"><label>Nome</label><input value={f.nome} onChange={set('nome')} placeholder="Ex.: Cartão Nubank, boleto da reforma" autoFocus /></div>
        <div className="form-row cols2">
          <div className="form-group"><label>Tipo</label>
            <select value={f.tipo} onChange={set('tipo')}>{Object.entries(TIPOS_DIVIDA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </div>
          <div className="form-group"><label>Quanto deve hoje (R$)</label><input inputMode="decimal" value={f.saldo} onChange={set('saldo')} placeholder="Ex.: 3500" /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Parcela ou mínimo por mês (R$) <span className="cad-sub">opcional</span></label><input inputMode="decimal" value={f.parcela} onChange={set('parcela')} placeholder="0" /></div>
          <div className="form-group"><label>Juros ao mês (%) <span className="cad-sub">opcional</span></label><input inputMode="decimal" value={f.juros} onChange={set('juros')} placeholder="Não sei = deixe vazio" /></div>
        </div>
        <div className="form-row cols2">
          <div className="form-group"><label>Dia do vencimento <span className="cad-sub">opcional</span></label><input inputMode="numeric" value={f.dia} onChange={set('dia')} placeholder="1 a 31" /></div>
          <div className="form-group"><label>Observação <span className="cad-sub">opcional</span></label><input value={f.obs} onChange={set('obs')} /></div>
        </div>
        <label className="check-linha"><input type="checkbox" checked={f.atrasada} onChange={(e) => setF((x) => ({ ...x, atrasada: e.target.checked }))} /> Está atrasada</label>
        {saldo > 0 && lerNum(f.juros) > 0 && <div className="cad-sub">Só de juros, essa dívida cresce cerca de <b>{fmt(saldo * (lerNum(f.juros) / 100))}</b> por mês.</div>}
        <div className="modal-footer">
          {divida && <button className="btn btn-danger" style={{ padding: '10px 16px', fontSize: 13 }} onClick={async () => { if (window.confirm(`Apagar "${divida.nome}" do plano?`)) { const ok = await onRemover(divida.id); if (ok) onClose() } }}>Apagar</button>}
          {divida && <button className="btn btn-ghost" disabled={salvando} onClick={() => { if (window.confirm(`Marcar "${divida.nome}" como quitada?`)) salvar({ quitar: true }) }}>Quitada ✓</button>}
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando || !valido} onClick={() => salvar()}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
