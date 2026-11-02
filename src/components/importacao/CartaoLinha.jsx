import { useState } from 'react'
import Comparativo from './Comparativo'
import { fmt, mesLabel } from '../../lib/utils'
import { MOTIVO } from '../../lib/conciliacaoFatura'
import { previaParcelamento, ehCompraDividida } from '../../lib/planoImportacao'
import { gerarParcelas } from '../../lib/utils'

const dm = (d) => String(d || '').slice(0, 10).split('-').reverse().slice(0, 2).join('/')
const ROTULO_MOTIVO = {
  correspondencia_provavel: 'Parece já lançada', valor_diferente: 'Valor diferente', parcelamento_ambiguo: 'Parcela diferente do esperado',
  parcelamento_sem_registro: 'Parcelamento não está no app', outra_fatura: 'Está em outra fatura', dados_incompletos: 'Faltam dados',
}

function situacao(l) {
  if (l.grupo === 'ignorada') return ['badge-gray', 'Pagamento: não entra no total']
  if (l.grupo === 'registrada') {
    if (l.moverParaEstaFatura) return ['badge-blue', 'Será movida para esta fatura']
    if (l.decisao === 'atualizar') return ['badge-blue', 'Valor será atualizado']
    if (l.decisao === 'manter') return ['badge-gray', 'Mesma compra · valor mantido']
    return ['badge-green', l.confirmada ? 'Mesma compra (confirmada)' : 'Já registrada']
  }
  if (l.grupo === 'nova') return l.selecionada ? ['badge-blue', 'Nova · será importada'] : ['badge-gray', 'Nova · deixada de fora']
  if (l.adiada) return ['badge-amber', 'Revisar depois']
  return ['badge-amber', ROTULO_MOTIVO[l.motivos[0]] || 'Revisar']
}

export default function CartaoLinha({ l, aberto: abertoInicial, valorLinha, mesFatura, cartaoId, cartoes, categorias, pessoas, bancoV2, modoValor, acoes }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const { atualizarLinha, decidir, confirmarParcelamento, mudarCategoria } = acoes
  const [cor, texto] = situacao(l)
  const corr = l.correspondencia
  const nome = l.identificacao?.trim() || l.descricao
  const emAndamento = (Number(l.parcela_atual) || 1) > 1
  const parcelaEsperada = corr?.parcelaEsperada ?? (corr?.compra && mesFatura ? gerarParcelas(corr.compra, cartoes).find((p) => p.mes === mesFatura)?.num : undefined)
  const mesmoCartao = corr?.compra && corr.compra.cartao_id === cartaoId
  const motivo = l.motivos[0]
  const subs = categorias.find((c) => c.nome === l.categoria)?.subcategorias || []
  const dividida = ehCompraDividida(corr?.compra)
  const botao = (rotulo, decisao, extra = {}) => (
    <button key={decisao + rotulo} type="button" className={`btn btn-sm ${extra.primario ? 'btn-primary' : 'btn-ghost'}`} disabled={extra.desabilitado} title={extra.dica} onClick={() => decidir(l._id, decisao)}>{rotulo}</button>
  )

  return (
    <article className={`imp-linha ${l.grupo} ${aberto ? 'aberta' : ''}`}>
      <button type="button" className="imp-linha-topo" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
        <span className="imp-data">{dm(l.data)}</span>
        <span className="imp-nome">
          <b>{nome}</b>
          {(l.descricaoOriginal || '').trim() && l.descricaoOriginal.trim().toLowerCase() !== nome.toLowerCase() && <small>{l.descricaoOriginal}</small>}
        </span>
        <span className="imp-valor mono" style={{ color: Number(l.valor) < 0 ? 'var(--green)' : undefined }}>{fmt(valorLinha)}</span>
      </button>
      <div className="imp-linha-meta">
        <span className="cad-sub">{l.categoria ? `${l.categoria}${l.subcategoria ? ` › ${l.subcategoria}` : ''}` : 'sem categoria'}{emAndamento ? ` · parcela ${l.parcela_atual}/${l.parcela_total}` : Number(l.parcela_total) > 1 ? ` · 1/${l.parcela_total}` : ''}{l.natureza === 'credito' ? ' · estorno/crédito' : l.natureza === 'encargo' ? ' · encargo' : ''}{l.repetidaNoArquivo ? ' · repetida no arquivo' : ''}</span>
        <span className={`badge ${cor}`}>{texto}</span>
      </div>

      {aberto && (
        <div className="imp-linha-corpo">
          {l.grupo === 'revisao' && <p className="imp-explica">{MOTIVO[motivo]}{l.motivos.length > 1 ? ` (${l.motivos.slice(1).map((m) => ROTULO_MOTIVO[m].toLowerCase()).join(', ')})` : ''}</p>}

          {corr?.compra && l.grupo !== 'ignorada' && <Comparativo linha={l} valorLinha={valorLinha} mesFatura={mesFatura} parcelaEsperada={parcelaEsperada} />}

          {/* ações por tipo de pendência */}
          {l.grupo === 'revisao' && (motivo === 'correspondencia_provavel' || motivo === 'parcelamento_ambiguo') && (
            <div className="imp-acoes">{botao('É a mesma compra', 'mesma', { primario: true, dica: 'Vincula ao lançamento existente, sem criar outro' })}{botao('É outra compra', 'outra', { dica: 'Cria um novo lançamento' })}{botao('Revisar depois', 'depois')}</div>
          )}
          {l.grupo === 'revisao' && motivo === 'valor_diferente' && (
            <>
              <div className="imp-acoes">
                {botao('Manter o valor lançado', 'manter', { dica: 'É a mesma compra; o valor no app não muda e a diferença continua na conciliação' })}
                {botao(`Atualizar para ${fmt(valorLinha)}`, 'atualizar', { primario: true, desabilitado: !bancoV2 || dividida, dica: dividida ? 'Compra dividida em categorias: edite em Compras' : !bancoV2 ? 'Rode o inbox/38 no Supabase para atualizar valores' : 'Muda o valor da compra lançada para o da fatura' })}
                {botao('É outra compra', 'outra')}{botao('Revisar depois', 'depois')}
              </div>
              <p className="cad-sub">Manter não muda nada no app. Atualizar altera o valor da compra lançada (fica na auditoria). Outra compra cria um lançamento novo e deixa a existente sem par na fatura.</p>
            </>
          )}
          {l.grupo === 'revisao' && motivo === 'outra_fatura' && (
            <div className="imp-acoes">
              {botao('Colocar nesta fatura', 'mover', { primario: true, desabilitado: !bancoV2 || !mesmoCartao, dica: !mesmoCartao ? 'A compra é de outro cartão' : !bancoV2 ? 'Rode o inbox/38 no Supabase para mover compras de fatura' : `Passa a contar na fatura de ${mesLabel(mesFatura)}` })}
              {botao('Deixar como está', 'mesma', { dica: 'É a mesma compra e fica na outra fatura' })}{botao('Revisar depois', 'depois')}
            </div>
          )}
          {l.grupo === 'revisao' && motivo === 'parcelamento_sem_registro' && (() => {
            const p = previaParcelamento(l, mesFatura, modoValor)
            return (
              <div className="imp-previa-parcela">
                <p><b>Esta é a parcela {p.parcelaAtual} de {p.total}</b> ({fmt(p.valorParcela)} cada) e não encontrei esse parcelamento no app.</p>
                <p className="cad-sub">Se confirmar, o app registra o parcelamento inteiro: {p.anteriores} parcela{p.anteriores === 1 ? '' : 's'} anterior{p.anteriores === 1 ? '' : 'es'} no passado ({mesLabel(p.primeiraParcela)}{p.anteriores > 1 ? ' em diante' : ''}) e {p.restantes} daqui para frente, até {mesLabel(p.ultimaParcela)}. Total {fmt(p.valorTotal)}. A data da compra original não consta na fatura: usamos o dia 1 do mês da primeira parcela (estimada).</p>
                <div className="imp-acoes">
                  <button type="button" className="btn btn-sm btn-primary" onClick={() => confirmarParcelamento(l._id, true)}>Confirmar parcelamento</button>
                  {botao('Revisar depois', 'depois')}
                </div>
              </div>
            )
          })()}
          {l.grupo === 'revisao' && motivo === 'dados_incompletos' && <p className="imp-erro">Para importar, complete: {l.bloqueios.join(' · ')}.</p>}

          {l.decisao && l.grupo !== 'nova' && <button type="button" className="link-btn" onClick={() => decidir(l._id, null)}>desfazer minha decisão</button>}
          {l.decisao === 'outra' && <button type="button" className="link-btn" onClick={() => decidir(l._id, null)}>desfazer: voltar a comparar com o lançamento existente</button>}
          {l.parcelamentoConfirmado && l.grupo === 'nova' && <button type="button" className="link-btn" onClick={() => confirmarParcelamento(l._id, false)}>desfazer a confirmação do parcelamento</button>}

          {/* edição: só do que ainda pode virar lançamento */}
          {(l.grupo === 'nova' || motivo === 'dados_incompletos' || motivo === 'parcelamento_sem_registro') && (
            <div className="imp-campos">
              <label className="imp-importar"><input type="checkbox" checked={l.incluir !== false} onChange={(e) => atualizarLinha(l._id, { incluir: e.target.checked, incluirManual: true })} /> Importar esta linha</label>
              <div className="imp-grade-campos">
                <label>Nome (o que é) <span className="cad-sub">opcional</span><input value={l.identificacao} onChange={(e) => atualizarLinha(l._id, { identificacao: e.target.value, identificacaoSugerida: false })} placeholder={l.descricao} /></label>
                <label>Descrição no cartão<input value={l.descricao} onChange={(e) => atualizarLinha(l._id, { descricao: e.target.value })} /></label>
                <label>Data<input type="date" value={l.data} onChange={(e) => atualizarLinha(l._id, { data: e.target.value })} /></label>
                <label>Valor<input inputMode="decimal" value={l.valor} onChange={(e) => atualizarLinha(l._id, { valor: e.target.value })} /></label>
                <label>Categoria
                  <select value={l.categoria} onChange={(e) => mudarCategoria(l._id, e.target.value)}><option value="">Selecione…</option>{categorias.map((c) => <option key={c.id}>{c.nome}</option>)}</select>
                  {l.sugerida && <span className="cad-sub">sugerida {l.fonteSugestao === 'historico' ? 'pelo histórico' : 'pelo nome'}</span>}
                </label>
                <label>Subcategoria<select value={l.subcategoria} disabled={!l.categoria} onChange={(e) => atualizarLinha(l._id, { subcategoria: e.target.value, sugerida: false })}>{subs.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Pessoa<select value={l.pessoa} onChange={(e) => atualizarLinha(l._id, { pessoa: e.target.value })}>{pessoas.map((p) => <option key={p.id}>{p.nome}</option>)}</select></label>
                <label>Observação<input value={l.observacao} onChange={(e) => atualizarLinha(l._id, { observacao: e.target.value })} /></label>
              </div>
            </div>
          )}
          <p className="cad-sub imp-original">No cartão: {l.descricaoOriginal || l.descricao}</p>
        </div>
      )}
    </article>
  )
}
