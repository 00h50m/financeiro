import { useState } from 'react'
import Progresso from './Progresso'
import { EtapaSelecionar, EtapaAnalise, EtapaRevisar, EtapaConfirmar, Resultado } from './Etapas'
import EditarCompra from '../EditarCompra'
import { useAssistenteImportacao } from '../../lib/useAssistenteImportacao'

// Importar fatura: assistente de 4 etapas (selecionar, analisar, revisar, confirmar). Nada é gravado até a confirmação.
export default function Assistente({ store, irPara, inicial = null }) {
  const a = useAssistenteImportacao(store, inicial)
  const [compraEditando, setCompraEditando] = useState(null)
  const [grupoAberto, setGrupoAberto] = useState(null)
  const [chaveRevisao, setChaveRevisao] = useState(0)
  const abrirGrupo = (g) => { setGrupoAberto(g); setChaveRevisao((c) => c + 1); a.irPara(3) }
  const etapa = a.etapa
  const ator = { ...a, aoResolver: abrirGrupo } // o painel de pendências abre o grupo certo na revisão

  return (
    <div className="page imp-assistente">
      {compraEditando && <EditarCompra store={store} compra={compraEditando} onClose={() => setCompraEditando(null)} />}
      <Progresso etapa={etapa} maxEtapa={a.maxEtapa} onIr={a.irPara} bloqueado={!!a.lendo || a.confirmando} />
      {a.conciliando && a.etapa < 5 && <div className="alert alert-blue imp-reconferir" style={{ marginTop: 10 }}><b>Reconferindo uma fatura já importada.</b> O que já está no app aparece como registrado; resolva o que sobrou e confirme. Nada é duplicado.</div>}
      {a.bancoV2 === false && a.arquivo && <div className="alert alert-blue" style={{ marginTop: 10 }}>Para salvar o rascunho, atualizar valores e mover compras de fatura, rode o arquivo <code>inbox/38_importacao_assistente.sql</code> no Supabase. O resto funciona normalmente.</div>}
      {a.salvoEm && a.etapa < 5 && <div className="cad-sub imp-salvo" role="status">Rascunho salvo às {a.salvoEm.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>}
      {etapa === 1 && <EtapaSelecionar a={a} />}
      {etapa === 2 && <EtapaAnalise a={ator} aoAbrirGrupo={abrirGrupo} />}
      {etapa === 3 && <EtapaRevisar key={chaveRevisao} a={ator} filtroInicial={grupoAberto} abrirCompra={setCompraEditando} />}
      {etapa === 4 && <EtapaConfirmar a={ator} />}
      {etapa === 5 && <Resultado a={a} aoVerFaturas={() => irPara?.('faturas')} />}
    </div>
  )
}
