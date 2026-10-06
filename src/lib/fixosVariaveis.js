// Contas fixas de valor variável: média dos meses já informados e pendências (venceu e ainda está só estimada).
import { addMonths, fixosAtivos } from './utils.js'

const r2 = (n) => Math.round(n * 100) / 100

// Média dos últimos `n` valores reais informados ANTES de `mes` (ignora meses futuros). null se nunca informou nada.
export function mediaRecente(fixo, mes, n = 3) {
  const reais = Object.entries(fixo?.valores || {}).filter(([m]) => m < mes).sort(([a], [b]) => b.localeCompare(a)).slice(0, n)
  if (!reais.length) return null
  return { media: r2(reais.reduce((t, [, v]) => t + Number(v), 0) / reais.length), meses: reais.length }
}

// Contas variáveis ainda só com estimativa que já deveriam ter o valor real:
//  - 'vencida': é este mês e o dia de vencimento já passou;
//  - 'passado': mês anterior (até `voltar` meses) sem valor real — o número daquele mês é só um palpite.
// hoje = 'YYYY-MM-DD'. -> [{ fixo, mes, tipo, diasAtraso }]
export function pendenciasValorVariavel(fixos, hoje, { voltar = 3 } = {}) {
  const mesAtual = hoje.slice(0, 7)
  const dia = Number(hoje.slice(8, 10))
  const saida = []
  for (let i = 0; i <= voltar; i++) {
    const m = addMonths(mesAtual, -i)
    for (const f of fixosAtivos(fixos, m)) {
      if (!f.variavel || !f.estimado) continue
      if (i === 0) {
        if (f.dia_vencimento && dia > Number(f.dia_vencimento)) saida.push({ fixo: f, mes: m, tipo: 'vencida', diasAtraso: dia - Number(f.dia_vencimento) })
      } else {
        saida.push({ fixo: f, mes: m, tipo: 'passado', diasAtraso: null })
      }
    }
  }
  return saida
}
