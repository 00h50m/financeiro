import { useState } from 'react'
import { compilar } from '../lib/filtro'
import { lerNum } from '../lib/adiamentoPref'
import { CampoBusca, ResumoFiltro } from './FiltroLista'
import { Pilulas } from './NavMes'
import CampoDinheiro from './ui/CampoDinheiro'
import { addMonths, fmt, mesLabel, nowYM, tituloCompra } from '../lib/utils'
import { descricaoDoItem, parteTotal, resumoRepasses, saldoPorPessoa } from '../lib/divisoes'
import { confirmar, avisar, pedir } from '../lib/dialogos'
import Selo from './ui/Selo'
import Indicador from './ui/Indicador'
import EstadoVazio from './ui/EstadoVazio'
import { Lista, ItemLista } from './ui/Lista'

const brData = (iso) => (iso ? iso.split('-').reverse().join('/') : '')

function NovaDivisao({ store, onFeito }) {
  const { compras, fixos, divisoes, pessoas, cartoes = [], addDivisao } = store
  const [tipo, setTipo] = useState('compra')
  const [refId, setRefId] = useState('')
  const [pessoa, setPessoa] = useState('')
  const [modo, setModo] = useState('valor')
  const [valor, setValor] = useState('')
  const [obs, setObs] = useState('')
  const [busca, setBusca] = useState('')
  const [cartaoF, setCartaoF] = useState('')
  const [mesF, setMesF] = useState('')
  const [trocando, setTrocando] = useState(true) // lista de resultados aberta (enquanto nada foi escolhido)
  const nomeCartao = (id) => cartoes.find((c) => c.id === id)?.nome || ''

  // tudo que dá para dividir, já com o texto de busca; o limite de 300 acabou: a busca e os filtros acham qualquer compra
  const todos = tipo === 'compra'
    ? compras.map((c) => ({ id: c.id, titulo: tituloCompra(c), valor: Number(c.valor_total), parcelas: Number(c.parcelas) || 1, data: c.data_compra, cartaoId: c.cartao_id || '', mes: String(c.data_compra || '').slice(0, 7), extra: [c.categoria, c.pessoa, nomeCartao(c.cartao_id)].filter(Boolean).join(' · '), texto: [c.descricao, c.identificacao, c.categoria, c.subcategoria, c.pessoa, c.obs, nomeCartao(c.cartao_id)].filter(Boolean).join(' '), base: Number(c.valor_total) }))
    : fixos.filter((f) => f.ativo).map((f) => ({ id: f.id, titulo: f.nome, valor: Number(f.valor), parcelas: 1, data: null, cartaoId: f.cartao_id || '', mes: '', extra: [f.categoria, f.cartao_id ? nomeCartao(f.cartao_id) : ''].filter(Boolean).join(' · '), texto: [f.nome, f.categoria, f.subcategoria, nomeCartao(f.cartao_id)].filter(Boolean).join(' '), base: Number(f.valor) }))
  const { combina } = compilar(busca)
  const filtrados = todos
    .filter((i) => (!cartaoF || (cartaoF === '_sem' ? !i.cartaoId : i.cartaoId === cartaoF)) && (!mesF || i.mes === mesF) && combina({ texto: i.texto, valor: [i.valor], data: i.data }))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')) || a.titulo.localeCompare(b.titulo))
  const mesesDisponiveis = [...new Set(todos.map((i) => i.mes).filter(Boolean))].sort().reverse()
  const filtroLigado = !!(busca.trim() || cartaoF || mesF)
  const dividido = (id) => divisoes.filter((d) => d.tipo === tipo && d.ref_id === id)

  const item = todos.find((i) => i.id === refId)
  const nomes = [...new Set([...pessoas.map((p) => p.nome), ...divisoes.map((d) => d.pessoa)])].filter(Boolean)
  const nParc = item?.parcelas || 1
  const parcelada = tipo === 'compra' && nParc > 1
  const modoUso = modo === 'parcela' && !parcelada ? 'valor' : modo // "por parcela" só existe em compra parcelada
  const v = lerNum(valor)
  // "R$ 30 por parcela" é guardado como o total (30 × nº de parcelas): a divisão é sempre proporcional às parcelas
  const vTotal = modoUso === 'parcela' ? Math.round(v * nParc * 100) / 100 : v
  const modoGravar = modoUso === 'parcela' ? 'valor' : modoUso
  const parte = item && v > 0 ? parteTotal({ modo: modoGravar, valor: vTotal }, item.base) : 0
  const jaDividido = item ? dividido(item.id).reduce((s, d) => s + parteTotal(d, item.base), 0) : 0
  const excede = item && parte > 0 && jaDividido + parte > item.base + 0.005
  const valido = item && pessoa.trim() && v > 0 && (modoUso !== 'percentual' || v <= 100) && !excede

  function escolher(id) { setRefId(id); setTrocando(false); setValor(''); }
  function trocarTipo(t) { setTipo(t); setRefId(''); setTrocando(true); setBusca(''); setCartaoF(''); setMesF('') }
  async function salvar() {
    if (!valido) return
    const ok = await addDivisao({ tipo, ref_id: item.id, pessoa: pessoa.trim(), modo: modoGravar, valor: vTotal, observacao: obs.trim() || null })
    if (ok) { setRefId(''); setTrocando(true); setValor(''); setObs(''); onFeito?.() }
  }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 20 }}>
      <div className="section-label" style={{ marginTop: 0 }}>Nova divisão</div>

      <div className="dv-passo"><span className="dv-num">1</span> O que será dividido</div>
      <Pilulas rotulo="Tipo" valor={tipo} onChange={trocarTipo} opcoes={[['compra', 'Uma compra'], ['fixo', 'Uma conta fixa (ex.: convênio)']]} />

      {item && !trocando ? (
        <div className="dv-escolhida">
          <div>
            <b>{item.titulo}</b> <span className="mono">{fmt(item.base)}{tipo === 'fixo' ? ' por mês' : ''}</span>{parcelada && <span className="cad-sub"> · {nParc}× de {fmt(item.base / nParc)}</span>}
            <div className="cad-sub">{[item.data ? brData(item.data) : '', item.extra].filter(Boolean).join(' · ')}</div>
            {dividido(item.id).length > 0 && <div className="cad-sub">Já dividida: {dividido(item.id).map((d) => `${d.pessoa} ${d.modo === 'percentual' ? `${Number(d.valor)}%` : fmt(d.valor)}`).join(' · ')}</div>}
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setTrocando(true)}>Trocar</button>
        </div>
      ) : (
        <>
          <div className="dv-filtros">
            <CampoBusca valor={busca} onChange={setBusca} placeholder={tipo === 'compra' ? 'Buscar compra: nome, valor (149), data (01/08)…' : 'Buscar conta fixa…'} largura={360} />
            {tipo === 'compra' && (
              <>
                <select value={cartaoF} onChange={(e) => setCartaoF(e.target.value)} aria-label="Filtrar por cartão">
                  <option value="">Todos os cartões</option>
                  {cartoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  <option value="_sem">Sem cartão (Pix, dinheiro…)</option>
                </select>
                <select value={mesF} onChange={(e) => setMesF(e.target.value)} aria-label="Filtrar por mês">
                  <option value="">Qualquer mês</option>
                  {mesesDisponiveis.map((m) => <option key={m} value={m}>{mesLabel(m)}</option>)}
                </select>
              </>
            )}
            {tipo === 'fixo' && cartoes.length > 0 && (
              <select value={cartaoF} onChange={(e) => setCartaoF(e.target.value)} aria-label="Filtrar por cartão">
                <option value="">Todos</option>
                {cartoes.map((c) => <option key={c.id} value={c.id}>No cartão {c.nome}</option>)}
                <option value="_sem">Pagas à parte</option>
              </select>
            )}
            {filtroLigado && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setBusca(''); setCartaoF(''); setMesF('') }}>Limpar</button>}
          </div>
          <div className="cad-sub" role="status">{filtrados.length === 0 ? 'Nada encontrado com esses filtros.' : `${filtrados.length} ${tipo === 'compra' ? (filtrados.length === 1 ? 'compra' : 'compras') : (filtrados.length === 1 ? 'conta fixa' : 'contas fixas')}${filtrados.length > 40 ? ' — mostrando as 40 mais recentes; refine a busca' : ''}`}</div>
          <ul className="dv-resultados" aria-label="Resultados">
            {filtrados.slice(0, 40).map((i) => (
              <li key={i.id}>
                <button type="button" className={`dv-res${i.id === refId ? ' ativo' : ''}`} onClick={() => escolher(i.id)}>
                  <span className="dv-res-nome"><b>{i.titulo}</b><small>{[i.data ? brData(i.data) : '', i.extra].filter(Boolean).join(' · ')}</small></span>
                  <span className="mono">{fmt(i.base)}</span>
                  {dividido(i.id).length > 0 && <Selo tom="info">já dividida</Selo>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="dv-passo"><span className="dv-num">2</span> Quem paga a parte</div>
      <div className="dv-nomes">
        {nomes.map((n) => <button key={n} type="button" className={`btn btn-sm ${pessoa.trim() === n ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={pessoa.trim() === n} onClick={() => setPessoa(n)}>{n}</button>)}
      </div>
      <div className="form-group">
        <label htmlFor="dv-pessoa">Nome {nomes.length ? '(ou digite outro)' : ''}</label>
        <input id="dv-pessoa" list="dv-nomes" value={pessoa} onChange={(e) => setPessoa(e.target.value)} placeholder="ex.: Mãe" />
        <datalist id="dv-nomes">{nomes.map((n) => <option key={n} value={n} />)}</datalist>
      </div>

      <div className="dv-passo"><span className="dv-num">3</span> Quanto ela paga</div>
      <Pilulas rotulo="Como informar" valor={modoUso} onChange={(m) => { setModo(m); setValor('') }} opcoes={[['valor', parcelada ? 'Em reais (total da compra)' : `Em reais${tipo === 'fixo' ? ' (por mês)' : ''}`], ...(parcelada ? [['parcela', 'Em reais por parcela']] : []), ['percentual', 'Em porcentagem']]} />
      {parcelada && <p className="cad-sub" style={{ margin: '4px 0 8px' }}>Compra em {nParc}× de {fmt(item.base / nParc)}. A parte dela é dividida igualmente pelas parcelas. Para ela pagar <b>tudo</b>, use 100%.</p>}
      <div className="dv-valor-linha">
        <div className="form-group">
          <label htmlFor="dv-valor">{modoUso === 'valor' ? 'Valor (R$)' : modoUso === 'parcela' ? 'Valor por parcela (R$)' : 'Porcentagem (%)'}</label>
          {modoUso !== 'percentual'
            ? <CampoDinheiro id="dv-valor" value={valor} onChange={setValor} />
            : <CampoDinheiro id="dv-valor" value={valor} onChange={setValor} prefixo={null} casas={2} placeholder="50" />}
        </div>
        {item && (
          <div className="dv-atalhos" aria-label="Atalhos">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('percentual'); setValor('100') }}>Tudo dela (100%)</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('percentual'); setValor('50') }}>Metade (50%)</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('valor'); setValor(String(Math.max(0, Math.round((item.base - jaDividido) * 100) / 100))) }}>Tudo que sobra ({fmt(Math.max(0, item.base - jaDividido))})</button>
          </div>
        )}
      </div>
      <div className="form-group" style={{ marginBottom: 12 }}>
        <label htmlFor="dv-obs">Observação (opcional)</label>
        <input id="dv-obs" value={obs} onChange={(e) => setObs(e.target.value)} />
      </div>
      {item && parte > 0 && !excede && (
        <div className="alert alert-blue">
          {pessoa.trim() || 'A pessoa'} paga {fmt(parte)}{tipo === 'fixo' ? ' por mês' : ''}{parcelada ? <> no total (<b>{nParc}× de {fmt(parte / nParc)}</b>)</> : ''}; a sua parte fica {fmt(item.base - jaDividido - parte)}{tipo === 'fixo' ? ' por mês' : ''}{parcelada ? <> (<b>{nParc}× de {fmt((item.base - jaDividido - parte) / nParc)}</b>)</> : ''}.
        </div>
      )}
      {excede && <div className="alert alert-red">A soma das partes passa do valor total ({fmt(item.base)}). Diminua o valor.</div>}
      <button className="btn btn-primary" disabled={!valido} onClick={salvar}>Salvar divisão</button>
      {!valido && <span className="cad-sub" style={{ marginLeft: 10 }}>{!item ? 'Escolha a compra acima.' : !pessoa.trim() ? 'Diga quem paga a parte.' : !(v > 0) ? 'Informe quanto ela paga.' : ''}</span>}
    </div>
  )
}

export default function Divididos({ store }) {
  const { divisoes, divisoesOk, marcarRepasse, desmarcarRepasse, delDivisao } = store
  const [mes, setMes] = useState(nowYM())
  const [pessoaF, setPessoaF] = useState('') // '' = todas as pessoas
  const [situacaoF, setSituacaoF] = useState('') // '' | 'receber' | 'recebido'
  const [buscaL, setBuscaL] = useState('')
  const noInicio = !!store.inicioApp && mes <= store.inicioApp

  if (!divisoesOk) {
    return (
      <div className="page">
        <div className="alert alert-amber">
          <strong>Falta criar as tabelas de Divididos no banco.</strong> Rode o arquivo <code>inbox/18_divisoes.sql</code> no SQL Editor do Supabase e recarregue esta página.
        </div>
      </div>
    )
  }

  const r = resumoRepasses(store, mes)
  const meses = Array.from({ length: 37 }, (_, i) => addMonths(nowYM(), i - 24))
  const deve = saldoPorPessoa(store, meses)
  const totalDeve = Object.values(deve).reduce((s, x) => s + x, 0)
  // quem aparece nos filtros: quem tem divisão cadastrada (mesmo sem nada a receber agora)
  const pessoasDiv = [...new Set([...divisoes.map((d) => d.pessoa), ...r.itens.map((i) => i.pessoa)])].filter(Boolean).sort((x, y) => x.localeCompare(y, 'pt-BR'))
  const { combina } = compilar(buscaL)
  const filtroLigado = !!(pessoaF || situacaoF || buscaL.trim())
  const itensF = r.itens.filter((i) => (!pessoaF || i.pessoa === pessoaF)
    && (!situacaoF || (situacaoF === 'receber' ? !i.recebido : i.recebido))
    && combina({ texto: `${i.pessoa} ${i.descricao} ${i.divisao.observacao || ''}`, valor: [i.esperado, i.valorRecebido], data: null }))
  const somaF = (f) => Math.round(itensF.reduce((t, i) => t + f(i), 0) * 100) / 100
  const aReceberF = somaF((i) => (i.recebido ? 0 : i.esperado))
  const recebidoF = somaF((i) => i.valorRecebido || 0)
  const divisoesF = divisoes.filter((d) => (!pessoaF || d.pessoa === pessoaF) && combina({ texto: `${d.pessoa} ${descricaoDoItem(store, d)} ${d.observacao || ''}`, valor: [Number(d.valor)], data: null }))
  const pendentesF = itensF.filter((i) => !i.recebido)

  async function receber(i) {
    const t = await pedir(`Quanto ${i.pessoa} pagou de "${i.descricao}"? (R$)`, String(i.esperado).replace('.', ','))
    if (t === null) return
    const v = lerNum(t)
    if (!(v >= 0) || Number.isNaN(v)) return avisar('Valor inválido.\n\nDigite só números, com vírgula nos centavos (ex.: 312,40).')
    await marcarRepasse(i.divisao.id, mes, v)
  }
  // "ela pagou tudo": marca como recebidas, pelo valor esperado, todas as partes pendentes que estão na lista filtrada
  async function receberTodas() {
    const total = Math.round(pendentesF.reduce((t, i) => t + i.esperado, 0) * 100) / 100
    const quem = pessoaF || 'as pessoas da lista'
    if (!await confirmar({ titulo: 'Marcar como recebido', texto: `Marcar ${pendentesF.length} ${pendentesF.length === 1 ? 'parte' : 'partes'} de ${quem} em ${mesLabel(mes)} como recebidas, pelo valor esperado (${fmt(total)})?\n\nVocê pode desfazer cada uma depois.`, confirmar: 'Marcar como recebido' })) return
    for (const i of pendentesF) { const ok = await marcarRepasse(i.divisao.id, mes, i.esperado); if (ok === false) break }
  }

  return (
    <div className="page">
      <div className="alert alert-blue">
        Aqui você marca a parte de uma compra ou conta fixa que é de outra pessoa. A fatura e a conta continuam com o valor cheio; o teto e as
        categorias contam só a sua parte; e o que a pessoa te devolve só entra na sua receita quando você marcar como recebido.
      </div>

      <NovaDivisao store={store} />

      {pessoasDiv.length > 0 && (
        <div className="dv-quem" role="group" aria-label="Filtrar por pessoa">
          <button type="button" className={`dv-quem-card${!pessoaF ? ' ativo' : ''}`} aria-pressed={!pessoaF} onClick={() => setPessoaF('')}>
            <span>Todas</span><b className="mono">{fmt(totalDeve)}</b><small>a receber, todos os meses</small>
          </button>
          {pessoasDiv.map((n) => (
            <button key={n} type="button" className={`dv-quem-card${pessoaF === n ? ' ativo' : ''}`} aria-pressed={pessoaF === n} onClick={() => setPessoaF(pessoaF === n ? '' : n)}>
              <span>{n}</span><b className="mono">{fmt(deve[n] || 0)}</b><small>{(deve[n] || 0) > 0 ? 'deve, todos os meses' : 'nada a receber'}</small>
            </button>
          ))}
        </div>
      )}

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))} disabled={noInicio} title={noInicio ? `O app começou em ${mesLabel(store.inicioApp)}` : undefined} aria-label="Mês anterior">←</button>
        <strong style={{ minWidth: 110, textAlign: 'center' }}>{mesLabel(mes)}</strong>
        <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">→</button>
        <CampoBusca valor={buscaL} onChange={setBuscaL} placeholder="Buscar nas partes e divisões…" largura={260} />
        <Pilulas rotulo="Situação" valor={situacaoF} onChange={setSituacaoF} opcoes={[['', 'Todas'], ['receber', 'A receber'], ['recebido', 'Recebidas']]} />
      </div>

      <div className="indicadores">
        <Indicador rotulo={`A receber neste mês${pessoaF ? ` · ${pessoaF}` : ''}`} valor={fmt(filtroLigado ? aReceberF : r.aReceber)} tom="aviso" />
        <Indicador rotulo={`Recebido neste mês${pessoaF ? ` · ${pessoaF}` : ''}`} valor={fmt(filtroLigado ? recebidoF : r.recebido)} tom="ok" />
        <Indicador rotulo={pessoaF ? `${pessoaF} deve (todos os meses)` : 'A receber (todos os meses)'} valor={fmt(pessoaF ? deve[pessoaF] || 0 : totalDeve)} />
      </div>
      <ResumoFiltro ativo={filtroLigado} mostrando={itensF.length} total={r.itens.length} onLimpar={() => { setPessoaF(''); setSituacaoF(''); setBuscaL('') }} />

      <div className="section-label">{mesLabel(mes)}</div>
      {r.itens.length === 0 ? (
        <EstadoVazio titulo="Nenhuma parte de outras pessoas neste mês" texto="Quando você dividir uma compra ou conta fixa, a parte de cada pessoa aparece aqui." />
      ) : itensF.length === 0 ? (
        <EstadoVazio titulo="Nada com esses filtros" texto="Tente outra pessoa, outra situação ou limpe a busca." acao="Limpar filtros" aoClicar={() => { setPessoaF(''); setSituacaoF(''); setBuscaL('') }} />
      ) : (
        <div className="card">
          {pendentesF.length > 1 && (
            <div className="dv-lote">
              <span className="cad-sub">{pendentesF.length} partes a receber{pessoaF ? ` de ${pessoaF}` : ''}</span>
              <button type="button" className="btn btn-primary btn-sm" onClick={receberTodas}>{pessoaF ? `${pessoaF} pagou tudo` : 'Marcar todas como recebidas'}</button>
            </div>
          )}
          <Lista rotulo={`Partes a receber em ${mesLabel(mes)}`}>
            {itensF.map((i) => (
              <ItemLista key={i.divisao.id} titulo={`${i.pessoa} · ${i.descricao}`} valor={fmt(i.recebido ? i.valorRecebido : i.esperado)} tomValor={i.recebido ? 'ok' : undefined}
                selos={<>{i.parcela && <Selo tom="neutro">{`parcela ${i.parcela.num}/${i.parcela.total}`}</Selo>}{i.recebido ? <Selo tom="ok">{`recebido${i.recebidoEm ? ` em ${brData(i.recebidoEm)}` : ''}`}</Selo> : <Selo tom="aviso">a receber</Selo>}</>}
                meta={i.divisao.observacao ? <span>{i.divisao.observacao}</span> : null}
                acoes={i.recebido
                  ? <button className="btn btn-ghost btn-sm" onClick={() => desmarcarRepasse(i.divisao.id, mes)}>Desfazer<span className="so-leitor"> recebimento de {i.pessoa}</span></button>
                  : <button className="btn btn-primary btn-sm" onClick={() => receber(i)}>Recebi<span className="so-leitor"> de {i.pessoa}</span></button>} />
            ))}
          </Lista>
        </div>
      )}

      <div className="section-label" style={{ marginTop: 24 }}>Divisões cadastradas{pessoaF ? ` · ${pessoaF}` : ''}</div>
      {divisoes.length === 0 ? (
        <EstadoVazio titulo="Nenhuma divisão cadastrada ainda" texto="Use o formulário acima para dividir uma compra ou conta fixa com outra pessoa." />
      ) : divisoesF.length === 0 ? (
        <EstadoVazio titulo="Nenhuma divisão com esses filtros" texto="Tente outra pessoa ou limpe a busca." />
      ) : (
        <div className="card">
          <Lista rotulo="Divisões cadastradas">
            {divisoesF.map((d) => (
              <ItemLista key={d.id} titulo={`${d.pessoa} · ${descricaoDoItem(store, d)}`} selos={<Selo tom="neutro">{d.tipo === 'fixo' ? 'conta fixa' : 'compra'}</Selo>}
                meta={(() => { const c = d.tipo === 'compra' ? (store.compras || []).find((x) => x.id === d.ref_id) : null; const n = Number(c?.parcelas) || 1; return n > 1 ? <span>em {n}× · ela paga {fmt(parteTotal(d, Number(c.valor_total)) / n)} por parcela (total {fmt(parteTotal(d, Number(c.valor_total)))})</span> : null })()}
                valor={`${d.modo === 'percentual' ? `${Number(d.valor)}%` : fmt(d.valor)}${d.tipo === 'fixo' ? ' /mês' : ''}`}
                acoes={<button className="btn btn-danger fx-remover" onClick={async () => { if (await confirmar(`Apagar a divisão com ${d.pessoa}? Os valores já recebidos dela também somem.`)) delDivisao(d) }} aria-label={`Apagar divisão com ${d.pessoa}`}>Apagar</button>} />
            ))}
          </Lista>
        </div>
      )}
    </div>
  )
}
