import { describe, it, expect } from 'vitest'
import { PERFIS, nomeDoPerfil, doPerfil, rotuloRenda } from '../perfil'
import { lerAmbiente } from '../../../api/_lib/ambiente'

describe('perfil da instalação', () => {
  it('valor desconhecido ou vazio cai no padrão', () => {
    expect(nomeDoPerfil(undefined)).toBe('padrao')
    expect(nomeDoPerfil('xpto')).toBe('padrao')
    expect(nomeDoPerfil('constructor')).toBe('padrao')
    expect(nomeDoPerfil('esteticista')).toBe('esteticista')
  })
  it('padrão mantém aulas e os rótulos de hoje; esteticista esconde aulas e neutraliza os nomes', () => {
    expect(PERFIS.padrao.aulas).toBe(true)
    expect(PERFIS.padrao.abasOcultas).toEqual([])
    expect(rotuloRenda('giovanna', 'Salário Giovanna', PERFIS.padrao)).toBe('Salário Giovanna')
    expect(PERFIS.esteticista.aulas).toBe(false)
    expect(PERFIS.esteticista.abasOcultas).toContain('aulas')
    expect(rotuloRenda('giovanna', 'Salário Giovanna', PERFIS.esteticista)).toBe('Renda principal')
    expect(rotuloRenda('mesada', 'Mesada', PERFIS.esteticista)).toBe('Mesada')
  })
  it('as funções do servidor leem PERFIL', () => {
    const base = { SUPABASE_URL: 'u', TELEGRAM_BOT_TOKEN: 't', TELEGRAM_WEBHOOK_SECRET: 's', SUPABASE_SERVICE_ROLE_KEY: 'k' }
    expect(lerAmbiente({ ...base }).perfil.aulas).toBe(true)
    expect(lerAmbiente({ ...base, PERFIL: 'esteticista' }).perfil.aulas).toBe(false)
    expect(doPerfil('esteticista').aulas).toBe(false)
  })
})
