import { useState } from 'react'
import { fmt, hojeSP, corPessoa, tituloCompra } from '../lib/utils'
import { prepararEvento } from '../lib/evento'
import { construirRegrasDoHistorico } from '../lib/categorizacao'
import { indexarAliases } from '../lib/estabelecimento'

const ORIGENS = {
  manual: '✍️ Manual',
  inbox_manual: '✍️ Adicionado no Inbox',
  telegram: '✈️ Telegram',
  android_notification: '📱 Notificação',
  csv: '📄 Fatura CSV',
}
const nomeOrigem = (ev) => {
  const base = ORIGENS[ev.origem] || ev.origem
  return ev.origem === 'android_notification' && ev.app_origem ? `${base} ${ev.app_origem}` : base
}
const ROTULO_FALTA = { pessoa: 'pessoa', cartao: 'cartão ou forma de pagamento', pago: 'se já foi pago', categoria: 'categoria' }
const FORMAS = [['pix', 'Pix'], ['dinheiro', 'Dinheiro'], ['boleto', 'Boleto'], ['outro', 'Outro (sem cartão)']]
const fmtData = (iso) => (iso || '').slice(0, 10).split('-').reverse().join('/')
const STATUS_RESOLVIDO = { confirmado: ['green', 'Lançado'], vinculado: ['blue', 'Vinculado'], ignorado: ['gray', 'Ignorado'] }

// "Pagamento" junta cartão e forma sem cartão num único seletor: id do cartão ou "forma:pix".
const pagamentoDe = (ev) => (ev.cartao_id ? ev.cartao_id : ev.forma_pagamento && ev.forma_pagamento !== 'cartao' ? `forma:${ev.forma_pagamento}` : '')

function camposDoForm(f) {
  const campos = {
    descricao: f.descricao, valor: Number(f.valor), data_compra: f.data, parcelas: Number(f.parcelas) || 1,
    categoria: f.categoria, subcategoria: f.subcategoria, pessoa_id: f.pessoa_id || null,
  }
  if (f.pagamento.startsWith('forma:')) {
    return { ...campos, cartao_id: null, forma_pagamento: f.pagamento.slice(6), pago: f.pago === true }
  }
  return { ...campos, cartao_id: f.pagamento || null }
}

function Pagamento({ valor, onChange, cartoes }) {
  return (
    <select value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">— escolha —</option>
      {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
      {FORMAS.map(([k, n]) => <option key={k} value={`forma:${k}`}>{n}</option>)}
    </select>
  )
}

function CartaoEvento({ ev, store }) {
  const { cartoes, pessoas, categorias, compras, confirmarEvento, vincularEvento, ignorarEvento } = store
  const [editando, setEditando] = useState(false)
  const [separado, setSeparado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')
  const [f, setF] = useState({
    descricao: ev.descricao_original, valor: String(ev.valor), data: ev.data_evento, parcelas: String(ev.parcelas),
    categoria: ev.categoria || '', subcategoria: ev.subcategoria || '', pessoa_id: ev.pessoa_id || '',
    pagamento: pagamentoDe(ev), pago: typeof ev.pago === 'boolean' ? ev.pago : null,
  })
  const s = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const faltando = ev.faltando || []
  const cartao = cartoes.find((c) => c.id === ev.cartao_id)
  const pessoa = pessoas.find((p) => p.id === ev.pessoa_id)
  const correspondente = ev.match_nivel !== 'nenhum' && !separado ? compras.find((c) => c.id === ev.match_compra_id) : null
  const subs = categorias.find((c) => c.nome === f.categoria)?.subcategorias || []
  const semCartao = f.pagamento.startsWith('forma:')
  const formOk = f.descricao.trim() && Number(f.valor) > 0 && f.data && f.categoria && f.subcategoria && f.pessoa_id && f.pagamento
    && (!semCartao || f.pago !== null)

  async function executar(fn) {
    setBusy(true)
    setErro('')
    try { await fn() } catch (e) { setErro(e.message || 'Erro ao salvar') }
    setBusy(false)
  }

  return (
    <div className="card" style={{ padding: 16, overflow: 'visible' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 500 }}>
            {ev.descricao_original}
            {ev.descricao_normalizada && ev.descricao_normalizada.toLowerCase() !== ev.descricao_original.toLowerCase() && (
              <span style={{ color: 'var(--text3)', fontWeight: 400 }}> → {ev.descricao_normalizada}</span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
            {nomeOrigem(ev)} · {fmtData(ev.data_evento)}{ev.parcelas > 1 ? ` · ${ev.parcelas}x` : ''}
          </div>
        </div>
        <div className="mono" style={{ fontSize: 18, fontWeight: 500 }}>{fmt(ev.valor)}</div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
        {ev.categoria ? (
          <span className="badge badge-gray">
            {ev.categoria} › {ev.subcategoria}
            {ev.confianca_categoria != null && ` · sugerido ${Math.round(ev.confianca_categoria * 100)}%`}
          </span>
        ) : null}
        {cartao && <span className="badge badge-gray">{cartao.nome}</span>}
        {!cartao && ev.forma_pagamento && ev.forma_pagamento !== 'cartao' && (
          <span className="badge badge-gray">{ev.forma_pagamento}{ev.pago === true ? ' · pago' : ev.pago === false ? ' · a pagar' : ''}</span>
        )}
        {pessoa && <span className={`badge badge-${corPessoa(pessoas, pessoa.nome)}`}>{pessoa.nome}</span>}
        {faltando.map((k) => <span key={k} className="badge badge-red">falta: {ROTULO_FALTA[k] || k}</span>)}
      </div>

      {correspondente && (
        <div className="alert alert-amber">
          <b>{ev.match_nivel === 'exato' ? 'Parece ser a mesma compra já lançada' : 'Possível correspondência encontrada'}</b>
          <div style={{ marginTop: 4 }}>
            Finapp: {tituloCompra(correspondente)} · {fmt(correspondente.valor_total)} · {fmtData(correspondente.data_compra)}
            {correspondente.origem && correspondente.origem !== 'manual' ? ` · ${ORIGENS[correspondente.origem] || correspondente.origem}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => executar(() => vincularEvento(ev.id, correspondente.id))}>
              Vincular
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => setSeparado(true)}>Criar separadamente</button>
          </div>
        </div>
      )}

      {editando && (
        <div style={{ marginTop: 8 }}>
          <div className="form-row cols2">
            <div className="form-group"><label>Descrição</label><input value={f.descricao} onChange={s('descricao')} /></div>
            <div className="form-group"><label>Valor total</label><input type="number" step="0.01" value={f.valor} onChange={s('valor')} /></div>
          </div>
          <div className="form-row cols3">
            <div className="form-group"><label>Data</label><input type="date" value={f.data} onChange={s('data')} /></div>
            <div className="form-group"><label>Parcelas</label><input type="number" min="1" value={f.parcelas} onChange={s('parcelas')} /></div>
            <div className="form-group">
              <label>Quem</label>
              <select value={f.pessoa_id} onChange={s('pessoa_id')}>
                <option value="">— escolha —</option>
                {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row cols2">
            <div className="form-group">
              <label>Categoria</label>
              <select value={f.categoria} onChange={(e) => {
                const subsNovas = categorias.find((c) => c.nome === e.target.value)?.subcategorias || []
                setF((p) => ({ ...p, categoria: e.target.value, subcategoria: subsNovas[0] || '' }))
              }}>
                <option value="">— escolha —</option>
                {categorias.map((c) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Subcategoria</label>
              <select value={f.subcategoria} onChange={s('subcategoria')}>
                {subs.map((x) => <option key={x}>{x}</option>)}
              </select>
            </div>
          </div>
          <div className="form-row cols2">
            <div className="form-group"><label>Cartão / forma de pagamento</label><Pagamento valor={f.pagamento} cartoes={cartoes} onChange={(v) => setF((p) => ({ ...p, pagamento: v }))} /></div>
            {semCartao && (
              <div className="form-group">
                <label>Já foi pago?</label>
                <select value={f.pago === null ? '' : f.pago ? 'sim' : 'nao'} onChange={(e) => setF((p) => ({ ...p, pago: e.target.value === '' ? null : e.target.value === 'sim' }))}>
                  <option value="">— escolha —</option>
                  <option value="sim">Sim, já paguei</option>
                  <option value="nao">Não, a pagar</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {erro && <div className="alert alert-red">{erro}</div>}

      {!correspondente && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {editando ? (
            <>
              <button className="btn btn-primary" disabled={busy || !formOk} onClick={() => executar(() => confirmarEvento(ev.id, camposDoForm(f)))}>
                {busy ? 'Salvando...' : 'Confirmar'}
              </button>
              <button className="btn btn-ghost" disabled={busy} onClick={() => setEditando(false)}>Voltar</button>
            </>
          ) : (
            <>
              {faltando.length === 0 ? (
                <button className="btn btn-primary" disabled={busy} onClick={() => executar(() => confirmarEvento(ev.id))}>
                  {busy ? 'Salvando...' : 'Confirmar'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => setEditando(true)}>Completar</button>
              )}
              {faltando.length === 0 && <button className="btn btn-ghost" onClick={() => setEditando(true)}>Editar</button>}
            </>
          )}
          <button className="btn btn-ghost" disabled={busy} onClick={() => { if (confirm('Ignorar este lançamento? Ele sai do Inbox e não vira compra.')) executar(() => ignorarEvento(ev.id)) }}>Ignorar</button>
        </div>
      )}
      {correspondente && (
        <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => { if (confirm('Ignorar este lançamento? Ele sai do Inbox e não vira compra.')) executar(() => ignorarEvento(ev.id)) }}>Ignorar</button>
      )}
    </div>
  )
}

function NovoNoInbox({ store, onFechar }) {
  const { cartoes, pessoas, categorias, regras, aliases, compras, eventos, adicionarEventos } = store
  const [f, setF] = useState({ descricao: '', valor: '', data: hojeSP(), pessoa_id: pessoas[0]?.id || '', pagamento: '', pago: null })
  const [erro, setErro] = useState('')
  const [busy, setBusy] = useState(false)
  const s = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  const semCartao = f.pagamento.startsWith('forma:')

  async function adicionar() {
    setErro('')
    const { evento, erros } = prepararEvento({
      origem: 'inbox_manual', id_externo: crypto.randomUUID(), valor: f.valor, data_evento: f.data,
      descricao_original: f.descricao, pessoa_id: f.pessoa_id,
      cartao_id: semCartao ? undefined : f.pagamento || undefined,
      forma_pagamento: semCartao ? f.pagamento.slice(6) : undefined,
      pago: semCartao && f.pago !== null ? f.pago : undefined,
    }, { categorias, cartoes, pessoas, regras, aliases, compras, eventos })
    if (erros.length) return setErro(erros.join(', '))
    setBusy(true)
    try { await adicionarEventos([evento]); onFechar() } catch (e) { setErro(e.message || 'Erro ao adicionar') }
    setBusy(false)
  }

  return (
    <div className="card" style={{ padding: 16, overflow: 'visible' }}>
      <div className="form-row cols3">
        <div className="form-group"><label>Descrição</label><input value={f.descricao} onChange={s('descricao')} placeholder="Ex: iFood" autoFocus /></div>
        <div className="form-group"><label>Valor</label><input type="number" step="0.01" value={f.valor} onChange={s('valor')} /></div>
        <div className="form-group"><label>Data</label><input type="date" value={f.data} onChange={s('data')} /></div>
      </div>
      <div className="form-row cols3">
        <div className="form-group">
          <label>Quem</label>
          <select value={f.pessoa_id} onChange={s('pessoa_id')}>{pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
        </div>
        <div className="form-group"><label>Cartão / forma</label><Pagamento valor={f.pagamento} cartoes={cartoes} onChange={(v) => setF((p) => ({ ...p, pagamento: v }))} /></div>
        {semCartao && (
          <div className="form-group">
            <label>Já foi pago?</label>
            <select value={f.pago === null ? '' : f.pago ? 'sim' : 'nao'} onChange={(e) => setF((p) => ({ ...p, pago: e.target.value === '' ? null : e.target.value === 'sim' }))}>
              <option value="">— escolha —</option><option value="sim">Sim</option><option value="nao">Não</option>
            </select>
          </div>
        )}
      </div>
      {erro && <div className="alert alert-red">{erro}</div>}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" disabled={busy || !f.descricao.trim() || !f.valor} onClick={adicionar}>Adicionar ao Inbox</button>
        <button className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
      </div>
    </div>
  )
}

export default function Inbox({ store }) {
  const { eventos, regras, aliases, compras, inboxOk, adicionarRegras } = store
  const [novo, setNovo] = useState(false)
  const [aprendendo, setAprendendo] = useState(false)
  const pendentes = eventos.filter((e) => e.status === 'pendente' || e.status === 'aguardando_dados')
  const resolvidos = eventos.filter((e) => !pendentes.includes(e)).slice(0, 8)

  if (!inboxOk) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          O Inbox ainda não está ativo no banco. No Supabase (SQL Editor), rode em ordem os arquivos da pasta{' '}
          <b>inbox/</b> do repositório, de <b>01</b> a <b>10</b>, e recarregue esta página.
        </div>
      </div>
    )
  }

  async function aprender() {
    setAprendendo(true)
    try {
      const lista = construirRegrasDoHistorico(compras, indexarAliases(aliases))
        .map(({ estabelecimento_chave, categoria, subcategoria, confirmacoes, rejeicoes }) => ({ estabelecimento_chave, categoria, subcategoria, confirmacoes, rejeicoes }))
      await adicionarRegras(lista)
    } catch (e) {
      alert('Erro: ' + e.message)
    }
    setAprendendo(false)
  }

  return (
    <div className="page">
      <div className="alert alert-blue">
        Lançamentos que chegaram de outras fontes (Telegram, notificações do celular, fatura) e ainda não viraram compra.
        Nada entra nas suas contas sem a sua confirmação.
      </div>

      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => setNovo((v) => !v)}>+ Adicionar ao Inbox</button>
        {regras.length === 0 && compras.length > 0 && (
          <button className="btn btn-ghost" disabled={aprendendo} onClick={aprender}>
            {aprendendo ? 'Aprendendo...' : 'Aprender categorias com o histórico'}
          </button>
        )}
      </div>

      {novo && <NovoNoInbox store={store} onFechar={() => setNovo(false)} />}

      {pendentes.length === 0 ? (
        <div className="card"><div className="empty">Nada pendente.{'\n'}Quando algo chegar, aparece aqui para você confirmar.</div></div>
      ) : (
        pendentes.map((ev) => <CartaoEvento key={ev.id} ev={ev} store={store} />)
      )}

      {resolvidos.length > 0 && (
        <>
          <div className="section-label">Resolvidos recentemente</div>
          <div className="card">
            <table>
              <tbody>
                {resolvidos.map((e) => {
                  const [cor, rotulo] = STATUS_RESOLVIDO[e.status] || ['gray', e.status]
                  return (
                    <tr key={e.id}>
                      <td>{e.descricao_original}<div style={{ fontSize: 11, color: 'var(--text3)' }}>{nomeOrigem(e)}</div></td>
                      <td className="mono">{fmt(e.valor)}</td>
                      <td>{fmtData(e.data_evento)}</td>
                      <td><span className={`badge badge-${cor}`}>{rotulo}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
