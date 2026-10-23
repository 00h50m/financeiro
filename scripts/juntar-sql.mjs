/* global process, URL */
// Junta todos os SQLs de instalação, na ordem certa, num arquivo só para colar no SQL Editor do Supabase de uma instalação nova.
//   node scripts/juntar-sql.mjs > banco-completo.sql             (perfil padrão)
//   node scripts/juntar-sql.mjs esteticista > banco-completo.sql  (perfil esteticista: uma pessoa só)
// Não tem dado de ninguém: só a estrutura (tabelas, regras de segurança e funções).
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const raiz = fileURLToPath(new URL('../', import.meta.url))
const BASE = ['schema.sql', 'orcamentos.sql', 'config.sql', 'cartoes_limite.sql', 'fixos_mes_inicio.sql', 'fixos_cartao.sql']
const FIM = ['rls_login.sql'] // protege as tabelas só para usuários logados: por último

export function arquivosDeInstalacao(dir = raiz) {
  const inbox = readdirSync(join(dir, 'inbox')).filter((f) => /^\d+_.*\.sql$/.test(f)).sort((a, b) => parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b))
  return [...BASE, ...inbox.map((f) => `inbox/${f}`), ...FIM]
}

// Ajustes de dados iniciais por perfil (o schema.sql nasce com as pessoas "Giovanna" e "Sabrina").
export const SQL_DO_PERFIL = {
  esteticista: `-- Perfil esteticista: uma pessoa só ("Eu"); dá para renomear e adicionar mais depois, na tela Pessoas.
delete from public.pessoas where nome = 'Sabrina';
update public.pessoas set nome = 'Eu', apelidos = array['eu'] where nome = 'Giovanna';
`,
}

export function juntarSql(dir = raiz, { perfil = '' } = {}) {
  const extra = SQL_DO_PERFIL[perfil] ? `\n-- ============================================================\n-- perfil: ${perfil}\n-- ============================================================\n${SQL_DO_PERFIL[perfil]}` : ''
  return arquivosDeInstalacao(dir).map((f) => `-- ============================================================\n-- ${f}\n-- ============================================================\n${readFileSync(join(dir, f), 'utf8').trim()}\n`).join('\n') + extra
}

// node scripts/juntar-sql.mjs [esteticista] > banco-completo.sql
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.stdout.write(juntarSql(raiz, { perfil: process.argv[2] || '' }))
