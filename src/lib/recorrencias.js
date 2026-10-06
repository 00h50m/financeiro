// Assinaturas e cobranças recorrentes: compras à vista que se repetem todo mês e ainda não são uma conta fixa.
import { chaveEstabelecimento, similaridadeEstabelecimento } from './estabelecimento.js'
import { addMonths } from './utils.js'

const r2 = (n) => Math.round(n * 100) / 100
const mediana = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2 }

// mesAtual 'AAAA-MM'. Procura nos últimos `janela` meses (incluindo o atual): precisa aparecer em pelo menos `minimo` meses diferentes.
// -> [{ chave, nome, cartao_id, categoria, subcategoria, pessoa, meses, valores, medio, ultimo, valorFixo, aumento }]
export function detectarRecorrencias(compras, fixos, mesAtual, { janela = 6, minimo = 3, aliases = new Map(), ignoradas = [] } = {}) {
  const inicio = addMonths(mesAtual, -(janela - 1))
  const grupos = new Map()
  for (const c of compras) {
    if ((Number(c.parcelas) || 1) > 1 || c.origem === 'emprestimo') continue
    const mes = String(c.data_compra).slice(0, 7)
    if (mes < inicio || mes > mesAtual) continue
    const chave = chaveEstabelecimento(c.descricao_original || c.descricao || '', aliases).chave
    if (!chave) continue
    const k = `${chave}|${c.cartao_id || ''}`
    if (!grupos.has(k)) grupos.set(k, { chave, itens: [] })
    grupos.get(k).itens.push({ c, mes })
  }
  const saida = []
  for (const { chave, itens } of grupos.values()) {
    // um valor por mês (se houver dois no mesmo mês, é compra comum, não assinatura)
    const porMes = new Map()
    itens.forEach((i) => { if (!porMes.has(i.mes)) porMes.set(i.mes, []); porMes.get(i.mes).push(i) })
    if ([...porMes.values()].some((l) => l.length > 1)) continue
    const meses = [...porMes.keys()].sort()
    if (meses.length < minimo) continue
    // quase todo mês: no máximo 1 lacuna dentro do intervalo observado
    const esperado = (() => { let n = 1; for (let m = meses[0]; m < meses[meses.length - 1]; m = addMonths(m, 1)) n++; return n })()
    if (esperado - meses.length > 1) continue
    const ordenados = meses.map((m) => porMes.get(m)[0].c)
    const valores = ordenados.map((c) => Number(c.valor_total))
    const med = mediana(valores)
    const valorFixo = valores.every((v) => Math.abs(v - med) <= med * 0.02 + 0.01)
    if (!valorFixo && !valores.every((v) => Math.abs(v - med) <= med * 0.3)) continue // varia demais: não é cobrança recorrente
    const ultima = ordenados[ordenados.length - 1]
    const nome = ultima.identificacao || ultima.descricao
    // já é conta fixa?
    const jaFixo = fixos.some((f) => similaridadeEstabelecimento(chave, chaveEstabelecimento(f.nome, aliases).chave) >= 0.7)
    if (jaFixo) continue
    if (ignoradas.includes(chave)) continue
    const ult = valores[valores.length - 1]
    const ant = valores[valores.length - 2]
    const aumento = valores.length >= 3 && ult > ant * 1.05 && Math.abs(ant - valores[valores.length - 3]) <= ant * 0.02 + 0.01
      ? { de: ant, para: ult, pct: Math.round(((ult - ant) / ant) * 100) } : null
    saida.push({ chave, nome, cartao_id: ultima.cartao_id || null, categoria: ultima.categoria, subcategoria: ultima.subcategoria, pessoa: ultima.pessoa, meses, valores, medio: r2(valores.reduce((t, v) => t + v, 0) / valores.length), ultimo: ult, valorFixo, aumento })
  }
  return saida.sort((a, b) => b.ultimo - a.ultimo)
}
