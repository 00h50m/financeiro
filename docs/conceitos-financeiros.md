# Conceitos financeiros do Finapp

Esta é a definição oficial de cada número. Todo o cálculo mora em `src/lib/financeiro.js` (e `gerarParcelas`,
`calcMesInicio` e `fixosAtivos` em `src/lib/utils.js`). **Telas e bot não calculam por conta própria**: se um
número novo for preciso, ele entra no motor, com teste em `src/lib/__tests__/financeiro.test.js`.

## Competência

- A competência de uma parcela é o **mês de fechamento da fatura** do cartão (`calcMesInicio`): compra até o dia do
  fechamento entra na fatura do mês; depois, na do mês seguinte. O vencimento do cartão não entra em nenhuma conta.
- Compra sem cartão: competência é o mês da compra, e cada parcela cai num mês seguinte.
- Datas são interpretadas no fuso de Brasília (`hojeSP`, `nowYM`), igual ao bot.
- `gerarParcelas` é a única fonte de parcelas: as primeiras arredondam em centavos e a última fecha a conta.

## Definições

| Conceito | Definição |
| --- | --- |
| Renda | Renda cadastrada do mês. Mês sem renda vale 0. Para projeções (Simulador, Reserva) usa-se a renda **prevista**: repete a última renda cadastrada antes do mês e é marcada como estimada (`rendaDoMes`). |
| Comprometido | Contas fixas ativas no mês + faturas dos cartões + parcelas do mês de compras sem cartão. |
| Valor da fatura | O **valor real** só se alguém informou (tela Faturas); senão, a soma das parcelas lançadas (estimado). Pagar a fatura nunca grava valor. |
| Pago | Parte do comprometido marcada como paga: conta fixa (por mês), fatura (por cartão e mês) e parcela de compra sem cartão (por compra e mês). |
| A pagar | Comprometido − pago. |
| Saldo anterior | O que sobraria do mês anterior depois de pagar tudo: renda + saldo anterior dele + ajuste − comprometido. Só existe se o mês anterior tem renda cadastrada. Pode ser desligado em Pagamentos (preferência salva no aparelho e usada em todas as telas). |
| Ajuste | Acerto manual com o saldo real da conta (tela Pagamentos). |
| Disponível | Renda + saldo anterior − pago + ajuste. O dinheiro que existe agora. |
| Sobra projetada | Disponível − a pagar = renda + saldo anterior + ajuste − comprometido. Onde o mês deve terminar. |
| Sobra do mês | Renda − comprometido, sem saldo anterior (usada na projeção de 6 meses). |
| Dívida / parcelas futuras | "A pagar no mês" (Pagamentos) e "parcelas futuras comprometidas" são conceitos separados. O limite usado do cartão é uma visão própria (veja abaixo). |
| Limite usado | Parcelas do mês atual e futuras com fatura não paga + faturas passadas registradas e não pagas. Parcelas de meses passados **sem registro de fatura** não entram: aparecem como "sem informação". |
| Sem informação | Mês passado sem registro de pagamento. Nunca é tratado como "pago". |

## O que cada tela usa

- Dashboard: `resumoDoMes` (comprometido, sobra projetada, % da renda e projeção de 6 meses). A divisão por categoria usa o valor
  **lançado** (as categorias vêm das compras); fixos sem categoria aparecem em "Sem categoria".
- Pagamentos: `resumoDoMes` e o detalhe do mês.
- Simulador: `detalhePagamentos` (comprometido por mês) e renda prevista.
- Reserva: comprometido do mês e renda prevista.
- Bot: `/resumo` soma o valor total das compras **pela data da compra** (parceladas inteiras); isso é diferente de "comprometido",
  e o texto do bot avisa. `/faturas` e `/proximas` usam o valor lançado.

## Pagamento por parcela (compras sem cartão)

Tabela `compras_pagamentos` (uma linha por compra e mês). Sem registro: à vista segue `compras.pago`; parcelada conta como paga só a
primeira parcela (era o que "Já paguei" queria dizer ao lançar). Sem a tabela (migration 14 não rodada), vale o `pago` antigo da compra inteira.

## Histórico de contas fixas

Mudar o valor "só daqui para frente" encerra a conta antiga no mês anterior (`mes_fim`) e cria uma nova com `mes_inicio`.
`fixosAtivos` respeita os dois. Meses passados mantêm o valor antigo.

## Migrations desta fase

- `inbox/13_faturas_valor_real_opcional.sql`: `faturas.valor_real` aceita vazio.
- `inbox/14_compras_pagamentos.sql`: tabela de pagamento por parcela e migração do que já estava marcado.

## Fechamento mensal (Fase 2)

- Fechar um mês grava uma **foto** (`fechamentos`): receita, despesas, pago, pendente, sobra, saldo anterior, ajuste, saldo final, reserva destinada e `saldo_transportado`, mais detalhes por categoria, pessoa, contas fixas, faturas e parcelas sem cartão. A foto nunca é recalculada; `versao_motor` diz com qual regra foi feita.
- **Saldo transportado** = saldo final − reserva destinada. É a única regra de carry-over: o mês seguinte começa com ele. Se o mês anterior não está fechado, vale a conta ao vivo (renda + sobra anterior + ajuste − comprometido).
- **Bloqueios** (impedem fechar): mês já fechado, mês futuro, sem renda, fatura sem valor real, mês anterior aberto quando já há fechamentos mais antigos. **Alertas** (pedem confirmação): mês não terminou, Inbox pendente, contas ou parcelas sem marca de paga, fatura não paga, diferença fatura × lançado ≥ R$ 1, teto estourado, saldo negativo.
- **Reabrir** exige motivo, guarda o fechamento anterior na auditoria e devolve o mês ao cálculo ao vivo.
- Editar ou apagar compra com parcela em mês fechado: avisa, exige justificativa e grava em `auditoria_financeira`.
- Migration: `inbox/15_fechamentos_auditoria.sql` (tabelas + funções `fechar_mes` e `reabrir_mes`).

## Metas (Fase 3)

- Meta = `metas` (reserva ou objetivo) + `metas_movimentos`. **Saldo da meta = soma dos movimentos** (aporte +, retirada −, ajuste = diferença até o saldo informado). Apagar movimento vai para a auditoria.
- Alvo da reserva = meses de cobertura × custo mensal (fixos, ou fixos + parcelas do mês). Alvo de objetivo = valor definido; com prazo, o app mostra quanto guardar por mês.
- **Sugestão de destino da sobra** (Fechamento): só sobra positiva; metas por prioridade; cada uma recebe no máximo o que falta (ou o ritmo do prazo); o resto fica livre. É só sugestão: o app não movimenta dinheiro.
- A Reserva antiga (tabela `config`) é migrada para uma meta do tipo reserva pela `inbox/16_metas.sql`; sem a migration a tela Reserva segue como antes.

## Evolução e observações (Fase 4)

- Série mensal e comparações usam a **foto do fechamento** quando o mês está fechado e o cálculo ao vivo (sem saldo anterior) nos demais.
- Comparativos: mês anterior, média dos 3 e dos 6 meses anteriores e mesmo mês do ano passado. Meses sem dados não entram nas médias; referência sem dados mostra "sem dados".
- Percentual só existe quando a referência é maior que zero (e, em categorias, ao menos R$ 50). Antes disso mostra só a diferença em reais.
- Observações são regras fixas e explicáveis, cada uma com a conta: categoria ≥ 30% e ≥ R$ 50 acima da média dos 3 meses anteriores; despesas ≥ 15% acima/abaixo da média; mês no vermelho; poupança 10 pontos acima da média; parcelamentos que terminam; maior categoria. Não há IA nem previsão opaca.

## Regras aprendidas, calendário e busca (Fase 5)

- **Regras aprendidas** (`regras_categorizacao`): tela para corrigir categoria/subcategoria ou esquecer a regra de um estabelecimento. Vale só daqui para frente: compras e lançamentos antigos nunca são alterados. Cada mudança vai para a auditoria.
- **Calendário**: usa o mesmo detalhe do motor (contas fixas ativas, faturas do mês, parcelas sem cartão). Fixo no dia do vencimento, fatura no vencimento do cartão (uma por cartão), parcela sem cartão no dia da compra. Dia maior que o mês vira o último dia. Cada item tem chave única, então nada aparece duas vezes.
- **Busca global**: compras, contas fixas, cartões, metas e Inbox; sem diferença de acento ou maiúscula; também acha pelo valor.
- Preparação (sem funcionalidade): patrimônio e captura por notificação do Android não foram construídos, só mantidos como possibilidade no desenho (tabelas `eventos_financeiros` com `origem` genérica já comportam novas fontes).

## Restauração, desempenho e celular (Fase 6)

- **Restaurar backup** (Backup > Restaurar): o app lê o arquivo, valida (app, versão do formato, contagens, identificadores, relações) e compara com os dados de hoje antes de qualquer mudança. Dois modos: **mesclar** (só adiciona o que falta; nunca altera nem apaga; bloqueado se criaria registros órfãos) e **substituir tudo** (digitar SUBSTITUIR; baixa uma cópia dos dados atuais antes; roda a função `restaurar_backup` numa transação, então falha = nada muda; pessoas não são apagadas em bloco para não derrubar o pareamento do Telegram; a auditoria nunca é apagada).
- Backup versionado: `backup_versao` (formato), `schema_banco` (última migration) e `versao_app` no arquivo.
- **Desempenho**: migration 17 cria índices (compras por data e cartão, faturas por cartão e mês, pagamentos por mês, Inbox por status e data). Leituras já paginam de 1000 em 1000. Recarga seletiva: ações simples (marcar pago, fatura, renda, compra, metas, fechamento, Inbox) recarregam só os grupos de dados que mudaram; ações com cascata ou renomeação (categorias, pessoas, cartões, restauração) ainda recarregam tudo, de propósito. Recargas que se atropelam somam os grupos, então a mais nova sempre cobre as anteriores.
- **Celular**: barra inferior com atalhos (Início, Inbox, Compras, Pagar, Menu), alvos de toque de 44px, áreas seguras do iPhone (topo e rodapé), carregamento com esqueleto em vez de só um círculo e respeito a "reduzir movimento".
