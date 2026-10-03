import { useState } from 'react'
import { sb } from '../lib/supabase'

const TABELAS = [
  ['compras', 'Compras'],
  ['cartoes', 'Cartões'],
  ['faturas', 'Faturas (valor real e pagamento)'],
  ['fixos', 'Contas fixas'],
  ['fixos_pagamentos', 'Pagamentos das contas fixas'],
  ['rendas', 'Rendas'],
  ['categorias', 'Categorias'],
  ['pessoas', 'Pessoas'],
  ['saldo_ajustes', 'Ajustes de saldo'],
]

const PAGINA = 1000

// Busca a tabela inteira, paginando (o Supabase limita cada resposta a 1000 linhas).
async function buscarTudo(tabela) {
  const linhas = []
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await sb.from(tabela).select('*').range(de, de + PAGINA - 1)
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
    for (const [t] of TABELAS) dados[t] = await buscarTudo(t)
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
          (Drive, e-mail para você mesma). É o arquivo que permite recuperar tudo se algo der errado.
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
