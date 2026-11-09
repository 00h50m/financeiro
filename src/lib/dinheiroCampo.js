// Texto de campos de valor em reais (ver components/ui/CampoDinheiro.jsx).
export const paraCampoDinheiro = (n) => (n == null || n === '' || !Number.isFinite(Number(n)) ? '' : Number(n).toFixed(2).replace('.', ','))

// Deixa só dígitos e um separador decimal (a vírgula vale mais que o ponto), no máximo 2 casas.
export function limparDinheiro(t) {
  let s = String(t ?? '').replace(/[^\d.,]/g, '')
  const virg = s.indexOf(',')
  if (virg >= 0) {
    const inteiro = s.slice(0, virg).replace(/[.,]/g, '')
    const dec = s.slice(virg + 1).replace(/[.,]/g, '').slice(0, 2)
    return `${inteiro}${s.includes(',') ? ',' : ''}${dec}`
  }
  const ult = s.lastIndexOf('.')
  if (ult >= 0 && s.length - ult - 1 > 0 && s.length - ult - 1 <= 2 && !/^\d{1,3}(\.\d{3})+$/.test(s)) { // "777.24" digitado com ponto vira decimal
    return `${s.slice(0, ult).replace(/\./g, '')},${s.slice(ult + 1)}`
  }
  return s.replace(/\./g, '')
}
