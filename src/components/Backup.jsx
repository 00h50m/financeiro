import { useState } from 'react'
import { sb } from '../lib/supabase'

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
  ['estabelecimento_aliases', 'Apelidos de estabelecimentos', 'id', true],
  ['eventos_financeiros', 'Inbox (lançamentos recebidos)', 'id', true],
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

const hoje = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function lerUltimo() {
  try { return localStorage.getItem('ultimo_backup') } catch { return null }
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
    for (const [t, , , opcional] of TABELAS) {
      try { dados[t] = await buscarTudo(t) } catch (e) { if (!opcional) throw e } // tabela opcional que ainda não existe: pula
    }
    const pacote = { app: 'Sobrou!', gerado_em: new Date().toISOString(), tabelas: dados }
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
          (Drive, e-mail para você mesma). É a cópia de segurança dos seus dados (a restauração a partir dele ainda não é feita pelo app).
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
    </div>
  )
}
