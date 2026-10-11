import { useMemo, useState } from 'react'
import { fmt, fmtK, mesLabel, nowYM, addMonths, nomeCasa, hojeSP } from '../lib/utils'
import { rendaXDespesas, categoriasDoMes, evolucaoDaCategoria, categoriasComGasto, gastoPorPessoa, composicaoDosMeses, quitacaoDosMeses, projecao, sobraAcumulada, anoAAno, progressoDasMetas } from '../lib/graficos'
import { CartaoGrafico, SERIE } from './graficos/base'
import Colunas from './graficos/Colunas'
import Barras from './graficos/Barras'
import Linha from './graficos/Linha'
import { Pilulas } from './NavMes'

const PERIODOS = [[3, '3 meses'], [6, '6 meses'], [12, '12 meses']]
const TEMAS = [['geral', 'Visão geral'], ['categorias', 'Categorias'], ['futuro', 'Futuro'], ['pessoas', 'Pessoas e metas']]

export default function Graficos({ store }) {
  const hoje = nowYM()
  const [n, setN] = useState(() => { try { return Number(localStorage.getItem('graficos_periodo')) || 6 } catch { return 6 } })
  const mudarN = (v) => { setN(v); try { localStorage.setItem('graficos_periodo', String(v)) } catch { /* sem armazenamento */ } }
  const [mes, setMes] = useState(hoje)
  const [cat, setCat] = useState('')
  const [tema, setTema] = useState(() => { try { const t = localStorage.getItem('graficos_tema'); return TEMAS.some(([v]) => v === t) ? t : 'geral' } catch { return 'geral' } })
  const mudarTema = (v) => { setTema(v); try { localStorage.setItem('graficos_tema', v) } catch { /* sem armazenamento */ } }

  const d = store
  const rx = useMemo(() => rendaXDespesas(d, hoje, n), [d, hoje, n])
  const cats = useMemo(() => categoriasDoMes(d, mes, 8), [d, mes])
  const listaCats = useMemo(() => categoriasComGasto(d, hoje, 12), [d, hoje])
  const catEscolhida = cat && listaCats.includes(cat) ? cat : listaCats[0] || ''
  const evo = useMemo(() => (catEscolhida ? evolucaoDaCategoria(d, catEscolhida, hoje, n) : null), [d, catEscolhida, hoje, n])
  const quit = useMemo(() => quitacaoDosMeses(d, hoje, 12), [d, hoje])
  const pess = useMemo(() => gastoPorPessoa(d, hoje, n), [d, hoje, n])
  const comp = useMemo(() => composicaoDosMeses(d, hoje, n), [d, hoje, n])
  const proj = useMemo(() => projecao(d, hoje, n), [d, hoje, n])
  const acum = useMemo(() => sobraAcumulada(d, hoje, 12), [d, hoje])
  const ano = Number(hoje.slice(0, 4))
  const aa = useMemo(() => anoAAno(d, ano, hoje), [d, ano, hoje])
  const metasProg = useMemo(() => progressoDasMetas(d, hojeSP()), [d])

  const temAlgo = rx.some((m) => m.temDados)
  const serieRD = [{ nome: 'Renda', cor: SERIE[0] }, { nome: 'Despesas', cor: SERIE[1] }]
  const seriePessoas = pess.nomes.map((nome, i) => ({ nome, cor: SERIE[i % SERIE.length] }))
  const serieComp = [{ nome: 'Contas fixas', cor: SERIE[0] }, { nome: 'Contas variáveis', cor: SERIE[1] }, { nome: 'Compras e parcelas', cor: SERIE[2] }]
  const totalQuit = quit.reduce((t, m) => t + m.total, 0)
  const mediaSobra = (() => { const v = rx.filter((m) => m.temDados); return v.length ? v.reduce((t, m) => t + m.sobra, 0) / v.length : 0 })()

  return (
    <div className="page graficos">
      <div className="pag-topo">
        <Pilulas rotulo="Assunto dos gráficos" valor={tema} onChange={mudarTema} opcoes={TEMAS} />
        <Pilulas rotulo="Período" valor={String(n)} onChange={(v) => mudarN(Number(v))} opcoes={PERIODOS.map(([v, r]) => [String(v), r])} />
      </div>
      <div className="gr-nota">Mesmos números do Dashboard e da Evolução · meses fechados usam o valor gravado no fechamento</div>

      {!temAlgo && <div className="alert alert-blue">Ainda não há renda nem gastos nesse período para desenhar. Cadastre a renda e lance compras, e os gráficos aparecem aqui.</div>}

      {tema === 'futuro' && (
        <CartaoGrafico
          titulo="Projeção: quanto sobra nos próximos meses"
          sub="Se nada mudar: o que já está comprometido (parcelas, contas fixas, faturas) mais o gasto à vista médio dos últimos 3 meses. É uma estimativa, não uma garantia."
          legenda={serieRD}
          tabela={{ cabecalhos: ['Mês', 'Renda', 'Comprometido', 'À vista (estimado)', 'Despesas', 'Sobra', 'Sobra acumulada'], linhas: proj.map((m) => [mesLabel(m.mes) + (m.rendaEstimada ? '*' : ''), fmt(m.renda), fmt(m.comprometido), fmt(m.aVistaEstimado), fmt(m.despesas), fmt(m.sobra), fmt(m.acumulada)]) }}
        >
          <Colunas series={[{ nome: 'Renda', cor: SERIE[0] }, { nome: 'Despesas projetadas', cor: SERIE[1] }]}
            meses={proj.map((m) => ({ rotulo: m.mes, valores: [m.renda, m.despesas], extra: [{ nome: 'Já comprometido', valor: m.comprometido }, { nome: 'À vista estimado', valor: m.aVistaEstimado }, { nome: 'Sobra', valorTxt: (m.sobra < 0 ? '− ' : '') + fmt(Math.abs(m.sobra)) }, { nome: 'Sobra acumulada', valorTxt: (m.acumulada < 0 ? '− ' : '') + fmt(Math.abs(m.acumulada)) }] }))}
            tituloBalao={(m) => mesLabel(m.rotulo) + ' (projeção)'} />
          {proj.some((m) => m.rendaEstimada) && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>* Meses sem renda cadastrada usam a última renda conhecida.</div>}
        </CartaoGrafico>
      )}

      {tema === 'geral' && (
        <CartaoGrafico
          titulo="Renda e despesas mês a mês"
          sub={temAlgo ? `Sobra média de ${fmt(mediaSobra)} por mês no período. Passe o mouse (ou toque) em um mês para ver renda, despesas e sobra.` : undefined}
          legenda={serieRD}
          tabela={{ cabecalhos: ['Mês', 'Renda', 'Despesas', 'Sobra'], linhas: rx.map((m) => [mesLabel(m.mes), fmt(m.renda), fmt(m.despesas), fmt(m.sobra)]) }}
        >
          <Colunas series={serieRD} meses={rx.map((m) => ({ rotulo: m.mes, valores: [m.renda, m.despesas], extra: [{ nome: 'Sobra', valorTxt: (m.sobra < 0 ? '− ' : '') + fmt(Math.abs(m.sobra)) }] }))} tituloBalao={(m) => mesLabel(m.rotulo)} />
        </CartaoGrafico>
      )}

      {tema === 'categorias' && (
        <CartaoGrafico
          titulo="Para onde vai o dinheiro"
          sub={`${mesLabel(mes)} · total de ${fmt(cats.total)} (parcelas do mês e contas fixas por categoria).`}
          acoes={(
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, -1))} aria-label="Mês anterior">←</button>
              <b style={{ fontSize: 13, minWidth: 54, textAlign: 'center' }}>{mesLabel(mes)}</b>
              <button className="btn btn-ghost btn-sm" onClick={() => setMes(addMonths(mes, 1))} aria-label="Próximo mês">→</button>
            </span>
          )}
          tabela={{ cabecalhos: ['Categoria', 'Valor', '% do total'], linhas: cats.itens.map((c) => [c.nome, fmt(c.valor), String(c.pct).replace('.', ',') + '%']) }}
        >
          {cats.itens.length ? <Barras itens={cats.itens} /> : <div className="empty" style={{ padding: 24 }}>Nenhum gasto em {mesLabel(mes)}.</div>}
        </CartaoGrafico>
      )}

      {tema === 'categorias' && (
        <CartaoGrafico
          titulo="Evolução de uma categoria"
          sub={evo?.teto > 0 ? `A linha vermelha é o teto do Orçamento (${fmt(evo.teto)}).` : 'Escolha a categoria; se ela tiver teto no Orçamento, ele aparece como referência.'}
          acoes={listaCats.length > 0 && (
            <select value={catEscolhida} onChange={(e) => setCat(e.target.value)} aria-label="Categoria" style={{ width: 190 }}>
              {listaCats.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          tabela={evo && { cabecalhos: ['Mês', catEscolhida], linhas: evo.pontos.map((p) => [mesLabel(p.mes), fmt(p.valor)]) }}
        >
          {evo ? <Linha pontos={evo.pontos} referencia={evo.teto > 0 ? { valor: evo.teto, rotulo: 'teto ' + fmtK(evo.teto) } : null} nome={catEscolhida} /> : <div className="empty" style={{ padding: 24 }}>Sem gastos categorizados para mostrar.</div>}
        </CartaoGrafico>
      )}

      {tema === 'futuro' && (
        <CartaoGrafico
          titulo="Parcelas que caem nos próximos 12 meses"
          sub={totalQuit > 0 ? `${fmt(totalQuit)} em parcelas já lançadas. Quando a coluna baixa, algum parcelamento acabou e liberou orçamento.` : 'Nenhuma parcela futura lançada.'}
          tabela={{ cabecalhos: ['Mês', 'Parcelas', 'Compras', 'Acabam'], linhas: quit.map((m) => [mesLabel(m.mes), fmt(m.total), String(m.qtd), m.terminam.map((c) => c.identificacao || c.descricao).join(', ') || '—']) }}
        >
          <Colunas series={[{ nome: 'Parcelas do mês', cor: SERIE[0] }]} meses={quit.map((m) => ({ rotulo: m.mes, valores: [m.total], extra: [{ nome: 'Compras com parcela', valorTxt: String(m.qtd) }, ...(m.terminam.length ? [{ nome: 'Acabam', valorTxt: m.terminam.map((c) => c.identificacao || c.descricao).join(', ').slice(0, 40) }] : [])] }))} tituloBalao={(m) => mesLabel(m.rotulo)} />
        </CartaoGrafico>
      )}

      {tema === 'pessoas' && pess.nomes.length > 0 && (
        <CartaoGrafico
          titulo="Gasto por pessoa"
          sub={`Parcelas e contas fixas de cada um (${nomeCasa(store.pessoas || [])} = contas sem dono).`}
          legenda={seriePessoas}
          tabela={{ cabecalhos: ['Mês', ...pess.nomes], linhas: pess.meses.map((m) => [mesLabel(m.mes), ...pess.nomes.map((nome) => fmt(m.valores[nome] || 0))]) }}
        >
          <Colunas series={seriePessoas} meses={pess.meses.map((m) => ({ rotulo: m.mes, valores: pess.nomes.map((nome) => m.valores[nome] || 0) }))} tituloBalao={(m) => mesLabel(m.rotulo)} />
        </CartaoGrafico>
      )}

      {tema === 'categorias' && (
        <CartaoGrafico
          titulo="Contas fixas, variáveis e compras"
          sub="Quanto do mês já está travado em contas fixas e quanto é compra/parcela. Contas variáveis usam o valor real quando informado, senão a estimativa."
          legenda={serieComp}
          tabela={{ cabecalhos: ['Mês', 'Contas fixas', 'Contas variáveis', 'Compras e parcelas'], linhas: comp.map((m) => [mesLabel(m.mes), fmt(m.fixas), fmt(m.variaveis), fmt(m.compras)]) }}
        >
          <Colunas empilhado series={serieComp} meses={comp.map((m) => ({ rotulo: m.mes, valores: [m.fixas, m.variaveis, m.compras] }))} tituloBalao={(m) => mesLabel(m.rotulo)} />
        </CartaoGrafico>
      )}

      {tema === 'geral' && (
        <CartaoGrafico
          titulo="Sobra acumulada"
          sub="Soma da sobra de cada mês, desde o início do período: mostra se, no total, você está guardando ou consumindo reserva."
          tabela={{ cabecalhos: ['Mês', 'Sobra do mês', 'Acumulada'], linhas: acum.filter((m) => m.temDados).map((m) => [mesLabel(m.mes), fmt(m.sobra), fmt(m.acumulada)]) }}
        >
          <Linha pontos={acum.map((m) => ({ mes: m.mes, valor: m.acumulada }))} nome="Sobra acumulada" />
        </CartaoGrafico>
      )}

      {tema === 'geral' && (
        <CartaoGrafico
          titulo={`Despesas: ${ano} contra ${ano - 1}`}
          sub="Mês a mês, para ver se o ano está mais caro ou mais barato que o anterior (meses sem dados ficam vazios)."
          legenda={[{ nome: String(ano - 1), cor: SERIE[1] }, { nome: String(ano), cor: SERIE[0] }]}
          tabela={{ cabecalhos: ['Mês', String(ano - 1), String(ano)], linhas: aa.map((m) => [mesLabel(`${ano}-${String(m.mes).padStart(2, '0')}`).slice(0, 3), m.anterior == null ? '—' : fmt(m.anterior), m.atual == null ? '—' : fmt(m.atual)]) }}
        >
          <Colunas series={[{ nome: String(ano - 1), cor: SERIE[1] }, { nome: String(ano), cor: SERIE[0] }]}
            meses={aa.map((m) => ({ rotulo: `${ano}-${String(m.mes).padStart(2, '0')}`, valores: [m.anterior || 0, m.atual || 0] }))}
            tituloBalao={(m) => mesLabel(m.rotulo).slice(0, 3)} />
        </CartaoGrafico>
      )}

      {tema === 'pessoas' && metasProg.length > 0 && (
        <CartaoGrafico
          titulo="Progresso das metas"
          sub="Quanto já foi guardado em relação ao alvo de cada meta."
          tabela={{ cabecalhos: ['Meta', 'Guardado', 'Alvo', '%'], linhas: metasProg.map((m) => [m.nome, fmt(m.saldo), fmt(m.alvo), m.pct + '%']) }}
        >
          <div>
            {metasProg.map((m) => (
              <div key={m.nome} style={{ margin: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, gap: 8, flexWrap: 'wrap' }}>
                  <span>{m.nome}{m.atingida && <span className="badge badge-green" style={{ marginLeft: 8, fontSize: 10 }}>atingida</span>}</span>
                  <span className="mono" style={{ color: 'var(--text2)' }}>{fmt(m.saldo)} de {fmt(m.alvo)} · <b style={{ color: 'var(--text)' }}>{m.pct}%</b></span>
                </div>
                <div className="prog-bar" style={{ marginTop: 6 }} role="progressbar" aria-valuenow={m.pct} aria-valuemin={0} aria-valuemax={100} aria-label={m.nome}>
                  <div className="prog-fill" style={{ width: m.pct + '%', background: 'var(--serie-3)' }} />
                </div>
              </div>
            ))}
          </div>
        </CartaoGrafico>
      )}
      {tema === 'pessoas' && pess.nomes.length === 0 && metasProg.length === 0 && <div className="empty">Sem gastos por pessoa nem metas para mostrar ainda.</div>}
    </div>
  )
}
