import { useState } from 'react'
import { sb } from '../lib/supabase'
import { hojeSP } from '../lib/utils'
import { BACKUP_VERSAO, SCHEMA_BANCO, VERSAO_APP } from '../lib/versao'
import { validarBackup, compararComAtual, mesclagemSegura, totalNovas, ORDEM_RESTAURACAO } from '../lib/restauracao'

// [tabela, nome na tela, coluna de ordem estável (paginar sem ordem pode repetir ou pular linhas), opcional]
// Opcional = a tabela só existe se a pessoa rodou o SQL correspondente; se faltar, é pulada em vez de travar o backup.
const TABELAS = [
  ['compras', 'Compras', 'id'],
  ['cartoes', 'Cartões', 'id'],
  ['faturas', 'Faturas (valor real e pagamento)', 'id'],
  ['fixos', 'Contas fixas', 'id'],
  ['fixos_pagamentos', 'Pagamentos das contas fixas', 'id'],
  ['rendas', 'Rendas', 'id'],
  ['categorias', 'Categorias', 'id'],
  ['pessoas', 'Pessoas', 'id'],
  ['saldo_ajustes', 'Ajustes de saldo', 'mes'],
  ['orcamentos', 'Tetos do Orçamento', 'categoria', true],
  ['config', 'Configurações (reserva de emergência)', 'chave', true],
  ['regras_categorizacao', 'Regras de categorização aprendidas', 'id', true],
  ['estabelecimento_aliases', 'Apelidos de estabelecimentos', 'alias', true],
  ['eventos_financeiros', 'Inbox (lançamentos recebidos)', 'id', true],
  ['compras_pagamentos', 'Pagamentos das parcelas sem cartão', 'id', true],
  ['fechamentos', 'Fechamentos mensais', 'mes', true],
  ['metas', 'Metas', 'id', true],
  ['metas_movimentos', 'Movimentos das metas', 'id', true],
  ['auditoria_financeira', 'Histórico de auditoria', 'id', true],
]
const ORDEM = Object.fromEntries(TABELAS.map(([t, , o]) => [t, o]))

const PAGINA = 1000

// Busca a tabela inteira, paginando (o Supabase limita cada resposta a 1000 linhas).
async function buscarTudo(tabela) {
  const linhas = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb.from(tabela).select('*').order(ORDEM[tabela] || 'id').range(de, de + PAGINA - 1)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < PAGINA) break
  }
  return linhas
}

const celulaCsv = (v) => {
  if (v === null || v === undefined) return ''
  const s = Array.isArray(v) ? v.join(' | ') : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// Separador ";" e BOM UTF-8: abre direto no Excel em português, com acentos corretos.
function paraCsv(linhas) {
  if (!linhas.length) return ''
  const colunas = [...new Set(linhas.flatMap((l) => Object.keys(l)))]
  return '﻿' + [colunas.join(';'), ...linhas.map((l) => colunas.map((c) => celulaCsv(l[c])).join(';'))].join('\r\n')
}

function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const hoje = () => hojeSP() // data de hoje em Brasília

function lerUltimo() {
  try { return localStorage.getItem('ultimo_backup') } catch { return null }
}


const FRASE = 'SUBSTITUIR'

// Gera o arquivo de backup atual (usado como cópia de segurança antes de restaurar).
async function gerarPacoteAtual() {
  const dados = {}
  const ausentes = []
  for (const [t, , , opcional] of TABELAS) {
    try { dados[t] = await buscarTudo(t) } catch (e) { if (!opcional) throw e; ausentes.push(t) }
  }
  const contagens = Object.fromEntries(Object.entries(dados).map(([t, linhas]) => [t, linhas.length]))
  return { app: 'Sobrou!', backup_versao: BACKUP_VERSAO, schema_banco: SCHEMA_BANCO, versao_app: VERSAO_APP, gerado_em: new Date().toISOString(), contagens, tabelas_ausentes: ausentes, tabelas: dados }
}

function Restaurar({ store }) {
  const [pacote, setPacote] = useState(null)
  const [nomeArquivo, setNomeArquivo] = useState('')
  const [validacao, setValidacao] = useState(null)
  const [comparacao, setComparacao] = useState(null)
  const [segura, setSegura] = useState(null)
  const [frase, setFrase] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [msg, setMsg] = useState(null)

  async function escolher(e) {
    const arquivo = e.target.files?.[0]
    e.target.value = ''
    setMsg(null); setPacote(null); setValidacao(null); setComparacao(null); setSegura(null); setFrase('')
    if (!arquivo) return
    setNomeArquivo(arquivo.name)
    let obj
    try { obj = JSON.parse(await arquivo.text()) } catch { setValidacao({ ok: false, erros: ['O arquivo não é um JSON válido.'], avisos: [], resumo: [] }); return }
    const v = validarBackup(obj)
    setValidacao(v)
    if (!v.ok) return
    setOcupado('lendo')
    try {
      const atual = {}
      for (const [t, , , opcional] of TABELAS) {
        if (!Array.isArray(obj.tabelas[t])) continue
        try { atual[t] = await buscarTudo(t) } catch (er) { if (!opcional) throw er; atual[t] = [] }
      }
      const c = compararComAtual(obj, atual)
      setComparacao(c)
      setSegura(mesclagemSegura(obj, atual, c.novasPorTabela))
      setPacote(obj)
    } catch (er) {
      setMsg({ tipo: 'red', texto: 'Não consegui comparar com os dados atuais: ' + er.message })
    }
    setOcupado('')
  }

  async function mesclar() {
    if (!pacote || !segura?.segura) return
    if (!window.confirm(`Adicionar ${totalNovas(comparacao.novasPorTabela)} registros que faltam? Nada existente será alterado.`)) return
    setOcupado('mesclando'); setMsg(null)
    try {
      for (const [t] of ORDEM_RESTAURACAO) {
        const novas = comparacao.novasPorTabela[t] || []
        for (let i = 0; i < novas.length; i += 500) {
          const colunasGeradas = t === 'regras_categorizacao' ? ['confianca'] : []
          const lote = novas.slice(i, i + 500).map((l) => Object.fromEntries(Object.entries(l).filter(([k]) => !colunasGeradas.includes(k))))
          const r = await sb.from(t).insert(lote)
          if (r.error) throw new Error(`${t}: ${r.error.message}`)
        }
      }
      await store.registrarAuditoria({ entidade: 'backup', entidade_id: 'mesclagem', acao: 'mesclar', depois: Object.fromEntries(Object.entries(comparacao.novasPorTabela).map(([t, l]) => [t, l.length])), motivo: `Mesclagem do arquivo ${nomeArquivo}` })
      await store.loadAll({ silent: true })
      setMsg({ tipo: 'green', texto: 'Pronto: os registros que faltavam foram adicionados.' })
      setPacote(null); setComparacao(null); setValidacao(null)
    } catch (er) {
      setMsg({ tipo: 'red', texto: 'A mesclagem parou no meio: ' + er.message + '. Nada do que já existia foi alterado; confira os dados e, se quiser, tente de novo (o que já entrou é ignorado).' })
    }
    setOcupado('')
  }

  async function substituir() {
    if (!pacote || frase !== FRASE) return
    setOcupado('substituindo'); setMsg(null)
    try {
      // 1) cópia de segurança dos dados de hoje, baixada antes de qualquer mudança
      const atual = await gerarPacoteAtual()
      baixar(`sobrou-antes-de-restaurar-${hoje()}.json`, JSON.stringify(atual, null, 2), 'application/json')
      // 2) substituição numa transação só (tudo ou nada)
      const r = await sb.rpc('restaurar_backup', { p_tabelas: pacote.tabelas, p_usuario: store.email || null })
      if (r.error) {
        const falta = /restaurar_backup/.test(r.error.message) && /(not find|does not exist|schema cache)/i.test(r.error.message)
        throw new Error(falta ? 'falta rodar o arquivo inbox/17_restauracao_indices.sql no Supabase' : r.error.message)
      }
      await store.loadAll({ silent: true })
      setMsg({ tipo: 'green', texto: 'Backup restaurado. Uma cópia dos dados anteriores foi baixada antes (sobrou-antes-de-restaurar).' })
      setPacote(null); setComparacao(null); setValidacao(null); setFrase('')
    } catch (er) {
      setMsg({ tipo: 'red', texto: 'Nada foi alterado: ' + er.message })
    }
    setOcupado('')
  }

  const pronto = validacao?.ok && pacote && comparacao
  const sobrando = comparacao?.linhas.reduce((t, l) => t + l.sobrando, 0) || 0

  return (
    <>
      <div className="section-label">restaurar um backup</div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>
          Escolha um arquivo de backup completo (.json). O app confere o arquivo e mostra o que mudaria <strong>antes</strong> de você decidir. Nada é alterado até você confirmar.
        </div>
        <input type="file" accept="application/json,.json" onChange={escolher} disabled={!!ocupado} aria-label="Escolher arquivo de backup" />
        {ocupado === 'lendo' && <div style={{ fontSize: 13, marginTop: 10 }}>Conferindo com os dados atuais...</div>}
        {msg && <div className={`alert alert-${msg.tipo}`} style={{ marginTop: 12 }}>{msg.texto}</div>}

        {validacao && !validacao.ok && (
          <div className="alert alert-red" style={{ marginTop: 12 }}>
            <strong>Este arquivo não pode ser restaurado:</strong>
            <ul style={{ margin: '6px 0 0 18px' }}>{validacao.erros.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        {validacao?.avisos?.length > 0 && (
          <div className="alert alert-amber" style={{ marginTop: 12 }}>
            <ul style={{ margin: '0 0 0 18px' }}>{validacao.avisos.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}

        {pronto && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, marginBottom: 8 }}>
              <strong>{nomeArquivo}</strong> · gerado em {pacote.gerado_em ? new Date(pacote.gerado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'} · versão do app {pacote.versao_app || '—'}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Tabela</th><th style={{ textAlign: 'right' }}>No backup</th><th style={{ textAlign: 'right' }}>Hoje</th><th style={{ textAlign: 'right' }}>Faltam hoje</th><th style={{ textAlign: 'right' }}>Diferentes</th><th style={{ textAlign: 'right' }}>Só existem hoje</th></tr></thead>
                <tbody>
                  {comparacao.linhas.map((l) => (
                    <tr key={l.tabela}>
                      <td>{l.nome}</td>
                      {[l.noBackup, l.hoje, l.novas, l.diferentes, l.sobrando].map((v, i) => <td key={i} style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13 }}>{v}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card" style={{ padding: 14, marginTop: 14 }}>
              <div style={{ fontWeight: 500, marginBottom: 4 }}>Mesclar (seguro)</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8 }}>Só adiciona o que existe no backup e falta hoje. Nunca altera nem apaga nada que já está no app.</div>
              {!segura.segura && <div className="alert alert-amber"><ul style={{ margin: '0 0 0 18px' }}>{segura.problemas.map((t) => <li key={t}>{t}</li>)}</ul>Mesclar fica bloqueado para não criar registros soltos.</div>}
              <button className="btn btn-primary btn-sm" onClick={mesclar} disabled={!segura.segura || !!ocupado || totalNovas(comparacao.novasPorTabela) === 0}>
                {ocupado === 'mesclando' ? 'Mesclando...' : `Adicionar ${totalNovas(comparacao.novasPorTabela)} registros que faltam`}
              </button>
            </div>

            <div className="card" style={{ padding: 14, marginTop: 12, borderColor: 'var(--red-border)' }}>
              <div style={{ fontWeight: 500, marginBottom: 4, color: 'var(--red)' }}>Substituir tudo (cuidado)</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 8, lineHeight: 1.6 }}>
                Os dados do app ficam <strong>iguais ao backup</strong>: {sobrando} {sobrando === 1 ? 'registro que só existe hoje será apagado' : 'registros que só existem hoje serão apagados'} e os diferentes voltam ao valor do backup.
                Antes, o app baixa uma cópia dos dados de hoje. Se algo falhar, nada muda.
              </div>
              <div className="form-group" style={{ marginBottom: 8 }}>
                <label>Para confirmar, digite {FRASE}</label>
                <input value={frase} onChange={(e) => setFrase(e.target.value)} autoComplete="off" />
              </div>
              <button className="btn btn-danger btn-sm" onClick={substituir} disabled={frase !== FRASE || !!ocupado}>
                {ocupado === 'substituindo' ? 'Restaurando...' : 'Substituir tudo pelo backup'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

export default function Backup({ store }) {
  const [ocupado, setOcupado] = useState('')
  const [erro, setErro] = useState('')
  const [ultimo, setUltimo] = useState(lerUltimo)

  const contagem = {
    compras: store.compras.length, cartoes: store.cartoes.length, faturas: store.faturas.length,
    fixos: store.fixos.length, fixos_pagamentos: store.fixosPagamentos.length, rendas: store.rendas.length,
    categorias: store.categorias.length, pessoas: store.pessoas.length, saldo_ajustes: store.saldoAjustes.length,
    orcamentos: store.orcamentos.length, config: Object.keys(store.config).length,
    compras_pagamentos: store.comprasPagamentos.length,
    fechamentos: store.fechamentos.length, metas: store.metas.length, metas_movimentos: store.metasMovimentos.length,
    regras_categorizacao: store.regras.length, estabelecimento_aliases: store.aliases.length, eventos_financeiros: store.eventos.length,
  }

  function registrar() {
    const agora = new Date().toLocaleString('pt-BR')
    try { localStorage.setItem('ultimo_backup', agora) } catch { /* segue sem lembrar */ }
    setUltimo(agora)
  }

  async function executar(chave, fn) {
    setErro('')
    setOcupado(chave)
    try {
      await fn()
    } catch (e) {
      setErro('Não foi possível gerar o backup. ' + e.message)
    }
    setOcupado('')
  }

  const baixarCompleto = () => executar('json', async () => {
    const dados = {}
    const ausentes = []
    for (const [t, , , opcional] of TABELAS) {
      try { dados[t] = await buscarTudo(t) } catch (e) { if (!opcional) throw e; ausentes.push(t) } // tabela opcional que ainda não existe: pula e registra
    }
    // Metadados para conferir o arquivo antes de qualquer restauração futura.
    const contagens = Object.fromEntries(Object.entries(dados).map(([t, linhas]) => [t, linhas.length]))
    const pacote = {
      app: 'Sobrou!',
      backup_versao: BACKUP_VERSAO,
      schema_banco: SCHEMA_BANCO,
      versao_app: VERSAO_APP,
      gerado_em: new Date().toISOString(),
      contagens,
      tabelas_ausentes: ausentes,
      tabelas: dados,
    }
    baixar(`sobrou-backup-${hoje()}.json`, JSON.stringify(pacote, null, 2), 'application/json')
    registrar()
  })

  const baixarCsv = (tabela) => executar(tabela, async () => {
    const linhas = await buscarTudo(tabela)
    if (!linhas.length) throw new Error('a tabela está vazia, não há o que exportar.')
    baixar(`sobrou-${tabela}-${hoje()}.csv`, paraCsv(linhas), 'text/csv;charset=utf-8')
  })

  return (
    <div className="page">
      <div className="section-label">backup dos seus dados</div>
      {erro && <div className="alert alert-red">{erro}</div>}

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Backup completo</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14 }}>
          Um único arquivo (.json) com todas as tabelas, tal como estão no banco. Guarde em um lugar seguro
          (Drive, e-mail para você mesma). É a cópia de segurança dos seus dados Para voltar a um backup, use "Restaurar um backup" mais abaixo.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={baixarCompleto} disabled={!!ocupado}>
            {ocupado === 'json' ? 'Gerando...' : 'Baixar backup completo'}
          </button>
          <span style={{ fontSize: 12, color: 'var(--text3)' }}>
            {ultimo ? `Último backup neste aparelho: ${ultimo}` : 'Nenhum backup feito neste aparelho ainda.'}
          </span>
        </div>
      </div>

      <div className="section-label">planilhas (para abrir no Excel / Google Planilhas)</div>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Tabela</th>
              <th style={{ textAlign: 'right' }}>Registros</th>
              <th style={{ width: 120 }} />
            </tr>
          </thead>
          <tbody>
            {TABELAS.map(([t, nome]) => (
              <tr key={t}>
                <td>{nome}</td>
                <td style={{ textAlign: 'right', fontFamily: 'DM Mono', fontSize: 13, color: 'var(--text2)' }}>{contagem[t]}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => baixarCsv(t)} disabled={!!ocupado || !contagem[t]}>
                    {ocupado === t ? 'Gerando...' : 'Baixar CSV'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.6 }}>
        Os CSVs são para consultar e analisar; para guardar com segurança, use o backup completo.
      </div>

      <Restaurar store={store} />
    </div>
  )
}
