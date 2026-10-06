// Exportação para CSV que abre direto no Excel/Sheets em português: separador ";", decimal com vírgula, UTF-8 com BOM.
const celula = (v) => {
  if (v == null) return ''
  if (typeof v === 'number') return String(Math.round(v * 100) / 100).replace('.', ',')
  const t = String(v)
  return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t
}
// colunas: [{ titulo, valor: (linha) => ... }]
export function paraCsv(colunas, linhas) {
  return '﻿' + [colunas.map((c) => celula(c.titulo)).join(';'), ...linhas.map((l) => colunas.map((c) => celula(c.valor(l))).join(';'))].join('\r\n') + '\r\n'
}
export function baixarCsv(nome, texto) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nome.endsWith('.csv') ? nome : nome + '.csv'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
