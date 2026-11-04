import { useState } from 'react'
import Comparativo from './Comparativo'
import { fmt, mesLabel, corPessoa } from '../../lib/utils'
import { MOTIVO, ROTULO_MOTIVO } from '../../lib/conciliacaoFatura'
import ParcelamentoPrevia from './ParcelamentoPrevia'
import { ehCompraDividida } from '../../lib/planoImportacao'
import { opcaoDaLinha } from '../../lib/parcelamentoImportacao'
import { gerarParcelas } from '../../lib/utils'

const dm = (d) => String(d || '').slice(0, 10).split('-').reverse().slice(0, 2).join('/')

function situacao(l) {
  if (l.grupo === 'ignorada') return ['badge-gray', 'Pagamento: não entra no total']
  if (l.grupo === 'registrada') {
    if (l.moverParaEstaFatura) return ['badge-blue', 'Será movida para esta fatura']
    if (l.decisao === 'atualizar') return ['badge-blue', 'Valor será atualizado']
    if (l.decisao === 'manter') return ['badge-gray', 'Mesma compra · valor mantido']
    if (l.fixoVinculado) return ['badge-blue', { passar: 'Conta fixa passa para este cartão', valor: 'Mesma conta fixa', nenhuma: 'Mesma conta fixa (como está)' }[l.fixoVinculado.acao]]
    return ['badge-green', l.confirmada ? 'Mesma compra (confirmada)' : 'Já registrada']
  }
  if (l.grupo === 'nova') return l.selecionada ? ['badge-blue', 'Nova · será importada'] : ['badge-gray', 'Nova · deixada de fora']
  if (l.adiada) return ['badge-amber', 'Revisar depois']
  return ['badge-amber', ROTULO_MOTIVO[l.motivos[0]] || 'Revisar']
}

export default function CartaoLinha({ l, aberto: abertoInicial, valorLinha, mesFatura, cartaoId, cartoes, fechamentos = [], categorias, pessoas, bancoV2, modoValor, acoes }) {
  const [aberto, setAberto] = useState(abertoInicial)
  const { atualizarLinha, decidir, escolherParcelamento, mudarCategoria } = acoes
  const [cor, texto] = situacao(l)
  const corr = l.correspondencia
  const nome = l.identificacao?.trim() || l.descricao
  const emAndamento = (Number(l.parcela_atual) || 1) > 1
  const parcelaEsperada = corr?.parcelaEsperada ?? (corr?.compra && mesFatura ? gerarParcelas(corr.compra, cartoes).find((p) => p.mes === mesFatura)?.num : undefined)
  const mesmoCartao = corr?.compra && corr.compra.cartao_id === cartaoId
  const motivo = l.motivos[0]
  const subs = categorias.find((c) => c.nome === l.categoria)?.subcategorias || []
  const dividida = ehCompraDividida(corr?.compra)
  const recorrente = acoes.recorrenciaDe?.(l) || null
  const fixoMarcado = recorrente ? acoes.fixoMarcado?.(l._id) : false
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
        <span className="imp-selos">{recorrente && <span className="badge badge-blue" title="Aparece todo mês: pode virar conta fixa">recorrente</span>}{l.pessoa && <span className={`badge badge-${corPessoa(pessoas, l.pessoa)}`} title="Pessoa do lançamento">{l.pessoa}</span>}<span className={`badge ${cor}`}>{texto}</span></span>
      </div>

      {aberto && (
        <div className="imp-linha-corpo">
          {l.grupo === 'revisao' && <p className="imp-explica">{MOTIVO[motivo]}{l.motivos.length > 1 ? ` (${l.motivos.slice(1).map((m) => ROTULO_MOTIVO[m].toLowerCase()).join(', ')})` : ''}</p>}

          {corr?.compra && l.grupo !== 'ignorada' && <Comparativo linha={l} valorLinha={valorLinha} mesFatura={mesFatura} parcelaEsperada={parcelaEsperada} />}

          {l.grupo === 'ignorada' && (
            <div className="imp-acoes">
              <span className="imp-explica">O app ignorou esta linha porque parece pagamento ou saldo da fatura anterior.</span>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => atualizarLinha(l._id, { naturezaManual: Number(l.valor) < 0 ? 'credito' : 'encargo' })}>Não é pagamento: contar na fatura</button>
            </div>
          )}
          {recorrente && l.grupo === 'nova' && (
            <label className="imp-recorrente">
              <input type="checkbox" checked={!!fixoMarcado} onChange={() => acoes.alternarFixo(l._id)} aria-label={`Cadastrar ${nome} também como conta fixa`} />
              <span><b>Parece uma cobrança recorrente</b> ({recorrente.ocorrencias} meses antes, perto de {fmt(recorrente.medio || recorrente.ultimo)}{recorrente.variavel ? ', valor variável' : ''}).<br />
                Cadastrar também como <b>conta fixa</b> a partir do mês seguinte? Esta cobrança entra como compra normal.</span>
            </label>
          )}
          {/* ações por tipo de pendência */}
          {l.grupo === 'revisao' && (motivo === 'correspondencia_provavel' || motivo === 'parcelamento_ambiguo') && (
            l.motivos.includes('parcelamento_ambiguo') ? (
              <>
                <p className="imp-explica" style={{ margin: 0 }}>Esta é a parcela {l.parcela_atual} de {l.parcela_total}. O aplicativo identificou um <b>possível parcelamento existente</b> ({corr.compra.identificacao || corr.compra.descricao}, {corr.compra.parcelas}x), mas o calendário dele não bate com esta fatura. Confirme se deseja vincular esta parcela a ele ou criar um novo parcelamento.</p>
                <div className="imp-acoes">{botao('Vincular a este parcelamento', 'mesma', { primario: true, dica: 'Não cria nada: a parcela fica ligada ao parcelamento existente' })}{botao('Criar novo parcelamento', 'outra', { dica: 'Trata como um parcelamento diferente e mostra as opções de registro' })}{botao('Revisar depois', 'depois')}</div>
              </>
            ) : (
              <div className="imp-acoes">{botao('É a mesma compra', 'mesma', { primario: true, dica: 'Vincula ao lançamento existente, sem criar outro' })}{botao('É outra compra', 'outra', { dica: 'Cria um novo lançamento' })}{botao('Revisar depois', 'depois')}</div>
            )
          )}
          {l.grupo === 'revisao' && l.fixoCandidato && (
            <>
              <p className="imp-explica" style={{ margin: 0 }}>
                {motivo === 'conta_fixa_valor'
                  ? <>Conta fixa <b>{l.fixoCandidato.nome}</b> deste cartão: cadastrada em <b>{fmt(l.fixoCandidato.valor)}</b>, a fatura traz <b>{fmt(valorLinha)}</b>.{l.fixoCandidato.variavel ? ' É uma conta de valor variável: o valor deste mês passa a ser o da fatura.' : ' O valor cadastrado é fixo: se o preço mudou, atualize em Contas fixas.'}</>
                  : <>Conta fixa <b>{l.fixoCandidato.nome}</b> ({fmt(l.fixoCandidato.valor)}) está cadastrada <b>fora do cartão</b>. Importar esta linha contaria a cobrança duas vezes.</>}
              </p>
              <div className="imp-acoes">
                {motivo === 'conta_fixa_valor'
                  ? botao(l.fixoCandidato.variavel ? `É a conta fixa: registrar ${fmt(valorLinha)} neste mês` : 'É a conta fixa (não importar)', 'mesma', { primario: true, dica: 'Vincula à conta fixa, sem criar outra compra' })
                  : <>{botao('Passar a conta fixa para este cartão', 'passar', { primario: true, dica: 'A conta fixa passa a ser cobrada neste cartão (vale para todos os meses) e a linha não é importada' })}{botao('É a mesma, deixar como está', 'mesma', { dica: 'Não importa a linha e não mexe na conta fixa' })}</>}
                {botao('É outra compra', 'outra', { dica: 'Importa como compra normal' })}
                {botao('Revisar depois', 'depois')}
              </div>
            </>
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
          {l.grupo === 'revisao' && (motivo === 'parcelamento_sem_registro' || motivo === 'parcelamento_inconsistente') && <ParcelamentoPrevia l={l} mesFatura={mesFatura} modoValor={modoValor} cartoes={cartoes} fechamentos={fechamentos} inconsistente={motivo === 'parcelamento_inconsistente'} escolher={escolherParcelamento} decidir={decidir} />}
          {l.grupo === 'revisao' && motivo === 'dados_incompletos' && <p className="imp-erro">Para importar, complete: {l.bloqueios.join(' · ')}.</p>}

          {l.decisao && l.grupo !== 'nova' && <button type="button" className="link-btn" onClick={() => decidir(l._id, null)}>desfazer minha decisão</button>}
          {l.decisao === 'outra' && <button type="button" className="link-btn" onClick={() => decidir(l._id, null)}>desfazer: voltar a comparar com o lançamento existente</button>}
          {l.grupo === 'nova' && opcaoDaLinha(l) && <p className="cad-sub" style={{ margin: 0 }}>Parcelamento: {opcaoDaLinha(l) === 'completo' ? 'será criado por completo' : 'será registrada só esta parcela'}. <button type="button" className="link-btn" onClick={() => escolherParcelamento(l._id, null)}>alterar a escolha</button></p>}

          {/* edição: só do que ainda pode virar lançamento */}
          {(l.grupo === 'nova' || motivo === 'dados_incompletos' || motivo === 'parcelamento_sem_registro') && (
            <div className="imp-campos">
              {l.grupo === 'nova' && <label className="imp-importar"><input type="checkbox" checked={l.incluir !== false} onChange={(e) => atualizarLinha(l._id, { incluir: e.target.checked, incluirManual: true })} /> Importar esta linha</label>}
              <details className="imp-editar" open={motivo === 'dados_incompletos'}>
                <summary>Editar dados da compra</summary>
                <div className="imp-grade-campos">
                <label>Nome (o que é) <span className="cad-sub">opcional</span><input value={l.identificacao} onChange={(e) => atualizarLinha(l._id, { identificacao: e.target.value, identificacaoSugerida: false })} placeholder={l.descricao} /></label>
                <label>Descrição no cartão<input value={l.descricao} onChange={(e) => atualizarLinha(l._id, { descricao: e.target.value })} /></label>
                <label>Data<input type="date" value={l.data} onChange={(e) => atualizarLinha(l._id, { data: e.target.value })} /></label>
                <label>Valor<input inputMode="decimal" value={l.valor} onChange={(e) => atualizarLinha(l._id, { valor: e.target.value })} /></label>
                <label>Categoria
                  <select value={l.categoria} onChange={(e) => mudarCategoria(l._id, e.target.value)}><option value="">Selecione…</option>{categorias.map((c) => <option key={c.id}>{c.nome}</option>)}</select>
                  {l.sugerida && <span className="cad-sub">sugerida {l.fonteSugestao === 'historico' ? 'pelo histórico' : 'pelo nome'}</span>}
                </label>
                <label>Subcategoria<select value={l.subcategoria} disabled={!l.categoria} onChange={(e) => atualizarLinha(l._id, { subcategoria: e.target.value, sugerida: false })}><option value="">{l.categoria ? 'Escolha a subcategoria…' : 'Escolha a categoria antes'}</option>{subs.map((s) => <option key={s}>{s}</option>)}</select></label>
                <label>Pessoa<select value={l.pessoa} onChange={(e) => atualizarLinha(l._id, { pessoa: e.target.value })}>{pessoas.map((p) => <option key={p.id}>{p.nome}</option>)}</select></label>
                <label>Observação<input value={l.observacao} onChange={(e) => atualizarLinha(l._id, { observacao: e.target.value })} /></label>
                </div>
              </details>
            </div>
          )}
          <p className="cad-sub imp-original">No cartão: {l.descricaoOriginal || l.descricao}</p>
        </div>
      )}
    </article>
  )
}
