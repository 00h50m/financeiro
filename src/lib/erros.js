// Traduz erros técnicos (Supabase/Postgres/rede) em mensagens claras: o que aconteceu e o que fazer.
// Mensagens que o próprio app já escreveu em português são marcadas com `amigavel()` e passam direto.

export const amigavel = (mensagem) => Object.assign(new Error(mensagem), { amigavel: true })

const COLUNAS = { descricao: 'descrição', valor: 'valor', valor_total: 'valor', data_compra: 'data', cartao_id: 'cartão', categoria: 'categoria', nome: 'nome', mes: 'mês', pessoa: 'pessoa' }
const nomeColuna = (c) => COLUNAS[c] || c

// acao: verbo no infinitivo ("salvar a compra", "apagar o cartão", "carregar os dados")
export function explicarErro(e, acao = 'concluir a ação') {
  if (e?.amigavel) return e.message
  const msg = String(e?.message || e || '')
  const cod = String(e?.code || '')
  const status = Number(e?.status || e?.statusCode || 0)
  const detalhe = [cod, msg].filter(Boolean).join(' · ')
  const rodape = detalhe ? `\n\n(Detalhe técnico: ${detalhe})` : ''
  const comeco = `Não foi possível ${acao}.`
  const caso = (causa, fazer, mostrarDetalhe = true) => `${comeco}\n\n${causa}\n${fazer}${mostrarDetalhe ? rodape : ''}`

  if (/failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(msg) || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return caso('Sem conexão com a internet ou o servidor não respondeu. Nada foi salvo.', 'Confira a conexão e tente de novo.', false)
  }
  if (/jwt|token.*(expired|invalid)|not authenticated|invalid refresh token/i.test(msg) || cod === 'PGRST301' || status === 401) {
    return caso('Sua sessão expirou.', 'Saia e entre de novo no app, depois repita a ação.', false)
  }
  if (cod === '42501' || /row-level security|permission denied/i.test(msg)) {
    return caso('O banco recusou a alteração por falta de permissão.', 'Saia e entre de novo. Se continuar, rode o arquivo rls_login.sql no Supabase.')
  }
  const tabela = msg.match(/(?:relation|table) ["']?(?:public\.)?([a-z_]+)["']? (?:does not exist|in the schema cache)/i)?.[1]
    || msg.match(/could not find the table ['"]?(?:public\.)?([a-z_]+)/i)?.[1]
  if (['42P01', 'PGRST205'].includes(cod) || tabela) {
    return caso(`Falta uma atualização do banco: a tabela${tabela ? ` "${tabela}"` : ''} ainda não existe.`, 'Rode o arquivo SQL correspondente (pasta inbox/ ou raiz do projeto) no Supabase e recarregue a página.')
  }
  const colunaFalta = msg.match(/could not find the ['"]([a-z_]+)['"] column/i)?.[1] || msg.match(/column ["']?(?:[a-z_]+\.)?([a-z_]+)["']? (?:of relation [^ ]+ )?does not exist/i)?.[1]
  if (['PGRST204', '42703'].includes(cod) || colunaFalta) {
    return caso(`Falta uma atualização do banco: a coluna${colunaFalta ? ` "${colunaFalta}"` : ''} ainda não existe.`, 'Rode o arquivo SQL correspondente no Supabase e recarregue a página.')
  }
  if (cod === '23505' || /duplicate key/i.test(msg)) {
    return caso('Já existe um registro igual a este (duplicado).', 'Confira se não foi lançado antes; se for outro, mude o nome, o mês ou o cartão.')
  }
  if (cod === '23503' || /foreign key/i.test(msg)) {
    return /still referenced|update or delete/i.test(msg)
      ? caso('Este item está em uso por outros registros (por exemplo, um cartão com compras).', 'Remova ou mude esses registros antes de apagar.')
      : caso('Este registro aponta para algo que não existe mais (cartão, conta ou compra apagados).', 'Recarregue a página e escolha de novo.')
  }
  if (cod === '23502' || /not-null|null value in column/i.test(msg)) {
    const col = msg.match(/column ["']([a-z_]+)["']/i)?.[1]
    return caso(`Falta preencher um campo obrigatório${col ? `: ${nomeColuna(col)}` : ''}.`, col === 'valor_real' ? 'Se for a fatura, rode a atualização 13 do banco (inbox/13_faturas_valor_real_opcional.sql).' : 'Preencha e tente de novo.')
  }
  if (cod === '23514' || /check constraint/i.test(msg)) {
    return caso('Algum valor está fora do permitido (por exemplo, negativo ou fora da lista de opções).', 'Confira os campos e tente de novo.')
  }
  if (['22P02', '22003', '22007', '22008'].includes(cod) || /invalid input syntax|out of range/i.test(msg)) {
    return caso('Algum campo está em formato inválido (número, data ou valor muito grande).', 'Confira os campos: use vírgula nos centavos (ex.: 89,90) e datas válidas.')
  }
  if (cod === '57014' || /statement timeout|timed out|timeout/i.test(msg)) {
    return caso('O servidor demorou demais para responder.', 'Tente de novo em instantes; se for uma lista muito grande, filtre antes.', false)
  }
  if (status === 429 || /rate limit|too many requests/i.test(msg)) {
    return caso('Muitas tentativas seguidas.', 'Aguarde um minuto e tente de novo.', false)
  }
  if (status >= 500 || /bad gateway|service unavailable|internal server error|upstream/i.test(msg)) {
    return caso('O servidor (Supabase) está instável no momento. Nada foi alterado.', 'Tente de novo em alguns instantes.')
  }
  return caso('Aconteceu um erro inesperado.', 'Tente de novo. Se repetir, anote o detalhe abaixo e me envie.')
}
