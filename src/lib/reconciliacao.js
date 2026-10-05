import { chaveEstabelecimento, similaridadeEstabelecimento } from './estabelecimento.js'
import { comprasComGruposSomados } from './divisaoCompra.js'

// Procura, entre as compras já lançadas, a que provavelmente é o mesmo gasto de um evento
// (Telegram, notificação, linha de CSV...). Nunca decide sozinho: devolve o nível e quem.
//   exato    -> valor, cartão e estabelecimento iguais, no máximo 1 dia de diferença
//   provavel -> parecido o bastante para perguntar ("Vincular" ou "Criar separadamente")
//   nenhum   -> lançamento novo

const TOLERANCIA_VALOR = 0.02
const JANELA_DIAS = 3

const dias = (a, b) => Math.abs(Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000
const FATOR_DATA = [1, 0.95, 0.85, 0.75]

// Esta compra já veio (ou já foi ligada) à mesma origem? Então é outro gasto, não o mesmo.
function mesmaOrigem(compra, evento, eventos) {
  if (compra.origem && compra.origem === evento.origem) return true
  return eventos.some((x) =>
    x.compra_id === compra.id && x.origem === evento.origem && ['confirmado', 'vinculado'].includes(x.status))
}

function pontuar(ev, c, indiceAliases) {
  const valorEv = Number(ev.valor)
  const totalC = Number(c.valor_total)
  const parcC = Number(c.parcelas) || 1
  const parcEv = Number(ev.parcelas) || 1
  let valorFator
  if (Math.abs(valorEv - totalC) < TOLERANCIA_VALOR) valorFator = 1
  else if (parcC > 1 && Math.abs(valorEv - totalC / parcC) < TOLERANCIA_VALOR) valorFator = 0.9
  else return null

  let cartaoFator
  if (ev.cartao_id && c.cartao_id) {
    if (ev.cartao_id !== c.cartao_id) return null
    cartaoFator = 1
  } else if (!ev.cartao_id && !c.cartao_id) cartaoFator = 1
  else if (!ev.cartao_id && c.cartao_id) cartaoFator = 0.8 // cartão do evento desconhecido
  else return null // evento no cartão, compra sem cartão

  const sim = similaridadeEstabelecimento(
    ev.estabelecimento_chave || '',
    chaveEstabelecimento(c.descricao, indiceAliases).chave)
  if (sim === 0) return null

  const parcelado = parcC > 1 || parcEv > 1
  const d = dias(ev.data_evento, (c.data_compra || '').slice(0, 10))
  if (!parcelado && d > JANELA_DIAS) return null // parcela cai em outro mês: a data não vale
  const dataFator = parcelado ? 0.85 : FATOR_DATA[Math.round(d)] ?? 0.75

  const score = Math.round(sim * dataFator * cartaoFator * valorFator * 100) / 100
  const exato = !parcelado && valorFator === 1 && cartaoFator === 1 && sim === 1 && d <= 1
  return { compra: c, score, exato }
}

export function encontrarCorrespondencia(ev, compras, { indiceAliases = new Map(), eventos = [] } = {}) {
  // Compra dividida em categorias é uma cobrança só (soma das partes) para fatura e notificação.
  const candidatos = comprasComGruposSomados(compras)
    .filter((c) => !mesmaOrigem(c, ev, eventos))
    .map((c) => pontuar(ev, c, indiceAliases))
    .filter((x) => x && x.score >= 0.5)
    .sort((a, b) => b.score - a.score)
  if (!candidatos.length) return { nivel: 'nenhum', compra: null, score: 0, ambiguo: false, candidatos: [] }
  const melhor = candidatos[0]
  const exatos = candidatos.filter((x) => x.exato)
  // Duas compras idênticas (ex.: dois Uber de mesmo valor no dia): não dá para saber qual é.
  const ambiguo = exatos.length > 1
  const nivel = melhor.exato && !ambiguo ? 'exato' : 'provavel'
  return { nivel, compra: melhor.compra, score: melhor.score, ambiguo, candidatos: candidatos.slice(0, 3).map((x) => x.compra) }
}
