import { useState } from 'react'
import { fmt, calcMesInicio, mesLabel, hojeSP } from '../lib/utils'
import { restante, somaPartes, validarDivisao, planoDeDivisao, planoDeUniao } from '../lib/divisaoCompra'

const brl = (v) => fmt(Math.abs(v))

// Nova compra, edição de compra e compra dividida em várias categorias (ex.: pedido do Mercado Livre).
//   editar  = compra existente a editar        grupo = partes de uma compra já dividida (editar em conjunto)
//   onSave(dados)                 cria / atualiza uma compra comum
//   onSaveDivisao(plano, grupoId) grava uma divisão (partes novas, alteradas e removidas)
export default function ModalCompra({
  cartoes, categorias, pessoas, onSave, onSaveDivisao, onClose,
  editar = null, grupo = null, gruposOk = false, avisoPagamentos = false,
}) {
  const origem = grupo?.length ? grupo[0] : editar
  const emEdicao = !!origem
  const primeiraCat = categorias[0]
  const [f, setF] = useState(() => origem ? {
    data_compra: String(origem.data_compra).slice(0, 10),
    descricao: origem.descricao || '',
    identificacao: grupo?.length ? '' : origem.identificacao || '',
    categoria: origem.categoria,
    subcategoria: origem.subcategoria,
    pessoa: origem.pessoa,
    cartao_id: origem.cartao_id || '',
    valor_total: String(grupo?.length ? somaPartes(grupo.map((c) => ({ valor: c.valor_total }))) : origem.valor_total),
    parcelas: String(origem.parcelas || 1),
    obs: origem.obs || '',
    pago: !!origem.pago,
  } : {
    data_compra: hojeSP(),
    descricao: '',
    identificacao: '',
    categoria: primeiraCat?.nome || '',
    subcategoria: primeiraCat?.subcategorias?.[0] || '',
    pessoa: pessoas[0]?.nome || '',
    cartao_id: cartoes[0]?.id || '',
    valor_total: '',
    parcelas: '1',
    obs: '',
    pago: false,
  })
  const [dividir, setDividir] = useState(!!grupo && grupo.length >= 2)
  const [itens, setItens] = useState(() => grupo?.length >= 2
    ? grupo.map((c) => ({ id: c.id, categoria: c.categoria, subcategoria: c.subcategoria, valor: String(c.valor_total), identificacao: c.identificacao || '' }))
    : [])
  const [saving, setSaving] = useState(false)
  const [itensLancados, setItensLancados] = useState(0)
  const s = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const subcats = categorias.find((c) => c.nome === f.categoria)?.subcategorias || ['Outros']
  const cartao = cartoes.find((c) => c.id === f.cartao_id)
  const mesInicio = f.data_compra && cartao ? calcMesInicio(f.data_compra, cartao) : ''
  const valorParc = f.valor_total && f.parcelas ? Number(f.valor_total) / Number(f.parcelas) : 0
  const parcelasOk = Number.isInteger(Number(f.parcelas)) && Number(f.parcelas) >= 1 && Number(f.parcelas) <= 60
  const errosDivisao = dividir ? validarDivisao(f.valor_total, itens, categorias) : []
  const baseOk = f.descricao && Number(f.valor_total) > 0 && parcelasOk && f.data_compra && !saving
  const ok = baseOk && (dividir ? errosDivisao.length === 0 : !!f.categoria)
  const falta = restante(f.valor_total, itens)

  function ligarDivisao(ligar) {
    setDividir(ligar)
    if (ligar && itens.length === 0) {
      const outra = categorias.find((c) => c.nome !== f.categoria) || primeiraCat
      setItens([
        { id: editar?.id, categoria: f.categoria, subcategoria: f.subcategoria, valor: '', identificacao: '' },
        { categoria: outra?.nome || '', subcategoria: outra?.subcategorias?.[0] || '', valor: '', identificacao: '' },
      ])
    }
  }
  const mudarItem = (i, patch) => setItens((l) => l.map((x, n) => (n === i ? { ...x, ...patch } : x)))
  const trocarCategoria = (i, nome) => mudarItem(i, { categoria: nome, subcategoria: categorias.find((c) => c.nome === nome)?.subcategorias?.[0] || '' })
  const usarRestante = (i) => {
    const outras = itens.filter((_, n) => n !== i)
    mudarItem(i, { valor: String(restante(f.valor_total, outras)) })
  }
  const novaParte = () => {
    const c = primeiraCat
    setItens((l) => [...l, { categoria: c?.nome || '', subcategoria: c?.subcategorias?.[0] || '', valor: '', identificacao: '' }])
  }

  const baseDaCompra = () => ({
    data_compra: f.data_compra,
    descricao: f.descricao,
    pessoa: f.pessoa,
    cartao_id: f.cartao_id || null,
    parcelas: Number(f.parcelas),
    obs: f.obs,
    pago: f.pago,
    // pago antes e continua pago: mantém a data original do pagamento
    data_pagamento: f.pago ? (origem?.pago && origem.data_pagamento ? origem.data_pagamento : hojeSP()) : null,
  })

  async function save(fechar) {
    if (!ok) return
    setSaving(true)
    let salvou
    if (dividir) {
      const existentes = grupo?.length ? grupo : editar ? [editar] : []
      const grupoId = gruposOk ? (grupo?.[0]?.grupo_id || crypto.randomUUID()) : null
      const plano = planoDeDivisao({ base: baseDaCompra(), itens, existentes, grupoId })
      salvou = await onSaveDivisao(plano, grupoId)
    } else if (grupo?.length) {
      // tinha divisão e foi desligada: volta a ser uma compra só
      salvou = await onSaveDivisao(planoDeUniao({
        base: baseDaCompra(), total: f.valor_total, categoria: f.categoria, subcategoria: f.subcategoria,
        identificacao: f.identificacao, existentes: grupo,
      }), null)
    } else {
      const { identificacao, ...resto } = f
      const dados = {
        ...resto,
        ...(emEdicao ? { identificacao: identificacao.trim() || null } : identificacao.trim() ? { identificacao: identificacao.trim() } : {}),
        valor_total: Number(f.valor_total),
        parcelas: Number(f.parcelas),
        cartao_id: f.cartao_id || null,
        data_pagamento: baseDaCompra().data_pagamento,
      }
      salvou = await onSave(dados)
    }
    setSaving(false)
    if (!salvou) return // deu erro: mantém o que foi digitado para tentar de novo
    setItensLancados((n) => n + 1)
    if (fechar || emEdicao || dividir) {
      onClose()
    } else {
      setF((p) => ({
        ...p,
        descricao: '',
        identificacao: '',
        categoria: primeiraCat?.nome || '',
        subcategoria: primeiraCat?.subcategorias?.[0] || '',
        valor_total: '',
        obs: '',
        pago: false,
      }))
    }
  }

  const titulo = grupo?.length ? 'Editar compra dividida' : emEdicao ? 'Editar compra' : 'Nova compra'

  return (
    <div className="overlay" onClick={(e) => { if (e.target.className === 'overlay') onClose() }}>
      <div className="modal">
        <div className="modal-title">{titulo}</div>

        {itensLancados > 0 && !emEdicao && (
          <div className="alert alert-green">
            ✓ {itensLancados} {itensLancados === 1 ? 'item lançado' : 'itens lançados'} deste pedido. Data, cartão,
            pessoa e parcelas continuam preenchidos — ajuste descrição, categoria e valor do próximo item.
          </div>
        )}
        {emEdicao && avisoPagamentos && (
          <div className="alert alert-amber">
            Esta compra tem parcelas marcadas como pagas em Pagamentos. Mudar a data, as parcelas ou o cartão pode
            desalinhar essas marcações — confira lá depois de salvar.
          </div>
        )}

        <div className="form-row cols2">
          <div className="form-group">
            <label>Data</label>
            <input type="date" value={f.data_compra} onChange={s('data_compra')} />
          </div>
          <div className="form-group">
            <label>Quem</label>
            <select value={f.pessoa} onChange={s('pessoa')}>
              {pessoas.map((p) => <option key={p.id}>{p.nome}</option>)}
              {f.pessoa && !pessoas.some((p) => p.nome === f.pessoa) && <option>{f.pessoa}</option>}
            </select>
          </div>
        </div>

        <div className="form-row cols2">
          <div className="form-group">
            <label>Nome (como aparece no cartão)</label>
            <input
              placeholder="Ex: Nike Air Max, iFood, Mercado..."
              value={f.descricao}
              onChange={s('descricao')}
              autoFocus={!emEdicao}
            />
          </div>
          {!dividir && (
            <div className="form-group">
              <label>Identificação (opcional)</label>
              <input
                placeholder="Ex: Tênis de corrida da Sabi"
                value={f.identificacao}
                onChange={s('identificacao')}
              />
            </div>
          )}
        </div>

        {!dividir && (
          <div className="form-row cols2">
            <div className="form-group">
              <label>Categoria</label>
              <select
                value={f.categoria}
                onChange={(e) => {
                  const cat = e.target.value
                  const subs = categorias.find((c) => c.nome === cat)?.subcategorias || []
                  setF((p) => ({ ...p, categoria: cat, subcategoria: subs[0] || 'Outros' }))
                }}
              >
                {categorias.map((c) => <option key={c.id}>{c.nome}</option>)}
                {f.categoria && !categorias.some((c) => c.nome === f.categoria) && <option>{f.categoria}</option>}
              </select>
            </div>
            <div className="form-group">
              <label>Subcategoria</label>
              <select value={f.subcategoria} onChange={s('subcategoria')}>
                {subcats.map((x) => <option key={x}>{x}</option>)}
                {f.subcategoria && !subcats.includes(f.subcategoria) && <option>{f.subcategoria}</option>}
              </select>
            </div>
          </div>
        )}

        <div className="form-row cols3">
          <div className="form-group">
            <label>Cartão</label>
            <select value={f.cartao_id} onChange={s('cartao_id')}>
              <option value="">Sem cartão (dinheiro/Pix/boleto)</option>
              {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>{dividir ? 'Valor total da compra (R$)' : 'Valor total (R$)'}</label>
            <input type="number" step="0.01" min="0" placeholder="0,00" value={f.valor_total} onChange={s('valor_total')} />
          </div>
          <div className="form-group">
            <label>Parcelas</label>
            <input type="number" min="1" max="60" value={f.parcelas} onChange={s('parcelas')} />
          </div>
        </div>

        {mesInicio && valorParc > 0 && (
          <div className="alert alert-blue">
            {Number(f.parcelas) === 1
              ? `Lançado em ${mesLabel(mesInicio)} · à vista · ${fmt(valorParc)}`
              : `1ª parcela em ${mesLabel(mesInicio)} · ${fmt(valorParc)}/mês × ${f.parcelas}x = ${fmt(Number(f.valor_total))}`}
          </div>
        )}

        <div className="form-row" style={{ marginBottom: dividir ? 8 : 14 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input type="checkbox" checked={dividir} onChange={(e) => ligarDivisao(e.target.checked)} />
            Dividir em várias categorias (ex.: pedido do Mercado Livre)
          </label>
          {dividir && !gruposOk && (
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
              As partes serão gravadas, mas sem ficarem ligadas entre si. Para ligá-las, rode o SQL <code>inbox/19_compras_grupo.sql</code> no Supabase.
            </div>
          )}
        </div>

        {dividir && (
          <div style={{ marginBottom: 14 }}>
            {itens.map((it, i) => {
              const subs = categorias.find((c) => c.nome === it.categoria)?.subcategorias || []
              return (
                <div key={i} className="card" style={{ padding: 12, marginBottom: 8, overflow: 'visible' }}>
                  <div className="form-row cols2" style={{ marginBottom: 8 }}>
                    <div className="form-group">
                      <label>Parte {i + 1} · categoria</label>
                      <select value={it.categoria} onChange={(e) => trocarCategoria(i, e.target.value)}>
                        {categorias.map((c) => <option key={c.id}>{c.nome}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Subcategoria</label>
                      <select value={it.subcategoria} onChange={(e) => mudarItem(i, { subcategoria: e.target.value })}>
                        {subs.map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-row cols2" style={{ marginBottom: 8 }}>
                    <div className="form-group">
                      <label>Valor (R$)</label>
                      <input type="number" step="0.01" min="0" placeholder="0,00" value={it.valor} onChange={(e) => mudarItem(i, { valor: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>O que é (opcional)</label>
                      <input placeholder="Ex: ração, almofadas..." value={it.identificacao} onChange={(e) => mudarItem(i, { identificacao: e.target.value })} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => usarRestante(i)} disabled={!(Number(f.valor_total) > 0)}>Usar o que falta</button>
                    {itens.length > 2 && (
                      <button type="button" className="btn btn-danger" onClick={() => setItens((l) => l.filter((_, n) => n !== i))}>Remover parte</button>
                    )}
                  </div>
                </div>
              )
            })}
            <button type="button" className="btn btn-ghost btn-sm" onClick={novaParte}>+ Adicionar parte</button>
            <div className={`alert ${Number(f.valor_total) > 0 && errosDivisao.length === 0 ? 'alert-green' : 'alert-amber'}`} style={{ marginTop: 10, marginBottom: 0 }}>
              Partes somam {fmt(somaPartes(itens))} de {fmt(Number(f.valor_total) || 0)}
              {Number(f.valor_total) > 0 && (falta > 0 ? ` · faltam ${brl(falta)}` : falta < 0 ? ` · passou ${brl(falta)}` : ' · fechou ✓')}
            </div>
          </div>
        )}

        {!f.cartao_id && (
          <div className="form-row">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={f.pago} onChange={(e) => setF((p) => ({ ...p, pago: e.target.checked }))} />
              {Number(f.parcelas) > 1 ? 'A primeira parcela já foi paga' : 'Já paguei essa conta'}
            </label>
            {!f.pago && (
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>
                Sem cartão vinculado, cada parcela vai aparecer como pendência na aba Pagamentos até você marcá-la como paga.
              </div>
            )}
          </div>
        )}

        <div className="form-row">
          <div className="form-group">
            <label>Observação (opcional)</label>
            <input placeholder="Ex: Pedido Mercado Livre #123" value={f.obs} onChange={s('obs')} />
          </div>
        </div>

        {dividir && errosDivisao.length > 0 && Number(f.valor_total) > 0 && (
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -8, marginBottom: 14 }}>{errosDivisao[0]}</div>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{itensLancados > 0 && !emEdicao ? 'Concluir' : 'Cancelar'}</button>
          {!emEdicao && !dividir && (
            <button className="btn btn-ghost" onClick={() => save(false)} disabled={!ok}>
              {saving ? 'Salvando...' : '+ Salvar e lançar outro item'}
            </button>
          )}
          <button className="btn btn-primary" onClick={() => save(true)} disabled={!ok}>
            {saving ? 'Salvando...' : emEdicao ? 'Salvar alterações' : dividir ? 'Salvar compra dividida' : 'Salvar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}
