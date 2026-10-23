import { describe, it, expect } from 'vitest'
import { readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { arquivosDeInstalacao, juntarSql } from '../../../scripts/juntar-sql.mjs'

const raiz = fileURLToPath(new URL('../../../', import.meta.url))
describe('SQL de instalação nova', () => {
  it('inclui todos os inbox numerados (menos o desfazer), em ordem numérica, com o schema primeiro e a proteção por último', () => {
    const lista = arquivosDeInstalacao()
    const inbox = readdirSync(`${raiz}inbox`).filter((f) => /^\d+_.*\.sql$/.test(f))
    for (const f of inbox) expect(lista).toContain(`inbox/${f}`)
    expect(lista).not.toContain('inbox/desfazer.sql')
    expect(lista[0]).toBe('schema.sql')
    expect(lista.at(-1)).toBe('rls_login.sql')
    const numeros = lista.filter((f) => f.startsWith('inbox/')).map((f) => parseInt(f.slice(6), 10))
    expect(numeros).toEqual([...numeros].sort((a, b) => a - b))
  })
  it('o perfil esteticista só acrescenta o ajuste das pessoas no fim', () => {
    const padrao = juntarSql(raiz)
    const est = juntarSql(raiz, { perfil: 'esteticista' })
    expect(padrao).not.toContain("update public.pessoas set nome = 'Eu'")
    expect(est.startsWith(padrao)).toBe(true)
    expect(est).toContain("update public.pessoas set nome = 'Eu'")
    expect(est).toContain("where nome = 'Giovanna' and exists")
  })
})

describe('função de restauração de backup nos SQLs', () => {
  it('a lista de tabelas de cada versão da função não repete nenhuma tabela', async () => {
    const { readFileSync } = await import('node:fs')
    for (const f of arquivosDeInstalacao().filter((x) => x.startsWith('inbox/'))) {
      const t = readFileSync(`${raiz}${f}`, 'utf8')
      const i = t.indexOf('v_ordem text[][] := array[')
      if (i < 0) continue
      const nomes = [...t.slice(i, t.indexOf('];', i)).matchAll(/\['(\w+)','\w+'\]/g)].map((m) => m[1])
      expect(nomes.filter((n, k) => nomes.indexOf(n) !== k), f).toEqual([])
    }
  })
})
