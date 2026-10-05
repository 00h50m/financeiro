// Interpreta mensagens como "gastei 89,90 no Outback no Nubank" ou "mercado 187,40 inter gi".
// Determinístico (sem IA) e conservador: o que não dá para afirmar com segurança vira
// "ambíguo" ou "faltando" e o bot pergunta — nunca é chutado.

const VERBOS = new Set(['gastei', 'comprei', 'paguei', 'gasto', 'compra', 'comprado', 'gastou', 'comprou', 'lancar', 'lance', 'registrar', 'registra', 'reais', 'real'])
const LIGACAO = new Set(['no', 'na', 'nos', 'nas', 'em', 'de', 'do', 'da', 'dos', 'das', 'por', 'pelo', 'pela', 'com', 'para', 'pra', 'pro', 'ao', 'a', 'o', 'as', 'os', 'um', 'uma', 'e', 'via'])
const ANTES_DE_PESSOA = new Set(['da', 'do', 'de', 'pra', 'para', 'pro', 'pela', 'pelo', 'por', 'pro'])
const FORMAS = [
  [/\bpix\b/, 'pix'], [/\bdinheiro\b|\bespecie\b/, 'dinheiro'], [/\bboleto\b/, 'boleto'], [/\bsem\s+cartao\b/, 'outro'],
]

// Minúsculas e sem acento, preservando o comprimento (posições batem com o texto original).
const dobrar = (s) => s.split('').map((ch) => ch.normalize('NFD')[0].toLowerCase()).join('')
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const somarDias = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10)
const dataReal = (a, m, d) => {
  const iso = `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  const dt = new Date(iso + 'T12:00:00Z')
  return dt.getUTCFullYear() === a && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d ? iso : null
}

// "89,90" · "R$ 1.234,56" · "89.90" · "120" -> número (ou null)
export function parseValor(texto) {
  const m = dobrar(String(texto)).match(/^\s*(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*$/)
  return m ? numero(m[1]) : null
}
function numero(s) {
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s)) return Number(s.replace(/\./g, '').replace(',', '.'))
  return Number(s.replace(',', '.'))
}

// "hoje" · "ontem" · "anteontem" · "05/10" · "05/10/2026" -> { data } | { invalida: true } | null
export function parseData(texto, hoje) {
  const t = dobrar(String(texto)).trim()
  if (t === 'hoje') return { data: hoje }
  if (t === 'ontem') return { data: somarDias(hoje, -1) }
  if (t === 'anteontem') return { data: somarDias(hoje, -2) }
  if (t === 'amanha' || t === 'depois de amanha') return { invalida: true } // gasto não pode ser futuro
  const m = t.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/)
  if (!m) return null
  const [dia, mes] = [Number(m[1]), Number(m[2])]
  const anoHoje = Number(hoje.slice(0, 4))
  let ano = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : anoHoje
  let data = dataReal(ano, mes, dia)
  // Sem ano e no futuro: "28/12" digitado em janeiro é do ano passado; "05/10" digitado em 04/10 é só data futura (inválida).
  if (data && !m[3] && data > hoje && data > somarDias(hoje, 60)) data = dataReal(ano - 1, mes, dia)
  return data && data <= hoje ? { data } : { invalida: true }
}

// ctx: { cartoes, pessoas, hoje, remetente_pessoa_id }
export function interpretarMensagem(entrada, ctx) {
  const { cartoes = [], pessoas = [], hoje, remetente_pessoa_id = null } = ctx
  const texto = String(entrada || '').normalize('NFC')
  const n = dobrar(texto)
  const usado = new Array(texto.length).fill(false) // posições já "consumidas" por algum campo
  const marcar = (ini, fim) => { for (let i = ini; i < fim; i++) usado[i] = true }
  const livre = (ini, fim) => { for (let i = ini; i < fim; i++) if (usado[i]) return false; return true }
  const r = {
    valor: null, valorAmbiguo: false, descricao: '', parcelas: null, data_evento: null, dataInvalida: false,
    forma_pagamento: null, cartao_id: null, cartaoAmbiguo: null, pessoa_id: null, pessoaAmbigua: null, obs: null,
  }

  // Observação: "obs: ..." até o fim.
  const mo = n.match(/\b(?:obs|observacao)\s*[:\-]\s*(.+)$/)
  if (mo) {
    r.obs = texto.slice(mo.index + mo[0].length - mo[1].length).trim() || null
    marcar(mo.index, texto.length)
  }

  // Parcelas: "3x", "em 3 vezes", "6 parcelas".
  const mp = [...n.matchAll(/\b(?:em\s+)?(\d{1,2})\s*(?:x|vezes|parcelas?)\b/g)].find((m) => livre(m.index, m.index + m[0].length))
  if (mp) {
    r.parcelas = Number(mp[1])
    marcar(mp.index, mp.index + mp[0].length)
  }

  // Data: hoje / ontem / anteontem / dd/mm[/aaaa].
  const md = [...n.matchAll(/\b(hoje|ontem|anteontem|depois\s+de\s+amanha|amanha)\b|\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/g)].find((m) => livre(m.index, m.index + m[0].length))
  if (md) {
    const d = parseData(md[0].replace(/\s+/g, ' '), hoje)
    if (d?.data) r.data_evento = d.data
    else r.dataInvalida = true
    marcar(md.index, md.index + md[0].length)
  }

  // Valor: "R$" > decimal/milhar > inteiro. Empate de valores diferentes = ambíguo.
  const candidatos = [...n.matchAll(/(?<![\/\d.,:])(r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?![\d\/:])/g)]
    .filter((m) => livre(m.index, m.index + m[0].length))
    .map((m) => ({ m, v: numero(m[2]), peso: m[1] ? 3 : /[.,]\d{1,2}$/.test(m[2]) || m[2].includes('.') ? 2 : 1 }))
  if (candidatos.length) {
    const topo = Math.max(...candidatos.map((c) => c.peso))
    const melhores = candidatos.filter((c) => c.peso === topo)
    if (new Set(melhores.map((c) => c.v)).size > 1) r.valorAmbiguo = true
    else {
      r.valor = melhores[0].v
      marcar(melhores[0].m.index, melhores[0].m.index + melhores[0].m[0].length)
    }
  }

  // Forma de pagamento sem cartão.
  for (const [re, forma] of FORMAS) {
    const m = n.match(re)
    if (m && livre(m.index, m.index + m[0].length)) {
      r.forma_pagamento = forma
      marcar(m.index, m.index + m[0].length)
      break
    }
  }

  // Pessoa: apelidos valem em qualquer lugar; nomes só no fim da frase ou depois de "da/do/pra..."
  // (evita confundir "Casa Bahia" com a pessoa "Casa").
  const achadas = []
  pessoas.forEach((p) => {
    const apelidos = (p.apelidos || []).map(dobrar)
    const palavras = [{ w: dobrar(p.nome), alias: false }, ...apelidos.map((w) => ({ w, alias: true }))]
    for (const { w, alias } of palavras) {
      for (const m of n.matchAll(new RegExp(`(?<![a-z0-9])${escapar(w)}(?![a-z0-9])`, 'g'))) {
        if (!livre(m.index, m.index + w.length)) continue
        const antes = n.slice(0, m.index).trim().split(/\s+/).pop()
        const fim = !n.slice(m.index + w.length).replace(/[\s.!?]/g, '')
        if (alias || fim || ANTES_DE_PESSOA.has(antes)) { achadas.push({ p, ini: m.index, fim: m.index + w.length }); return }
      }
    }
  })
  const distintas = [...new Map(achadas.map((a) => [a.p.id, a.p])).values()]
  if (distintas.length === 1) r.pessoa_id = distintas[0].id
  else if (distintas.length > 1) r.pessoaAmbigua = distintas.map((p) => p.id)
  if (distintas.length) achadas.forEach((a) => marcar(a.ini, a.fim))
  const pessoaRef = r.pessoa_id || remetente_pessoa_id

  // Cartão: nome completo (2) ou só a primeira palavra do nome (1). Se vários cartões batem
  // ("Nubank Gi" e "Nubank Sabi" para "nubank"), tenta desempatar pelo titular.
  const encontrados = cartoes.map((c) => {
    const toks = dobrar(c.nome).split(/[^a-z0-9]+/).filter(Boolean)
    if (!toks.length) return null
    const tentativa = (frase) => {
      for (const m of n.matchAll(new RegExp(`(?<![a-z0-9])${frase}(?![a-z0-9])`, 'g'))) {
        if (livre(m.index, m.index + m[0].length)) return m
      }
      return null
    }
    const cheio = tentativa(toks.map(escapar).join('\\s+'))
    const base = !cheio && toks[0].length >= 3 ? tentativa(escapar(toks[0])) : null
    const m = cheio || base
    return m ? { c, peso: cheio ? 2 : 1, ini: m.index, fim: m.index + m[0].length } : null
  }).filter(Boolean)
  if (encontrados.length) {
    const topo = Math.max(...encontrados.map((e) => e.peso))
    let cand = encontrados.filter((e) => e.peso === topo)
    if (cand.length > 1 && pessoaRef) {
      const nomePessoa = pessoas.find((p) => p.id === pessoaRef)?.nome
      const doTitular = cand.filter((e) => e.c.titular === nomePessoa)
      if (doTitular.length === 1) cand = doTitular
    }
    if (cand.length === 1) r.cartao_id = cand[0].c.id
    else r.cartaoAmbiguo = cand.map((e) => e.c.id)
    marcar(cand[0].ini, cand[0].fim)
  }
  if (r.cartao_id) r.forma_pagamento = null

  // Descrição: o que sobrou, sem verbos soltos e sem ligações ("no", "de", "por"...) nas pontas.
  const sobra = [...texto.matchAll(/\S+/g)]
    .filter((m) => livre(m.index, m.index + m[0].length))
    .map((m) => ({ txt: m[0], f: dobrar(m[0]).replace(/[^a-z0-9]/g, '') }))
    .filter((t) => t.f && !VERBOS.has(t.f) && t.f !== 'rs')
  while (sobra.length && LIGACAO.has(sobra[0].f)) sobra.shift()
  while (sobra.length && LIGACAO.has(sobra[sobra.length - 1].f)) sobra.pop()
  r.descricao = sobra.map((t) => t.txt).join(' ').replace(/[,;]+$/, '').trim()
  return r
}
