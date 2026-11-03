// Navegação do app: 6 áreas, cada uma com suas telas. Funções puras (sem React), para testar sem navegador.
// Os ids das telas (`pagamentos`, `compras`…) NÃO mudam: só a forma de agrupá-las e o endereço (#/pagamentos).

export const AREAS = [
  { id: 'inicio', titulo: 'Início', abas: ['inicio'], padrao: 'inicio' },
  { id: 'movimentacoes', titulo: 'Movimentações', abas: ['pagamentos', 'compras', 'parcelamentos', 'divididos', 'inbox', 'busca'], padrao: 'pagamentos' },
  { id: 'cartoes', titulo: 'Cartões', abas: ['faturas', 'importar', 'cartoes'], padrao: 'faturas' },
  { id: 'planejamento', titulo: 'Planejamento', abas: ['meuplano', 'renda', 'fixos', 'orcamento', 'metas', 'reserva', 'dividas', 'emprestimos', 'simulador', 'cenario', 'fechamento', 'aulas', 'atendimentos'], padrao: 'meuplano' },
  { id: 'analises', titulo: 'Análises', abas: ['dashboard', 'graficos', 'evolucao', 'calendario', 'porpessoa'], padrao: 'dashboard' },
  { id: 'mais', titulo: 'Mais', abas: ['categorias', 'pessoas', 'regras', 'automacoes', 'config', 'backup'], padrao: 'config' },
]

// Áreas já sem as telas que o perfil da instalação esconde; área sem nenhuma tela some; o padrão passa para a 1ª tela que sobrou.
export function areasVisiveis(abasOcultas = []) {
  return AREAS
    .map((a) => {
      const abas = a.abas.filter((id) => !abasOcultas.includes(id))
      return { ...a, abas, padrao: abas.includes(a.padrao) ? a.padrao : abas[0] }
    })
    .filter((a) => a.abas.length > 0)
}

export const areaDaAba = (id, areas = AREAS) => areas.find((a) => a.abas.includes(id)) || null

// Endereço de uma tela: #/pagamentos. Telas desconhecidas não geram endereço.
export const hashDaAba = (id) => `#/${id}`
export function abaDoHash(hash, validas) {
  const m = /^#\/([a-z0-9_-]+)\/?$/i.exec(String(hash || ''))
  return m && validas.includes(m[1]) ? m[1] : null
}

// Qual tela abrir ao iniciar: o endereço (link direto) vence a última tela guardada no aparelho; senão o Início.
export function abaInicial({ hash, salva, validas }) {
  return abaDoHash(hash, validas) || (validas.includes(salva) ? salva : validas.includes('inicio') ? 'inicio' : validas[0])
}

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
