// Glossário único dos indicadores financeiros: UM nome e UMA definição por número, usados em todas as telas.
// Os números vêm de resumoDoMes (financeiro.js); aqui só ficam os rótulos e o que cada um significa.
export const GLOSSARIO = {
  disponivelAgora: {
    rotulo: 'Disponível agora',
    ajuda: 'Dinheiro que existe hoje segundo o app: entrada + sobra do mês anterior − o que já foi pago ± acerto com o saldo real. Só é o saldo do banco se você usou "Acertar com o saldo real".',
  },
  sobraPrevista: {
    rotulo: 'Sobra prevista do mês',
    ajuda: 'Projeção: o que sobra no fim do mês se tudo o que está previsto acontecer (entrada + sobra do mês anterior ± acerto − comprometido). Não é dinheiro disponível.',
  },
  livreParaGastar: {
    rotulo: 'Livre para gastar',
    ajuda: 'Estimativa: a parte da sobra prevista do mês que ainda não está comprometida. É projeção, não saldo na conta.',
  },
  faltandoParaFechar: {
    rotulo: 'Faltando para fechar o mês',
    ajuda: 'As contas do mês passam do que entrou: é quanto falta para cobrir tudo o que está previsto.',
  },
  aPagar: {
    rotulo: 'A pagar',
    ajuda: 'Contas do mês que ainda não foram pagas (comprometido menos o que já foi pago).',
  },
  comprometido: {
    rotulo: 'Comprometido',
    ajuda: 'Tudo o que já está assumido no mês: contas fixas, faturas e contas sem cartão.',
  },
  resultadoDoMes: {
    rotulo: 'Resultado do mês',
    ajuda: 'Entrada menos comprometido, sem a sobra do mês anterior. Serve para comparar meses entre si.',
  },
}
