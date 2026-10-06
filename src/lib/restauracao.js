// RESTAURAÇÃO DE BACKUP: validação do arquivo, resumo e plano de mesclagem segura. Funções puras.
import { BACKUP_VERSAO, SCHEMA_BANCO } from './versao.js'

// Ordem de inserção (pais primeiro), chave de cada tabela e nome na tela.
export const ORDEM_RESTAURACAO = [
  ['pessoas', 'id', 'Pessoas'], ['cartoes', 'id', 'Cartões'], ['categorias', 'id', 'Categorias'], ['rendas', 'id', 'Rendas'],
  ['saldo_ajustes', 'mes', 'Ajustes de saldo'], ['orcamentos', 'categoria', 'Tetos do Orçamento'], ['config', 'chave', 'Configurações'],
  ['fixos', 'id', 'Contas fixas'], ['regras_categorizacao', 'id', 'Regras aprendidas'], ['estabelecimento_aliases', 'alias', 'Apelidos'],
  ['compras', 'id', 'Compras'], ['faturas', 'id', 'Faturas'], ['fixos_pagamentos', 'id', 'Pagamentos das contas fixas'], ['fixos_valores', 'id', 'Valores reais mensais das contas fixas'],
  ['compras_pagamentos', 'id', 'Pagamentos das parcelas'], ['eventos_financeiros', 'id', 'Inbox'], ['fechamentos', 'mes', 'Fechamentos'],
  ['metas', 'id', 'Metas'], ['metas_movimentos', 'id', 'Movimentos das metas'],
  ['divisoes', 'id', 'Divididos'], ['divisoes_repasses', 'id', 'Recebimentos dos Divididos'],
]
export const OBRIGATORIAS = ['compras', 'cartoes', 'faturas', 'fixos', 'fixos_pagamentos', 'rendas', 'categorias', 'pessoas', 'saldo_ajustes']

// Relações que precisam fechar: [tabela filha, coluna, tabela pai].
const RELACOES = [
  ['compras', 'cartao_id', 'cartoes'], ['faturas', 'cartao_id', 'cartoes'], ['fixos_pagamentos', 'fixo_id', 'fixos'], ['fixos_valores', 'fixo_id', 'fixos'],
  ['compras_pagamentos', 'compra_id', 'compras'], ['metas_movimentos', 'meta_id', 'metas'], ['divisoes_repasses', 'divisao_id', 'divisoes'],
]

const chaveDe = (tabela) => ORDEM_RESTAURACAO.find((o) => o[0] === tabela)?.[1] || 'id'
const nomeDe = (tabela) => ORDEM_RESTAURACAO.find((o) => o[0] === tabela)?.[2] || tabela

// Confere o arquivo SEM tocar no banco. { ok, erros, avisos, resumo }.
export function validarBackup(pacote) {
  const erros = []
  const avisos = []
  if (!pacote || typeof pacote !== 'object' || Array.isArray(pacote)) return { ok: false, erros: ['O arquivo não é um backup do Sobrou!.'], avisos, resumo: [] }
  if (pacote.app !== 'Sobrou!') erros.push('O arquivo não é um backup do Sobrou! (campo "app" diferente).')
  if (typeof pacote.backup_versao !== 'number') erros.push('Backup sem versão de formato: foi gerado por uma versão muito antiga do app.')
  else if (pacote.backup_versao > BACKUP_VERSAO) erros.push(`Este backup tem formato mais novo (${pacote.backup_versao}) do que este app entende (${BACKUP_VERSAO}). Atualize o app antes de restaurar.`)
  if (typeof pacote.schema_banco === 'number' && pacote.schema_banco > SCHEMA_BANCO) avisos.push(`O backup veio de um banco mais novo (atualização ${pacote.schema_banco}; este app conhece até a ${SCHEMA_BANCO}).`)
  if (typeof pacote.schema_banco === 'number' && pacote.schema_banco < SCHEMA_BANCO) avisos.push(`O backup é de um banco mais antigo (atualização ${pacote.schema_banco}). Tabelas criadas depois dele não serão alteradas.`)
  const tabelas = pacote.tabelas
  if (!tabelas || typeof tabelas !== 'object' || Array.isArray(tabelas)) {
    erros.push('Backup sem o bloco de tabelas.')
    return { ok: false, erros, avisos, resumo: [] }
  }

  for (const t of OBRIGATORIAS) if (!Array.isArray(tabelas[t])) erros.push(`Faltam dados obrigatórios: ${nomeDe(t)}.`)

  const resumo = []
  for (const [t, chave] of ORDEM_RESTAURACAO) {
    if (!(t in tabelas)) continue
    const linhas = tabelas[t]
    if (!Array.isArray(linhas)) { erros.push(`${nomeDe(t)}: formato inválido.`); continue }
    if (linhas.some((l) => !l || typeof l !== 'object' || Array.isArray(l))) { erros.push(`${nomeDe(t)}: há linhas inválidas.`); continue }
    const faltaChave = linhas.filter((l) => l[chave] == null || l[chave] === '').length
    if (faltaChave) erros.push(`${nomeDe(t)}: ${faltaChave} ${faltaChave === 1 ? 'linha sem' : 'linhas sem'} identificador.`)
    const vistos = new Set()
    let repetidas = 0
    for (const l of linhas) { const k = String(l[chave]); if (vistos.has(k)) repetidas++; vistos.add(k) }
    if (repetidas) erros.push(`${nomeDe(t)}: ${repetidas} ${repetidas === 1 ? 'identificador repetido' : 'identificadores repetidos'}.`)
    const declarado = pacote.contagens?.[t]
    if (typeof declarado === 'number' && declarado !== linhas.length) erros.push(`${nomeDe(t)}: o arquivo diz ter ${declarado} registros mas traz ${linhas.length}. Pode estar corrompido.`)
    resumo.push({ tabela: t, nome: nomeDe(t), linhas: linhas.length })
  }

  for (const [filha, coluna, pai] of RELACOES) {
    if (!Array.isArray(tabelas[filha]) || !Array.isArray(tabelas[pai])) continue
    const ids = new Set(tabelas[pai].map((l) => String(l.id)))
    const orfas = tabelas[filha].filter((l) => l[coluna] != null && !ids.has(String(l[coluna]))).length
    if (orfas) erros.push(`${nomeDe(filha)}: ${orfas} ${orfas === 1 ? 'registro aponta' : 'registros apontam'} para ${nomeDe(pai).toLowerCase()} que não existe no backup.`)
  }
  if (Array.isArray(pacote.tabelas_ausentes) && pacote.tabelas_ausentes.length) avisos.push(`Tabelas que não existiam quando o backup foi feito: ${pacote.tabelas_ausentes.join(', ')}. Elas não serão alteradas.`)
  if (Array.isArray(tabelas.compras) && !Array.isArray(tabelas.compras_pagamentos)) avisos.push('O backup não traz os pagamentos das parcelas sem cartão: substituir tudo ficará bloqueado e mesclar não os altera.')
  return { ok: erros.length === 0, erros, avisos, resumo }
}

// Comparação com o que existe hoje (`atual`: { tabela: linhas[] }). Para cada tabela:
//  novas       estão no backup e não existem hoje
//  iguais      existem hoje com o mesmo conteúdo
//  diferentes  existem hoje com conteúdo diferente (a mesclagem NUNCA sobrescreve)
//  sobrando    existem hoje e não estão no backup (a substituição apagaria)
const igual = (a, b) => {
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const c of chaves) { if (JSON.stringify(a[c] ?? null) !== JSON.stringify(b[c] ?? null)) return false }
  return true
}

export function compararComAtual(pacote, atual) {
  const tabelas = pacote.tabelas || {}
  const linhas = []
  const novasPorTabela = {}
  for (const [t, chave] of ORDEM_RESTAURACAO) {
    if (!Array.isArray(tabelas[t])) continue
    const hoje = new Map((atual[t] || []).map((l) => [String(l[chave]), l]))
    const noBackup = new Set(tabelas[t].map((l) => String(l[chave])))
    let novas = 0, iguais = 0, diferentes = 0
    const lista = []
    for (const l of tabelas[t]) {
      const existente = hoje.get(String(l[chave]))
      if (!existente) { novas++; lista.push(l) } else if (igual(l, existente)) iguais++
      else diferentes++
    }
    const sobrando = [...hoje.keys()].filter((k) => !noBackup.has(k)).length
    novasPorTabela[t] = lista
    linhas.push({ tabela: t, nome: nomeDe(t), noBackup: tabelas[t].length, hoje: hoje.size, novas, iguais, diferentes, sobrando })
  }
  return { linhas, novasPorTabela }
}

// Mesclar só é seguro se toda linha nova achar o pai (já existente hoje ou também nova). Senão, bloqueia.
export function mesclagemSegura(pacote, atual, novasPorTabela) {
  const problemas = []
  for (const [filha, coluna, pai] of RELACOES) {
    const novas = novasPorTabela[filha] || []
    if (!novas.length) continue
    const paisOk = new Set([...(atual[pai] || []).map((l) => String(l.id)), ...(novasPorTabela[pai] || []).map((l) => String(l.id))])
    const orfas = novas.filter((l) => l[coluna] != null && !paisOk.has(String(l[coluna]))).length
    if (orfas) problemas.push(`${nomeDe(filha)}: ${orfas} ${orfas === 1 ? 'registro novo ficaria' : 'registros novos ficariam'} sem ${nomeDe(pai).toLowerCase()} correspondente.`)
  }
  return { segura: problemas.length === 0, problemas }
}

export const totalNovas = (novasPorTabela) => Object.values(novasPorTabela).reduce((s, l) => s + l.length, 0)
export const chaveDaTabela = chaveDe
