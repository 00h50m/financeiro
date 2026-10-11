import { useEffect, useState } from 'react'
import { corPessoa } from '../lib/utils'
import { formatarCodigo } from '../lib/pareamento'
import { chamarAdminTelegram } from '../lib/automacoes'
import { explicarErro } from '../lib/erros'

const quando = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const PASSOS_VARIAVEIS = {
  TELEGRAM_BOT_TOKEN: 'o token que o @BotFather te deu',
  TELEGRAM_WEBHOOK_SECRET: 'uma senha qualquer, só letras e números, com 20+ caracteres',
  SUPABASE_SERVICE_ROLE_KEY: 'Supabase › Project Settings › API › service_role',
  SUPABASE_URL: 'a mesma URL do Supabase que o app já usa',
}

function Copiar({ texto, rotulo = 'Copiar' }) {
  const [ok, setOk] = useState(false)
  return (
    <button className="btn btn-ghost btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(texto); setOk(true); setTimeout(() => setOk(false), 1800) } catch { window.alert('Não consegui copiar neste navegador. Selecione o texto e copie à mão.') } }}>
      {ok ? 'Copiado ✓' : rotulo}
    </button>
  )
}

// Passo a passo da captura de compras pelas notificações do celular (MacroDroid), na ordem que funciona no Android.
function GuiaAndroid() {
  const url = `${typeof window !== 'undefined' ? window.location.origin : 'https://SEU-SITE'}/api/notificacao`
  const corpo = 'token: COLE_O_TOKEN_AQUI\napp: [nome do aplicativo]\ntitulo: [título da notificação]\ntexto: [texto da notificação]'
  return (
    <div className="guia-android">
      <p className="guia-intro">O celular manda o texto das notificações de compra do banco para o Sobrou!, que pergunta no Telegram se você confirma o lançamento. Só notificações de <b>compra</b> viram lançamento; Pix, estorno, fatura e compra recusada são ignorados.</p>
      <ol>
        <li>
          <b>Pegue o token.</b> No Telegram, mande <code>/android</code> para o bot. Ele responde <b>uma vez só</b> com o token (começa com <code>fin_</code>). Copie. Para desligar um celular, mande <code>/android revogar</code>.
          <div className="guia-aviso">O token é como uma senha do seu celular: não envie em prints nem em conversas.</div>
        </li>
        <li>
          <b>Instale o MacroDroid</b> (Play Store), libere o <b>acesso às notificações</b> quando ele pedir e, em Configurações do Android → Apps → MacroDroid → Bateria, escolha <b>Sem restrições</b>.
        </li>
        <li>
          <b>Crie a macro.</b> Adicionar macro →
          <ul>
            <li><b>Gatilho:</b> Eventos do Dispositivo → <b>Notificação</b> → Notificação recebida. Toque no botão da grade e marque só o app do seu banco (Nubank, Inter...). Deixe "Conteúdo do texto" em <i>Qualquer</i>. Se o app do banco não aparecer na lista, use "Contém" e escreva <code>compra</code>.</li>
            <li><b>Ação:</b> Conectividade → <b>Requisição HTTP</b>. Método <b>POST</b>, URL abaixo e, na aba <i>Corpo da requisição</i>, tipo de conteúdo <code>text/plain</code> com o texto abaixo.</li>
          </ul>
          <div className="guia-copiar"><code>{url}</code><Copiar texto={url} rotulo="Copiar endereço" /></div>
          <pre className="guia-pre">{corpo}</pre>
          <div className="guia-copiar"><Copiar texto={corpo} rotulo="Copiar modelo do corpo" /></div>
          <p>Troque <code>COLE_O_TOKEN_AQUI</code> pelo seu token e cada texto entre colchetes pela variável do MacroDroid (botão <b>{'{ }'}</b> ou <b>+</b> no campo: nome do aplicativo, título e texto da notificação; os nomes mudam de versão). Se o corpo for em JSON, também funciona.</p>
        </li>
        <li>
          <b>Teste</b> com uma compra pequena. O gatilho só dispara em notificação <b>nova</b>. Em segundos o bot manda "📱 Notificação do Nubank..." com o botão <b>Confirmar</b>.
        </li>
      </ol>
      <div className="guia-dicas">
        <b>Se não funcionar:</b>
        <ul>
          <li>Triângulo vermelho no gatilho = falta liberar o acesso às notificações (Configurações → Aplicativos → ⋮ → Acesso especial → Acesso a notificações).</li>
          <li>Erro 401: token errado ou revogado. Erro 409: seu Telegram ainda não está conectado ao app (veja "Conectar uma pessoa", acima).</li>
          <li>Nada no Telegram e a macro "executada": veja o log do MacroDroid e confira se o endereço termina em <code>/api/notificacao</code>.</li>
        </ul>
      </div>
    </div>
  )
}

function ConectarPessoa({ store, bot }) {
  const { pessoas, gerarPareamento } = store
  const [pessoaId, setPessoaId] = useState(pessoas[0]?.id || '')
  const [codigo, setCodigo] = useState(null)
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(Date.now())
  useEffect(() => {
    if (!codigo) return undefined
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [codigo])

  async function gerar() {
    setErro('')
    try { setCodigo(await gerarPareamento('telegram', pessoaId)) } catch (e) { setErro(explicarErro(e, 'gerar o código de conexão')) }
  }
  const restante = codigo ? Math.max(0, Math.floor((codigo.expira_em - agora) / 1000)) : 0
  const valido = codigo && restante > 0

  return (
    <div className="card" style={{ padding: 16, overflow: 'visible' }}>
      <div className="section-label">Conectar uma pessoa</div>
      <div className="toolbar">
        <select value={pessoaId} onChange={(e) => { setPessoaId(e.target.value); setCodigo(null) }}>
          {pessoas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
        </select>
        <button className="btn btn-primary" onClick={gerar} disabled={!pessoaId || !bot?.bot}>Gerar código</button>
      </div>
      {erro && <div className="alert alert-red">{erro}</div>}
      {valido && (
        <div className="alert alert-green">
          <div>Código para <b>{pessoas.find((p) => p.id === pessoaId)?.nome}</b> (vale por {Math.floor(restante / 60)}:{String(restante % 60).padStart(2, '0')}, uso único):</div>
          <div className="mono" style={{ fontSize: 24, margin: '8px 0', letterSpacing: 2 }}>{formatarCodigo(codigo.codigo)}</div>
          <div>
            No celular dessa pessoa, abra{' '}
            <a href={`https://t.me/${bot.bot}?start=${codigo.codigo}`} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 600 }}>
              @{bot.bot}
            </a>{' '}
            e toque em <b>Iniciar</b> — ou envie <span className="mono">/start {codigo.codigo}</span>.
          </div>
        </div>
      )}
      {codigo && !valido && <div className="alert alert-amber">O código expirou. Gere outro.</div>}
    </div>
  )
}

export default function Automacoes({ store }) {
  const { integracoesTelegram, pessoas, inboxOk, pausarIntegracao, desconectarIntegracao } = store
  const [bot, setBot] = useState(null) // resposta de { acao: 'status' }
  const [carregando, setCarregando] = useState(true)
  const [msg, setMsg] = useState(null)

  async function verificar() {
    setCarregando(true)
    setBot(await chamarAdminTelegram('status'))
    setCarregando(false)
  }
  useEffect(() => { verificar() }, [])

  async function ativar() {
    setMsg(null)
    const r = await chamarAdminTelegram('configurar')
    setMsg(r.ok ? { tipo: 'green', texto: `Bot ativado. Endereço registrado: ${r.webhook_url}` } : { tipo: 'red', texto: r.erro || 'Não consegui ativar o bot.' })
    verificar()
  }
  async function testar(id) {
    setMsg(null)
    const r = await chamarAdminTelegram('testar', { integracao_id: id })
    setMsg(r.ok ? { tipo: 'green', texto: 'Mensagem de teste enviada. Confira no Telegram.' } : { tipo: 'red', texto: r.erro || 'Falha ao enviar o teste.' })
  }
  function desconectar(i) {
    const nome = pessoas.find((p) => p.id === i.pessoa_id)?.nome || 'esta pessoa'
    if (confirm(`Desconectar ${nome}?\n\nO bot deixa de responder a esse Telegram. Dá para conectar de novo com um novo código.`)) desconectarIntegracao(i.id)
  }

  if (!inboxOk) {
    return <div className="page"><div className="alert alert-amber">Rode antes as partes <b>inbox/01</b> a <b>inbox/10</b> no Supabase (veja a aba Inbox).</div></div>
  }

  let status
  if (carregando) status = <span className="badge badge-gray">verificando...</span>
  else if (bot?.indisponivel) status = <span className="badge badge-gray">indisponível aqui</span>
  else if (bot?.configurado === false) status = <span className="badge badge-amber">● Falta configurar</span>
  else if (bot?.ok && bot.webhook_ativo) status = <span className="badge badge-green">● Ativo — @{bot.bot}</span>
  else if (bot?.ok) status = <span className="badge badge-amber">● Bot existe, falta ativar</span>
  else status = <span className="badge badge-red">● Erro</span>

  return (
    <div className="page">
      <div className="section-label">Telegram</div>
      <div className="card" style={{ padding: 16, overflow: 'visible' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>Status do bot: {status}</div>
          <button className="btn btn-ghost btn-sm" onClick={verificar}>Verificar de novo</button>
        </div>

        {bot?.indisponivel && (
          <div className="alert alert-blue" style={{ marginTop: 12 }}>
            O bot roda nas funções de servidor da Vercel, que não existem ao rodar localmente (<span className="mono">npm run dev</span>). Abra o app publicado.
          </div>
        )}
        {bot?.configurado === false && (
          <div className="alert alert-amber" style={{ marginTop: 12 }}>
            Faltam variáveis de ambiente na Vercel (Settings › Environment Variables) e um novo deploy:
            <ul style={{ margin: '6px 0 0 18px' }}>
              {bot.faltando.map((k) => <li key={k}><span className="mono">{k}</span> — {PASSOS_VARIAVEIS[k]}</li>)}
            </ul>
          </div>
        )}
        {bot?.ok && !bot.webhook_ativo && (
          <div style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={ativar}>Ativar bot</button>
            <span style={{ marginLeft: 10, fontSize: 12, color: 'var(--text3)' }}>Registra o endereço do app no Telegram. Faça isso no app publicado (endereço de produção).</span>
          </div>
        )}
        {bot?.ok && bot.webhook_ativo && (
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text3)' }}>
            Recebendo em <span className="mono">{bot.webhook_url}</span>
            {bot.ultimo_erro && <div style={{ color: 'var(--red)' }}>Último erro do Telegram: {bot.ultimo_erro}</div>}
            <div><button className="link-btn" onClick={ativar}>Registrar o endereço de novo</button></div>
          </div>
        )}
        {bot?.ok && bot.banco_erro && (
          <div className="alert alert-red" style={{ marginTop: 12 }}>Falha ao acessar o banco: <span className="mono">{bot.banco_erro}</span></div>
        )}
        {msg && <div className={`alert alert-${msg.tipo}`} style={{ marginTop: 12 }}>{msg.texto}</div>}
      </div>

      <div className="section-label">Quem pode lançar pelo Telegram</div>
      <div className="card">
        {integracoesTelegram.length === 0 ? (
          <div className="empty">Ninguém conectado ainda.{'\n'}Gere um código abaixo e use no Telegram.</div>
        ) : (
          <table>
            <thead><tr><th>Pessoa</th><th>Status</th><th>Conectado em</th><th>Último uso</th><th /></tr></thead>
            <tbody>
              {integracoesTelegram.map((i) => {
                const p = pessoas.find((x) => x.id === i.pessoa_id)
                return (
                  <tr key={i.id}>
                    <td><span className={`badge badge-${corPessoa(pessoas, p?.nome)}`}>{p?.nome || '—'}</span></td>
                    <td>{i.ativo ? <span className="badge badge-green">● Conectado</span> : <span className="badge badge-gray">Pausado</span>}</td>
                    <td>{quando(i.conectado_em)}</td>
                    <td>{quando(i.ultimo_uso)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn btn-ghost btn-sm" onClick={() => testar(i.id)} disabled={!i.ativo || !bot?.webhook_ativo}>Testar</button>{' '}
                      <button className="btn btn-ghost btn-sm" onClick={() => pausarIntegracao(i.id, !i.ativo)}>{i.ativo ? 'Pausar' : 'Reativar'}</button>{' '}
                      <button className="btn btn-danger" onClick={() => desconectar(i)}>Desconectar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {bot?.ok && <ConectarPessoa store={store} bot={bot} />}

      <div className="section-label">Captura de notificações (Android)</div>
      <div className="card"><GuiaAndroid /></div>
    </div>
  )
}
