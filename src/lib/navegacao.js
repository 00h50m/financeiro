// Navegação do app: 6 áreas, cada uma com suas telas. Funções puras (sem React), para testar sem navegador.
// Os ids das telas (`pagamentos`, `compras`…) NÃO mudam: só a forma de agrupá-las e o endereço (#/pagamentos).

export const AREAS = [
  { id: 'inicio', titulo: 'Início', abas: ['inicio'], padrao: 'inicio' },
  { id: 'movimentacoes', titulo: 'Movimentações', abas: ['pagamentos', 'compras', 'parcelamentos', 'divididos', 'inbox', 'busca'], padrao: 'pagamentos' },
  { id: 'cartoes', titulo: 'Cartões', abas: ['faturas', 'importar', 'cartoes'], padrao: 'faturas' },
  {
    id: 'planejamento', titulo: 'Planejamento', padrao: 'meuplano',
    // as 13 telas ficam em quatro grupos por jornada (menu e chips mostram o título de cada grupo)
    grupos: [['Planejar', ['meuplano', 'renda', 'fixos', 'orcamento', 'metas', 'reserva']], ['Dívidas', ['dividas', 'emprestimos', 'simulador', 'cenario']], ['Fechar o mês', ['fechamento']], ['Negócios', ['aulas', 'atendimentos']]],
    abas: ['meuplano', 'renda', 'fixos', 'orcamento', 'metas', 'reserva', 'dividas', 'emprestimos', 'simulador', 'cenario', 'fechamento', 'aulas', 'atendimentos'],
  },
  { id: 'analises', titulo: 'Análises', abas: ['analises'], padrao: 'analises' },
  { id: 'mais', titulo: 'Mais', abas: ['categorias', 'pessoas', 'regras', 'automacoes', 'config', 'backup'], padrao: 'config' },
]

// Áreas já sem as telas que o perfil da instalação esconde; área sem nenhuma tela some; o padrão passa para a 1ª tela que sobrou.
export function areasVisiveis(abasOcultas = []) {
  return AREAS
    .map((a) => {
      const abas = a.abas.filter((id) => !abasOcultas.includes(id))
      const grupos = a.grupos ? a.grupos.map(([titulo, ids]) => [titulo, ids.filter((id) => abas.includes(id))]).filter(([, ids]) => ids.length) : null
      return { ...a, abas, ...(grupos ? { grupos } : {}), padrao: abas.includes(a.padrao) ? a.padrao : abas[0] }
    })
    .filter((a) => a.abas.length > 0)
}

export const areaDaAba = (id, areas = AREAS) => areas.find((a) => a.abas.includes(id)) || null

// Endereço de uma tela: #/pagamentos (ou #/analises/evolucao quando a tela tem abas internas). Telas desconhecidas não geram endereço.
export const hashDaAba = (id) => `#/${id}`
export const hashDaRota = (aba, sub) => (sub ? `#/${aba}/${sub}` : `#/${aba}`)

// Telas que viraram abas de outra: os endereços e atalhos antigos continuam funcionando.
//   #/dashboard → Análises > Visão geral · #/graficos e #/evolucao → Análises > Evolução · #/porpessoa → Análises > Pessoas · #/calendario → Pagamentos > Calendário
export const ALIASES = {
  dashboard: { aba: 'analises', sub: 'visao' },
  graficos: { aba: 'analises', sub: 'evolucao' },
  evolucao: { aba: 'analises', sub: 'evolucao' },
  porpessoa: { aba: 'analises', sub: 'pessoas' },
  calendario: { aba: 'pagamentos', sub: 'calendario' },
}
// id (talvez antigo) + sub opcional → { aba, sub } com o id real da tela.
export const resolverRota = (id, sub = null) => ALIASES[id] || { aba: id, sub: sub || null }

// Lê #/tela ou #/tela/aba. Só vale tela que existe (e que o perfil não esconde); nunca devolve texto livre.
export function rotaDoHash(hash, validas) {
  const m = /^#\/([a-z0-9_-]+)(?:\/([a-z0-9_-]+))?\/?$/i.exec(String(hash || ''))
  if (!m) return null
  const r = resolverRota(m[1], m[2] || null)
  return validas.includes(r.aba) ? r : null
}
export const abaDoHash = (hash, validas) => rotaDoHash(hash, validas)?.aba || null

// Qual tela abrir ao iniciar: o endereço (link direto) vence a última tela guardada no aparelho; senão o Início.
export function rotaInicial({ hash, salva, validas }) {
  const doHash = rotaDoHash(hash, validas)
  if (doHash) return doHash
  const guardada = resolverRota(salva)
  return validas.includes(guardada.aba) ? guardada : { aba: validas.includes('inicio') ? 'inicio' : validas[0], sub: null }
}
export const abaInicial = (args) => rotaInicial(args).aba

// Ao tocar numa área: volta para a última tela que você usou nela (se ainda existir) ou para a tela principal dela.
export function destinoDaArea(area, lembradas = {}) {
  const ultima = lembradas?.[area.id]
  return ultima && area.abas.includes(ultima) ? ultima : area.padrao
}

// Atalhos da barra inferior do celular: 5 posições. Análises e Mais ficam sob "Mais" (que abre o menu completo).
export const ATALHOS = ['inicio', 'movimentacoes', 'cartoes', 'planejamento', 'mais']
export const atalhoDaArea = (areaId) => (areaId === 'analises' ? 'mais' : areaId)

export function lerLembradas(texto) {
  try { const v = JSON.parse(texto || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {} } catch { return {} }
}

// Título do grupo (se a área tem grupos) de cada tela: { meuplano: 'Planejar', dividas: 'Dívidas', … }.
export function grupoDaAba(area) {
  const mapa = {}
  for (const [titulo, ids] of area.grupos || []) for (const id of ids) mapa[id] = titulo
  return mapa
}
