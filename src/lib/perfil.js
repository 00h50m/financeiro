// Perfil da instalação: mesmo código, instalações separadas (cada uma com o seu banco). Escolhido por VITE_PERFIL no site e PERFIL nas funções /api.
//  padrao       → o app como é hoje (inclui Aulas particulares)
//  esteticista  → sem Aulas particulares; textos de renda neutros (sem nomes de pessoas)
const COMUM = { aulas: true, abasOcultas: [], rendaRotulos: {}, exemploCartao: 'Nubank Giovanna' }

export const PERFIS = {
  padrao: { ...COMUM },
  esteticista: {
    ...COMUM, aulas: false, abasOcultas: ['aulas'],
    rendaRotulos: { giovanna: 'Renda principal', sabrina: 'Outra renda fixa', extra_sabrina: 'Extra' },
    exemploCartao: 'Nubank',
  },
}

export const nomeDoPerfil = (valor) => (Object.prototype.hasOwnProperty.call(PERFIS, valor) ? valor : 'padrao')
export const doPerfil = (valor) => PERFIS[nomeDoPerfil(valor)]

// Perfil desta instalação (no navegador: VITE_PERFIL, definido na Vercel antes do build).
const bruto = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_PERFIL : undefined
export const PERFIL = nomeDoPerfil(bruto)
export const perfil = PERFIS[PERFIL]

// Rótulo de uma fonte de renda neste perfil.
export const rotuloRenda = (campo, padrao, p = perfil) => p.rendaRotulos[campo] || padrao
