// Como a compra chegou no app (coluna `origem`); compras digitadas no app ('manual') não ganham selo.
const ROTULOS = {
  telegram: '💬 Telegram',
  android_notification: '📱 Notificação',
  csv: '📄 Fatura (CSV)',
  inbox: '📥 Inbox',
  emprestimo: '🏦 Empréstimo',
}

export const rotuloOrigem = (origem) => {
  if (!origem || origem === 'manual') return null
  return ROTULOS[origem] || origem.replace(/_/g, ' ')
}
