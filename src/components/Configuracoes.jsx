import { useState } from 'react'
import { mesLabel } from '../lib/utils'
import { CHAVE_INICIO, INICIO_PADRAO, inicioDoApp } from '../lib/inicioApp'

// Configurações gerais do app (por enquanto: quando o uso começou).
export default function Configuracoes({ store }) {
  const { config, configOk, definirConfig } = store
  const atual = inicioDoApp(config)
  const [valor, setValor] = useState(atual || '')
  const [salvando, setSalvando] = useState(false)

  async function salvar(novo) {
    setSalvando(true)
    await definirConfig(CHAVE_INICIO, novo)
    setSalvando(false)
  }

  return (
    <div className="page">
      {!configOk && (
        <div className="alert alert-amber"><strong>Falta criar a tabela de configurações no banco.</strong> Rode o arquivo <code>config.sql</code> do projeto no SQL Editor do Supabase e recarregue a página. Até lá o início do uso fica fixo em {mesLabel(INICIO_PADRAO)}.</div>
      )}

      <section className="card cfg-card">
        <div className="cfg-titulo">Início do uso do app</div>
        <p className="cfg-texto">
          Quando você começou a lançar tudo de verdade. Os meses <b>antes</b> dessa data são tratados como histórico incompleto:
        </p>
        <ul className="cfg-lista">
          <li>não geram alertas (por exemplo, contas variáveis "ainda estimadas" de meses antigos);</li>
          <li>não trazem sobra de saldo para os meses seguintes;</li>
          <li>a navegação por mês não volta para antes dele.</li>
        </ul>
        <p className="cfg-texto">Compras e dados já lançados antes continuam guardados, só não entram nessas contas.</p>

        <div className="cfg-linha">
          <label htmlFor="inicio-app">Começou em</label>
          <input id="inicio-app" type="month" value={valor} onChange={(e) => setValor(e.target.value)} />
          <button className="btn btn-primary" disabled={salvando || !valor || valor === atual} onClick={() => salvar(valor)}>{salvando ? 'Salvando...' : 'Salvar'}</button>
        </div>
        <div className="cfg-estado">
          {atual ? <>Hoje vale: <b>{mesLabel(atual)}</b>.</> : <>Hoje não há data de início: todos os meses entram nas contas.</>}
        </div>
        <div className="cfg-acoes">
          {atual !== INICIO_PADRAO && <button className="btn btn-ghost btn-sm" disabled={salvando} onClick={() => { setValor(INICIO_PADRAO); salvar(INICIO_PADRAO) }}>Usar {mesLabel(INICIO_PADRAO)}</button>}
          {atual && <button className="btn btn-ghost btn-sm" disabled={salvando} onClick={() => { setValor(''); salvar('') }}>Remover data de início</button>}
        </div>
      </section>
    </div>
  )
}
