// Texto de campos de valor em reais (ver components/ui/CampoDinheiro.jsx).
export const paraCampoDinheiro = (n) => (n == null || n === '' || !Number.isFinite(Number(n)) ? '' : Number(n).toFixed(2).replace('.', ','))

// Deixa só dígitos e um separador decimal (a vírgula vale mais que o ponto), no máximo 2 casas.
// `casas`: máximo de casas decimais (padrão 2). `negativo`: aceita um "−" no começo (ex.: saldo da conta).
export function limparDinheiro(t, { casas = 2, negativo = false } = {}) {
  const sinal = negativo && /^\s*-/.test(String(t ?? '')) ? '-' : ''
  return sinal + limparSemSinal(t, casas)
}

function limparSemSinal(t, casas) {
  let s = String(t ?? '').replace(/[^\d.,]/g, '')
  const virg = s.indexOf(',')
  if (virg >= 0) {
    const inteiro = s.slice(0, virg).replace(/[.,]/g, '')
    const dec = s.slice(virg + 1).replace(/[.,]/g, '').slice(0, casas)
    return `${inteiro}${s.includes(',') ? ',' : ''}${dec}`
  }
  const ult = s.lastIndexOf('.')
  if (ult >= 0 && s.length - ult - 1 > 0 && s.length - ult - 1 <= casas && !/^\d{1,3}(\.\d{3})+$/.test(s)) { // "777.24" digitado com ponto vira decimal
    return `${s.slice(0, ult).replace(/\./g, '')},${s.slice(ult + 1)}`
  }
  return s.replace(/\./g, '')
}

// Texto do campo → número em texto simples ("777,24" → "777.24"; vazio/incompleto → ""), para quem lê com Number().
export function canonicoDinheiro(t, opcoes) {
  const s = limparDinheiro(t, opcoes).replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(s) ? s : s.endsWith('.') && /^-?\d+\.$/.test(s) ? s.slice(0, -1) : ''
}
