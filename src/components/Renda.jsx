import { useState } from 'react'
import RendaSazonal from './RendaSazonal'
import Selo from './ui/Selo'
import { lerNum } from '../lib/adiamentoPref'
import { perfil, rotuloRenda } from '../lib/perfil'
import { fmt, fmtK, mesLabel, nowYM, addMonths, RENDA_CAMPOS, totalRenda } from '../lib/utils'
import { confirmar } from '../lib/dialogos'

// Rótulo curto de cada fonte de renda: 'Salário Giovanna' → 'Giovanna' (antes os dois salários viravam 'Salário' repetido).
const curto = (l) => l.replace(/^Salário /, '')

export default function Renda({ store, irPara }) {
  const { rendas, rendasManuais, aulasMes = {}, upsertRenda } = store
  const mes = nowYM()
  const [editMes, setEditMes] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [inicio, setInicio] = useState(-3) // primeiro mês da lista, em meses a partir de hoje
  const s = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const paraCampo = (v) => (v ? String(v).replace('.', ',') : '')
  function abrir(m) {
    const r = rendasManuais.find((x) => x.mes === m) || {}
    setForm({
      mes: m,
      giovanna: paraCampo(r.giovanna),
      sabrina: paraCampo(r.sabrina),
      extra_sabrina: paraCampo(r.extra_sabrina),
      mesada: paraCampo(r.mesada),
      outros: paraCampo(r.outros),
    })
    setEditMes(m)
  }

  async function salvar() {
    setSaving(true)
    const ok = await upsertRenda({
      ...form,
      giovanna: lerNum(form.giovanna),
      sabrina: lerNum(form.sabrina),
      extra_sabrina: lerNum(form.extra_sabrina),
      mesada: lerNum(form.mesada),
      outros: lerNum(form.outros),
    })
    setSaving(false)
    if (ok) setEditMes(null) // se deu erro, mantém o formulário
  }

  const meses = Array.from({ length: 8 }, (_, i) => addMonths(mes, inicio + i)).filter((m) => !store.inicioApp || m >= store.inicioApp) // sem linhas de antes do início do uso
  const noPrimeiro = !!store.inicioApp && addMonths(mes, inicio) <= store.inicioApp
  const rendaAtual = rendas.find((r) => r.mes === mes) || null // com aulas
  const manualAtual = rendasManuais.find((r) => r.mes === mes) || null // só o digitado
  const totalAtual = totalRenda(rendaAtual)
  const totalManual = totalRenda(manualAtual)
  const aulasAtual = aulasMes[mes]?.valor || 0
  const ultimos3 = [-1, -2, -3].map((i) => totalRenda(rendas.find((r) => r.mes === addMonths(mes, i)))).filter((v) => v > 0)
  const media3 = ultimos3.length ? ultimos3.reduce((a, b) => a + b, 0) / ultimos3.length : 0
  const semRenda = Array.from({ length: 6 }, (_, i) => addMonths(mes, i + 1)).filter((m) => !(totalRenda(rendasManuais.find((r) => r.mes === m)) > 0))

  // Repete a renda do mês atual nos próximos meses que ainda estão sem renda (só preenche o que está vazio).
  async function repetir() {
    if (!manualAtual || !semRenda.length) return
    if (!await confirmar(`Copiar a renda de ${mesLabel(mes)} (${fmt(totalManual)}, sem as aulas) para ${semRenda.length === 1 ? 'o mês' : `os ${semRenda.length} meses`} sem renda: ${semRenda.map(mesLabel).join(', ')}?\n\nMeses que já têm renda não são alterados.`)) return
    for (const m of semRenda) {
      const ok = await upsertRenda({ mes: m, giovanna: Number(manualAtual.giovanna || 0), sabrina: Number(manualAtual.sabrina || 0), extra_sabrina: Number(manualAtual.extra_sabrina || 0), mesada: Number(manualAtual.mesada || 0), outros: Number(manualAtual.outros || 0) })
      if (!ok) break
    }
  }

  return (
    <div className="page">
      {editMes && (
        <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') setEditMes(null) }}>
          <div className="modal">
            <div className="modal-title">Renda de {mesLabel(editMes)}</div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>{rotuloRenda('giovanna', 'Salário Giovanna')}</label>
                <input inputMode="decimal" value={form.giovanna} onChange={s('giovanna')} placeholder="0,00" autoFocus />
              </div>
              <div className="form-group">
                <label>{rotuloRenda('sabrina', 'Salário Sabrina')}</label>
                <input inputMode="decimal" value={form.sabrina} onChange={s('sabrina')} placeholder="0,00" />
              </div>
            </div>
            <div className="form-row cols2">
              <div className="form-group">
                <label>{rotuloRenda('extra_sabrina', 'Extra Sabrina')} {perfil.aulas && <span style={{ fontWeight: 400, color: 'var(--text3)' }}>(sem as aulas particulares: elas entram sozinhas)</span>}</label>
                <input inputMode="decimal" value={form.extra_sabrina} onChange={s('extra_sabrina')} placeholder="0,00" />
              </div>
              <div className="form-group">
                <label>Mesada</label>
                <input inputMode="decimal" value={form.mesada} onChange={s('mesada')} placeholder="0,00" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Outros (extras, reembolsos, presentes...)</label>
                <input inputMode="decimal" value={form.outros} onChange={s('outros')} placeholder="0,00" />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setEditMes(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={salvar} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className={`ini-hero renda-hero ${totalAtual > 0 ? '' : 'neg'}`} aria-label="Renda do mês">
        <div className="ini-hero-rotulo">Renda de {mesLabel(mes)}</div>
        <div className="ini-hero-valor mono">{totalAtual > 0 ? fmt(totalAtual) : 'Não cadastrada'}</div>
        <div className="ini-hero-sub">
          {totalAtual > 0
            ? (RENDA_CAMPOS.filter(([k]) => rendaAtual?.[k] && Number(rendaAtual[k]) > 0).map(([k, l]) => `${curto(l)} ${fmtK(rendaAtual[k])}`).join(' · '))
            : 'Sem renda cadastrada, o app não consegue calcular quanto você pode gastar.'}
        </div>
        <div className="renda-acoes">
          <button className="btn btn-primary" onClick={() => abrir(mes)}>{totalAtual > 0 ? 'Editar renda do mês' : 'Cadastrar renda do mês'}</button>
          {totalManual > 0 && semRenda.length > 0 && <button className="btn btn-ghost" onClick={repetir} title="Copia esta renda para os próximos meses que estão sem renda">Repetir nos próximos {semRenda.length} {semRenda.length === 1 ? 'mês' : 'meses'}</button>}
        </div>
        {aulasAtual > 0 && (
          <div className="ini-hero-sub" style={{ marginTop: 10 }}>
            Inclui <b>{fmt(aulasAtual)}</b> de {perfil.entradaRotulo}{aulasMes[mes].mesAulas ? ` dadas em ${mesLabel(aulasMes[mes].mesAulas)}` : ''}{aulasMes[mes].projetada ? ' (previstas pela agenda)' : ''} ({fmt(aulasMes[mes].recebido)} recebidos{aulasMes[mes].aReceber > 0 ? `, ${fmt(aulasMes[mes].aReceber)} a receber` : ''}).{' '}
            {irPara && <button className="link-btn" onClick={() => irPara(perfil.aulas ? 'aulas' : 'atendimentos')}>Ver {perfil.aulas ? 'aulas' : 'atendimentos'} →</button>}
          </div>
        )}
        {media3 > 0 && <div className="ini-hero-sub" style={{ marginTop: 10 }}>Média dos últimos meses cadastrados: <b>{fmtK(media3)}</b></div>}
      </section>

      <div className="grupos-barra">
        {!noPrimeiro ? <button className="link-btn" onClick={() => setInicio((i) => i - 6)}>← meses anteriores</button> : <span />}
        {inicio !== -3 && <button className="link-btn" onClick={() => setInicio(-3)}>voltar para hoje</button>}
        <button className="link-btn" onClick={() => setInicio((i) => i + 6)}>próximos meses →</button>
      </div>
      <div className="card">
        <ul className="fx-lista rd-lista" aria-label="Renda mês a mês">
          {meses.map((m) => {
            const r = rendas.find((x) => x.mes === m) || null
            const tot = totalRenda(r)
            const fontes = RENDA_CAMPOS.filter(([k]) => r?.[k] && Number(r[k]) > 0)
            return (
              <li key={m} className={`fx-item${m === mes ? ' rd-atual' : ''}`}>
                <div className="fx-topo">
                  <div className="fx-nome">
                    <span className="fx-titulo">{mesLabel(m)}</span>
                    {m === mes && <Selo tom="ok">atual</Selo>}
                  </div>
                  <div className={`fx-valor mono${tot > 0 ? ' rd-ok' : ''}`}>{tot > 0 ? fmt(tot) : '—'}</div>
                </div>
                {fontes.length > 0 ? (
                  <dl className="rd-fontes">
                    {fontes.map(([k, l]) => (
                      <div key={k}>
                        <dt>{curto(l)}</dt>
                        <dd className="mono">{fmt(r[k])}</dd>
                        {k === 'extra_sabrina' && r?.extra_aulas > 0 && <dd className="rd-sub">{perfil.aulas ? 'aulas' : 'atendimentos'} {fmt(r.extra_aulas)}{r.aulas_projetadas ? ' (prev.)' : ''}</dd>}
                      </div>
                    ))}
                  </dl>
                ) : <div className="fx-meta"><span>sem renda cadastrada</span></div>}
                <div className="fx-acoes"><button className="btn btn-ghost btn-sm" onClick={() => abrir(m)}>{tot > 0 ? 'Editar' : 'Cadastrar'}<span className="so-leitor"> renda de {mesLabel(m)}</span></button></div>
              </li>
            )
          })}
        </ul>
      </div>

      <RendaSazonal store={{ ...store, irPara }} />
    </div>
  )
}
