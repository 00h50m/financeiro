import { describe, it, expect } from 'vitest'
import { validarBackup, compararComAtual, mesclagemSegura, totalNovas } from '../restauracao'
import { BACKUP_VERSAO, SCHEMA_BANCO } from '../versao'

const pacoteOk = (extra = {}) => ({
  app: 'Sobrou!', backup_versao: BACKUP_VERSAO, schema_banco: SCHEMA_BANCO, versao_app: 'x',
  contagens: { compras: 1, cartoes: 1, faturas: 1, fixos: 1, fixos_pagamentos: 1, rendas: 1, categorias: 1, pessoas: 1, saldo_ajustes: 0, compras_pagamentos: 1 },
  tabelas: {
    compras: [{ id: 'k1', cartao_id: 'c1', valor_total: 10 }], cartoes: [{ id: 'c1', nome: 'Nu' }], faturas: [{ id: 'f1', cartao_id: 'c1', mes: '2026-09' }],
    fixos: [{ id: 'x1', nome: 'Aluguel' }], fixos_pagamentos: [{ id: 'p1', fixo_id: 'x1', mes: '2026-09' }], rendas: [{ id: 'r1', mes: '2026-09' }],
    categorias: [{ id: 'g1', nome: 'Casa' }], pessoas: [{ id: 'e1', nome: 'Gi' }], saldo_ajustes: [], compras_pagamentos: [{ id: 'cp1', compra_id: 'k1', mes: '2026-09' }],
  },
  ...extra,
})

describe('validarBackup', () => {
  it('aceita um backup íntegro', () => {
    const v = validarBackup(pacoteOk())
    expect(v.ok).toBe(true)
    expect(v.erros).toEqual([])
    expect(v.resumo.find((r) => r.tabela === 'compras').linhas).toBe(1)
  })
  it('recusa o que não é backup do app', () => {
    expect(validarBackup(null).ok).toBe(false)
    expect(validarBackup([]).ok).toBe(false)
    expect(validarBackup({ app: 'Outro', tabelas: {} }).ok).toBe(false)
  })
  it('recusa formato mais novo que o app entende', () => {
    expect(validarBackup(pacoteOk({ backup_versao: BACKUP_VERSAO + 1 })).erros.join()).toMatch(/formato mais novo/)
  })
  it('sem versão de formato é erro', () => {
    const p = pacoteOk(); delete p.backup_versao
    expect(validarBackup(p).ok).toBe(false)
  })
  it('banco mais novo ou mais antigo só avisa', () => {
    expect(validarBackup(pacoteOk({ schema_banco: SCHEMA_BANCO + 1 })).avisos.join()).toMatch(/mais novo/)
    const v = validarBackup(pacoteOk({ schema_banco: SCHEMA_BANCO - 1 }))
    expect(v.ok).toBe(true)
    expect(v.avisos.join()).toMatch(/mais antigo/)
  })
  it('tabela obrigatória ausente', () => {
    const p = pacoteOk(); delete p.tabelas.compras
    expect(validarBackup(p).erros.join()).toMatch(/Faltam dados obrigatórios: Compras/)
  })
  it('contagem diferente do conteúdo = arquivo corrompido', () => {
    expect(validarBackup(pacoteOk({ contagens: { compras: 5 } })).erros.join()).toMatch(/orrompido/)
  })
  it('identificador repetido ou ausente', () => {
    const p = pacoteOk(); p.tabelas.compras.push({ id: 'k1', cartao_id: 'c1' }); p.contagens.compras = 2
    expect(validarBackup(p).erros.join()).toMatch(/identificador repetido/)
    const q = pacoteOk(); q.tabelas.cartoes[0].id = null
    expect(validarBackup(q).erros.join()).toMatch(/sem identificador/)
  })
  it('relação quebrada (compra apontando para cartão que não existe)', () => {
    const p = pacoteOk(); p.tabelas.compras[0].cartao_id = 'zzz'
    expect(validarBackup(p).erros.join()).toMatch(/aponta para cartões/)
  })
  it('backup sem pagamentos de parcela avisa', () => {
    const p = pacoteOk(); delete p.tabelas.compras_pagamentos; delete p.contagens.compras_pagamentos
    const v = validarBackup(p)
    expect(v.ok).toBe(true)
    expect(v.avisos.join()).toMatch(/pagamentos das parcelas/)
  })
})

describe('compararComAtual e mesclagem', () => {
  const p = pacoteOk()
  it('conta novas, iguais, diferentes e sobrando', () => {
    const atual = { compras: [{ id: 'k1', cartao_id: 'c1', valor_total: 99 }, { id: 'k9', cartao_id: 'c1' }], cartoes: [{ id: 'c1', nome: 'Nu' }], pessoas: [] }
    const c = compararComAtual(p, atual)
    expect(c.linhas.find((l) => l.tabela === 'compras')).toMatchObject({ novas: 0, iguais: 0, diferentes: 1, sobrando: 1 })
    expect(c.linhas.find((l) => l.tabela === 'cartoes')).toMatchObject({ novas: 0, iguais: 1 })
    expect(c.linhas.find((l) => l.tabela === 'pessoas')).toMatchObject({ novas: 1 })
  })
  it('mesclar nunca inclui linha que já existe (mesmo diferente)', () => {
    const atual = { compras: [{ id: 'k1', cartao_id: 'c1', valor_total: 99 }] }
    expect(compararComAtual(p, atual).novasPorTabela.compras).toEqual([])
  })
  it('mesclagem é segura quando o pai existe hoje ou também é novo', () => {
    const atual = { cartoes: [{ id: 'c1' }], compras: [], faturas: [], fixos: [], pessoas: [] }
    const c = compararComAtual(p, atual)
    expect(mesclagemSegura(p, atual, c.novasPorTabela).segura).toBe(true)
    expect(totalNovas(c.novasPorTabela)).toBeGreaterThan(0)
  })
  it('mesclagem bloqueia filho órfão', () => {
    const atual = { compras: [{ id: 'kX' }], cartoes: [], faturas: [], fixos: [] }
    const q = pacoteOk(); q.tabelas.cartoes = []; q.contagens.cartoes = 0
    const c = compararComAtual(q, atual)
    const r = mesclagemSegura(q, atual, c.novasPorTabela)
    expect(r.segura).toBe(false)
    expect(r.problemas.join()).toMatch(/sem cartões correspondente/)
  })
})
