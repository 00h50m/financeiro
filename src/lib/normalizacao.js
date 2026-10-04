// Normalização de descrições (faturas, Telegram, notificações). O texto original
// nunca é substituído: estas funções só geram chaves de comparação.

export const round2 = (n) => Math.round(n * 100) / 100

// Fatura costuma trazer "Estabelecimento - Parcela 2/6": o trecho da parcela muda todo mês,
// então ele sai do nome (a parcela fica nos campos próprios) para o casamento com o mês anterior funcionar.
export const REGEX_PARCELA = /parc(?:ela)?\.?\s*(\d+)\s*(?:\/|de)\s*(\d+)/i

export function extrairParcela(s) {
  const m = (s || '').match(REGEX_PARCELA)
  return m ? { atual: m[1], total: m[2] } : null
}

export function limparDescricao(s) {
  return (s || '')
    .replace(new RegExp('\\s*[-\\u2013\\u2014:]?\\s*' + REGEX_PARCELA.source, 'gi'), '')
    .replace(/\s*[-–—:]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normBasico(s) {
  return (s || '')
    .toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

// Normalização mais agressiva, usada só para casar descrições com o histórico de compras
// (remove *, números e datas — ex: "*NETFLIX 03/09" e "NETFLIX 12/08" viram a mesma chave).
export function normHistorico(s) {
  return normBasico(s)
    .replace(/\*/g, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export const normNome = (s) => normBasico(limparDescricao(s))

export function construirHistoricoCategorias(compras) {
  const contagem = {}
  compras.forEach((c) => {
    const chave = normHistorico(c.descricao)
    if (!chave || !c.categoria || !c.subcategoria) return
    if (!contagem[chave]) contagem[chave] = {}
    const catChave = `${c.categoria}|||${c.subcategoria}`
    contagem[chave][catChave] = (contagem[chave][catChave] || 0) + 1
  })
  const melhor = {}
  Object.entries(contagem).forEach(([chave, opcoes]) => {
    let bestKey = null
    let bestN = 0
    Object.entries(opcoes).forEach(([k, n]) => { if (n > bestN) { bestN = n; bestKey = k } })
    if (bestKey) {
      const [categoria, subcategoria] = bestKey.split('|||')
      melhor[chave] = { categoria, subcategoria }
    }
  })
  return melhor
}
