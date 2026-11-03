import Dashboard from './Dashboard'
import Evolucao from './Evolucao'
import PorPessoa from './PorPessoa'
import Graficos from './Graficos'
import LongoPrazo from './LongoPrazo'
import OrcadoRealizado from './OrcadoRealizado'

// Análises: uma tela, seis abas. Reaproveita as telas que existiam separadas (Dashboard, Evolução, Gráficos, Por pessoa) sem mudar nenhum número.
export const ABAS_ANALISES = [['visao', 'Visão geral'], ['evolucao', 'Evolução'], ['categorias', 'Categorias'], ['pessoas', 'Pessoas'], ['compromissos', 'Compromissos'], ['orcado', 'Orçado × realizado']]

export default function Analises({ store, irPara, sub, aoMudarSub }) {
  const aba = ABAS_ANALISES.some(([k]) => k === sub) ? sub : 'visao'
  return (
    <div className="page analises">
      <div className="pag-abas analises-abas" role="tablist" aria-label="Análises">
        {ABAS_ANALISES.map(([k, rotulo]) => (
          <button key={k} type="button" role="tab" aria-selected={aba === k} className={`pag-aba ${aba === k ? 'ativa' : ''}`} onClick={() => aoMudarSub?.(k)}>{rotulo}</button>
        ))}
      </div>
      <div role="tabpanel" aria-label={ABAS_ANALISES.find(([k]) => k === aba)[1]}>
        {aba === 'visao' && <Dashboard store={store} irPara={irPara} embutido />}
        {aba === 'evolucao' && (<><Evolucao store={store} embutido /><Graficos store={store} embutido temaFixo="geral" /></>)}
        {aba === 'categorias' && <Graficos store={store} embutido temaFixo="categorias" />}
        {aba === 'pessoas' && (<><PorPessoa store={store} embutido /><Graficos store={store} embutido temaFixo="pessoas" /></>)}
        {aba === 'compromissos' && (<><Graficos store={store} embutido temaFixo="futuro" /><div style={{ marginTop: 14 }}><LongoPrazo store={store} irPara={irPara} /></div></>)}
        {aba === 'orcado' && <OrcadoRealizado store={store} irPara={irPara} />}
      </div>
    </div>
  )
}
