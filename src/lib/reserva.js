// Reserva de emergência: onde está o dinheiro e quanto dele está disponível. Valores em reais.
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const LIQUIDEZ = {
  na_hora: 'Na hora (conta, poupança, Pix)',
  poucos_dias: 'Em poucos dias (CDB, fundo)',
  travado: 'Travado / prazo longo (FGTS…)',
}
export const LIQUIDEZ_CURTA = { na_hora: 'na hora', poucos_dias: 'poucos dias', travado: 'travado' }

export const totalReserva = (fontes = []) => r2(fontes.reduce((t, f) => t + (Number(f.valor) || 0), 0))
export const totalPorLiquidez = (fontes = []) => ({
  na_hora: r2(fontes.filter((f) => f.liquidez === 'na_hora').reduce((t, f) => t + (Number(f.valor) || 0), 0)),
  poucos_dias: r2(fontes.filter((f) => f.liquidez === 'poucos_dias').reduce((t, f) => t + (Number(f.valor) || 0), 0)),
  travado: r2(fontes.filter((f) => f.liquidez === 'travado').reduce((t, f) => t + (Number(f.valor) || 0), 0)),
})
// Quantos meses o valor cobre (custo mensal 0 → 0).
export const mesesCobertos = (valor, custoMensal) => (custoMensal > 0 ? valor / custoMensal : 0)

// Lista depois de salvar/remover uma fonte (para calcular o novo total antes de gravar).
export function aplicarFonte(fontes, fonte) {
  return fonte.id && fontes.some((f) => f.id === fonte.id) ? fontes.map((f) => (f.id === fonte.id ? { ...f, ...fonte } : f)) : [...fontes, fonte]
}
