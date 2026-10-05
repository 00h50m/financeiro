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
