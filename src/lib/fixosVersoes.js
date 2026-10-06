// Uma conta fixa pode ter várias "versões" (linhas) quando o valor mudou a partir de certo mês. Aqui elas viram UMA conta:
// a versão em vigor aparece na lista e as anteriores ficam como histórico; os valores reais dos meses valem para a conta toda.
import { normBasico } from './normalizacao.js'

export const chaveConta = (f) => [normBasico(f.nome), f.pessoa || '', f.cartao_id || ''].join('|')
const inicioDe = (f) => f.mes_inicio || '0000-00'

// -> [{ chave, principal, versoes: [da mais antiga para a mais nova] }]; principal = a que vale em `mes`, senão a mais recente.
export function agruparVersoes(fixos, mes) {
  const mapa = new Map()
  for (const f of fixos) {
    const k = chaveConta(f)
    if (!mapa.has(k)) mapa.set(k, [])
    mapa.get(k).push(f)
  }
  return [...mapa.entries()].map(([chave, versoes]) => {
    const ordenadas = [...versoes].sort((a, b) => inicioDe(a).localeCompare(inicioDe(b)))
    const vigente = ordenadas.filter((f) => f.ativo && inicioDe(f) <= mes && (!f.mes_fim || f.mes_fim >= mes)).pop()
    return { chave, principal: vigente || ordenadas[ordenadas.length - 1], versoes: ordenadas }
  })
}

// valoresPorId: Map(id -> { 'AAAA-MM': valor }). Devolve Map(id -> valores da conta inteira): o valor real informado em
// qualquer versão vale para o mês dele, mesmo se a linha que o guardou já terminou (antes ficava "perdido" ao mudar a estimativa).
export function unirValores(fixos, valoresPorId) {
  const grupos = new Map()
  for (const f of fixos) {
    const k = chaveConta(f)
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k).push(f)
  }
  const saida = new Map()
  for (const versoes of grupos.values()) {
    const unido = Object.assign({}, ...[...versoes].sort((a, b) => inicioDe(a).localeCompare(inicioDe(b))).map((f) => valoresPorId.get(f.id) || {}))
    if (Object.keys(unido).length) versoes.forEach((f) => saida.set(f.id, unido))
  }
  return saida
}
