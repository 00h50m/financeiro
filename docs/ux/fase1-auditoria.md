# Sobrou! · Refatoração UX/UI · Fase 1: Auditoria e proposta

Escopo desta fase: **somente leitura**. Nenhuma tela, fórmula ou regra foi alterada.
Método: leitura do código (src/App.jsx, 34 telas, src/lib, src/index.css), execução do app em Chromium real com dados simulados
(34 telas × celular 390 px e desktop 1366 px, medindo rolagem horizontal, alvos de toque, colunas ocultas e erros) e leitura de capturas.

---

## 1. Resumo executivo

1. **O app já tem boa parte do que o prompt pede.** Compras já tem busca, filtros, agrupamento por mês, seleção múltipla e troca de categoria em lote.
   Início já tem hero de saldo, "+ Gasto/+ Entrada", alerta de vencimentos e lista de contas. Pagamentos já tem pílulas Todas/A pagar/Pagas.
   Existem skeleton de carregamento, toasts com "Desfazer", botão voltar do celular tratado, `prefers-reduced-motion` e inputs de 16 px no celular.
   A refatoração deve **reorganizar e reduzir**, não reconstruir.
2. **O problema nº 1 é o vocabulário financeiro, não o visual.** O mesmo número aparece com 3 nomes diferentes e nomes iguais significam números diferentes
   (seção 3). Isso gera a sensação de "muitos indicadores repetidos" e precisa ser resolvido **antes** de redesenhar as telas.
3. **O problema nº 2 é a ordem das telas:** resumos e gráficos vêm antes da lista de tarefas (Pagamentos: 5 indicadores + resumo por categoria antes das contas;
   Faturas: gráfico de 12 meses antes do mês atual).
4. **O problema nº 3 é a navegação:** 34 destinos em 4 grupos, sem URLs (a aba atual fica em `localStorage`), e a barra inferior do celular mostra 4 atalhos fixos
   que não incluem Faturas nem Importar.
5. **Não existe um design system de fato.** Só as cores são tokens. Há 4 implementações do mesmo "cartão de indicador", 17 tamanhos de fonte,
   13 larguras de breakpoint (17 regras `@media`), 1.142 estilos inline e 63 `confirm()/alert()` nativos.
6. **Integração faltando:** a tela Faturas não conhece o status de conciliação dos lotes de importação (0 referências a `importacoes_fatura`).
7. **Divergência do prompt:** o projeto é **JavaScript (JSX)**, não TypeScript. Migrar para TS é um projeto à parte; proponho não migrar nesta refatoração (decisão sua, seção 9).

---

## 2. Inventário

### 2.1 Arquitetura de telas
- Sem roteador. `App.jsx` guarda `aba` em estado e em `localStorage`; `irPara(id)` empilha `history.pushState({aba})` só para o botão voltar. **Não há URLs por tela**, então não há URLs para quebrar, mas também não há links diretos (útil para Telegram/notificações).
- 34 telas em 4 grupos: Visão geral (6), Dia a dia (7), Planejamento (14), Cadastros (7). O perfil `esteticista` oculta abas via `perfil.abasOcultas`.
- Barra lateral recolhível, grupos recolhíveis. No celular: gaveta + barra inferior com **Início, Inbox, Compras, Pagar, Menu**.
- `store` único (`useStore`, ~1.200 linhas) injetado em todas as telas; `InicioContext` para a data de início do app.
- Telas maiores: Pagamentos 584 linhas, Fixos 529, Faturas 451, Dashboard 409, Início 376, ModalCompra 377.

### 2.2 Medições no navegador (dados simulados: 40 compras, 2 cartões)
| Medida | Celular 390 px | Desktop 1366 px |
|---|---|---|
| Telas com rolagem horizontal da página | **0** | **0** |
| Erros de JavaScript | 0 | 0 |
| Tabelas mais largas que a tela | 2 (Plano de dívidas, Simulador) | n/a |
| Células de coluna ocultas por `col-opc` | Compras 205, Parcelamentos 58, Renda 49, Pagamentos 15, Faturas 12, Dashboard 10, Fixos 9, Cenário 8 | n/a |
| Alvos de toque menores que 36 px | **Compras 84 de 209**, Renda 25, Pagamentos 18, Pessoas 16, Início 12 | n/a |
| Altura da tela | **Compras 6.803 px (40 compras)**, Backup 3.280, Renda 3.087, Início 1.973 | |

Leitura: o app **não quebra** o layout no celular (ponto forte), mas Compras vira uma lista de ~6,8 mil pixels e a maior parte dos botões de ação é pequena demais para o toque.

### 2.3 Design system atual
- **Tokens:** só cores (`--bg…--purple`, `--brand` verde-limão `#c6f24e`). **Sem** tokens de espaçamento, raio, sombra ou tipografia.
- **Raios:** 3, 6, 8, 10, 12, 14 px (18, 13, 12, 8, 6 ocorrências). **Fontes:** 17 tamanhos distintos.
- **Cartão de indicador implementado 4 vezes:** `.kpi` (Dashboard), `.metric` (Pagamentos), `.ini-res` (Início), `.rs-kpi` (Renda sazonal).
- **Breakpoints:** 13 larguras distintas em 17 regras `@media` (380, 420, 520, 560, 600, 640, 700, 760, 860, 900, 1000, 1100, 1360), sem escala.
- **Estilos inline:** 1.142 (`Dashboard` 78, `Pagamentos` 64, `Parcelamentos` 60, `Atendimentos` 58, `Faturas` 54).
- **Botões:** `.btn`, `-primary`, `-ghost`, `-danger`, `-sm`. **Badges:** gray/green/amber/red/blue/purple. Sem "link-btn" padronizado (existe `.link-btn` avulso).
- **Cor com dupla função:** verde (`--green`) é usado para "positivo", "pago", "sucesso"; o verde-limão da marca é usado para ação principal. Em Dashboard "Já pago" é verde e "Renda" também.
- **Confirmações:** 63 usos de `confirm()/alert()` nativos em 32 arquivos (inclui modais de cadastros). Inconsistente com o restante e ruim no PWA.
- **Modais:** `role="dialog"` e Esc fecham (via `acessibilidadeModais.js`), mas **sem armadilha de foco e sem devolver o foco** ao abrir/fechar. No celular são modais centrais, não bottom sheets.
- **Estados:** skeleton só na carga inicial do app; telas individuais usam textos `.empty` (41 usos). Não há skeleton por tela nem indicador de offline (o `sw.js` só guarda o "casco"; `navigator.onLine` não é usado na UI).
- **Acessibilidade:** 167 atributos `aria-*`, 42 `role`. Pontos fracos: checkboxes sem rótulo em Compras (linhas e cabeçalho), status por cor em vários badges, tabelas sem `caption`, links "ver contas →" sem contexto.

---

## 3. Indicadores financeiros: definições reais e inconsistências

Fonte única das fórmulas: `src/lib/financeiro.js · resumoDoMes()`. Documentação do próprio código:

- `renda` = renda cadastrada + repasses de Divididos já recebidos
- `comprometido` = fixos + faturas + contas sem cartão do mês (detalhePagamentos)
- `aPagar` = comprometido − pago
- `disponivel` = renda + saldoAnterior − pago + ajuste − aulasAReceber  *("dinheiro que existe agora")*
- `sobraProjetada` = disponivel + aulasAReceber − aPagar = renda + saldoAnterior + ajuste − comprometido
- `sobraDoMes` = renda − comprometido *(sem saldo anterior, sem ajuste)*

Como isso aparece nas telas:

| Número real | Rótulo na tela | Onde | Observação |
|---|---|---|---|
| `sobraProjetada` | **"Pode gastar"** (ou "Faltando para fechar o mês" se negativo) | Início | mostra o valor mesmo sem renda cadastrada (aparece −R$ 6.467 "Faltando para fechar") |
| `sobraProjetada` | **"Sobra projetada"** | Dashboard | mostra "—" sem renda; subtítulo diz "renda − comprometido" mesmo quando inclui saldo anterior e ajuste |
| `sobraProjetada` | **"Saldo"** | Pagamentos | 3º nome para o mesmo número |
| `disponivel` | "Disponível hoje" / "Dinheiro disponível" | Dashboard / Pagamentos | 2 nomes |
| `aPagar` | "Falta pagar" / "Total dívidas (a pagar)" / "falta R$ …" | Dashboard / Pagamentos | "dívidas" aqui é só contas do mês, e colide com a tela **Plano de dívidas** |
| `sobraDoMes` | "Sobra" / "saldo" | Evolução, Gráficos, Resumo mensal (Telegram), Empréstimos, Dashboard (tabela de projeção) | **mesma palavra, outro número**: ignora saldo anterior e ajuste (`usarSaldoAnterior:false`) |
| `comprometido` | "Comprometido" / "Comprometido no mês" / "Comprometido hoje" | Início, Dashboard, Pagamentos, Empréstimos | consistente; "hoje" no Empréstimos engana (é do mês) |

Inconsistências a corrigir **só na camada de apresentação** (nenhuma fórmula muda):
1. Um nome canônico por conceito (proposta: **Disponível agora** = `disponivel`; **Sobra prevista do mês** = `sobraProjetada`; **A pagar** = `aPagar`; **Comprometido** = `comprometido`; **Resultado do mês** = `sobraDoMes`).
2. Comportamento sem renda: Início mostra número negativo, Dashboard mostra "—". Unificar: sem renda, mostrar "Cadastre a renda" e **não** apresentar "faltando para fechar" como se fosse fato.
3. "Pode gastar" é uma **projeção**, não dinheiro na conta. O prompt pede para não apresentá-la como dinheiro disponível: hoje o rótulo "Pode gastar" faz exatamente isso. A diferença `disponivel` × `sobraProjetada` precisa ficar explícita no Início.
4. **"Saldo atual"** (item 1 do prompt) **não existe como conceito do app**: não há saldo bancário integrado. O mais próximo é `disponivel`, que depende do ajuste manual com o saldo real da conta. A tela deve dizer isso e oferecer "Acertar com o saldo real".
5. A opção "usar sobra do mês anterior" é lida de `lerUsarSaldoAnterior()` no Início/Dashboard e de `usarSobra` local em Pagamentos: verificar se são o mesmo estado (risco de números diferentes entre telas).

> **Nada disso foi alterado.** São recomendações de rótulo e de apresentação; qualquer mudança de fórmula ficaria registrada à parte, com testes.

---

## 4. Diagnóstico por tela

Prioridade: **P0** crítico para o objetivo, **P1** alto, **P2** médio. Risco técnico: B baixo, M médio, A alto.

### 4.1 Início (`Inicio.jsx`, 376 linhas)  ·  P0
- **Estado atual:** hero do mês, resumo (entrada/comprometido), "+ Gasto/+ Entrada", alerta de vencimentos, linha do mês com bolinhas, contas a pagar, gastos por categoria, dívidas, aulas/atendimentos (por perfil).
- **Problemas:** (a) hero mostra projeção como se fosse dinheiro e "Faltando para fechar o mês" sem renda; (b) **não mostra pendências de outras áreas** (compras no Inbox, faturas com divergência, valores a receber) e não tem "Importar fatura"/"Registrar pagamento"; (c) card "Resumo do mês" repete o que o hero já diz; (d) linha do mês com bolinhas exige toque para saber o que é; (e) blocos de Aulas/Atendimentos entram no meio das finanças.
- **Impacto:** o usuário precisa interpretar antes de agir; ações frequentes ficam em outras abas.
- **Causa provável:** a tela foi crescendo por acréscimo de blocos.
- **Solução:** faixa "Situação" (Disponível agora, Sobra prevista, Comprometido) com definição curta; bloco **"O que precisa de você"** (atrasadas, vencem em 7 dias, Inbox, faturas divergentes, a receber) com ação direta; ações rápidas (Nova compra, Nova entrada, Registrar pagamento, Importar fatura, Conferir pendências); listas limitadas a 3–5 itens com "ver todas"; Aulas/Atendimentos como **um cartão-resumo** com acesso à agenda.
- **Risco:** B (apresentação), M para o bloco de pendências (reúne dados de várias fontes).

### 4.2 Dashboard (`Dashboard.jsx`, 409 linhas)  ·  P1
- **Problemas:** (a) 6 KPIs repetem Início/Pagamentos (Renda, Comprometido, Sobra projetada, Já pago, Falta pagar, Disponível hoje); (b) "Atenção neste mês" repete o papel das pendências do Início; (c) comparação **enganosa com base pequena**: Moradia "↑ 400% (R$ 384)" contra média de 5 meses, quando há só 1 mês de histórico; "novo/sem histórico" aparece ao lado de percentuais; (d) tabela de categorias aberta por padrão com 4 colunas; (e) projeção mistura `sobraDoMes` com o rótulo "saldo".
- **Solução:** Dashboard vira **análise**: Visão (evolução), Gastos (top categorias + "ver todas"), Comparações (mês anterior/média **só com ≥ 3 meses** e base mínima, senão "histórico insuficiente"), Projeções (rotuladas "estimativa"). Remover KPIs duplicados do topo; manter 3 de análise (taxa de comprometimento, média de sobra, variação).
- **Risco:** M (regras de "base mínima" são novas; precisam de testes).

### 4.3 Pagamentos (`Pagamentos.jsx`, 584 linhas)  ·  **P0 (prioridade máxima)**
- **Estado atual (ordem da tela):** mês + pílulas Todas/A pagar/Pagas → busca → **5 indicadores** (Comprometido, Já pago, Total dívidas, Dinheiro disponível, Saldo) → barra de progresso → **"Por categoria"** → **"Dinheiro disponível (de onde vem)"** → Contas fixas → Faturas dos cartões → Outras contas. Cada bloco é uma tabela própria.
- **Problemas:** (a) a lista de contas, que é a tarefa, só aparece **depois** de ~1.800 px de resumo no celular; (b) 5 indicadores com 3 nomes para o mesmo número (seção 3); (c) **não existe aba "Atrasadas"** nem ordenação por vencimento (o app já calcula `atrasada` em `contasDoMes`, usado no Início); (d) contas separadas em 3 tabelas por origem (fixas, faturas, outras) em vez de uma lista única; (e) várias ações por linha (checkbox, "Adiar", "mudar de mês", link de dívida, data de pagamento); (f) valor estimado × confirmado só aparece em alguns casos; (g) não há ação em lote; (h) `confirm()` nativo no pagamento de compra parcelada.
- **Solução:** resumo compacto (A pagar, Pago, Atrasadas, Próximos 7 dias) → abas **A pagar / Atrasadas / Pagas / Todas** → **lista única ordenada por vencimento** (nome, valor, vencimento, status, **uma** ação principal "Pagar") → painel lateral/sheet de pagamento com data e valor real (corrige estimado) → seleção múltipla com "Marcar como pagas" (com desfazer). Resumo por categoria e "Dinheiro disponível" viram seções recolhidas abaixo da lista.
- **Impacto:** reduz o caminho "abrir app → pagar conta" de rolar + achar na tabela para 1 toque.
- **Risco:** M. Mantém `toggleFixo/toggleCartao/toggleOutraConta`, `fixosPagamentos`, `comprasPagamentos` e as regras de adiamento; só muda a composição.

### 4.4 Compras (`Compras.jsx`, 326 linhas)  ·  P1
- **Já existe:** busca, 5 filtros (pessoa, cartão, categoria, mês, à vista/parcelada), agrupamento por mês, expandir/recolher, seleção e troca de categoria em lote, exportar CSV, origem (Telegram).
- **Problemas:** (a) **desktop:** 9 colunas e dois botões por linha (Editar/×); (b) **celular:** lista de 6,8 mil px para 40 compras, 84 de 209 alvos menores que 36 px, colunas ocultas viram uma linha de texto cinza com 5 campos; (c) checkboxes sem rótulo; (d) excluir (×) vermelho ao lado de Editar, risco de toque errado; (e) sem ordenação por valor/data; (f) sem edição rápida de categoria na linha; (g) sem paginação/virtualização.
- **Solução:** linha enxuta (descrição, data, valor, categoria, pessoa, forma de pagamento) e **detalhes expansíveis** (parcelas, origem, fatura, divisão); ações no menu "⋯"/swipe; ordenação; edição rápida da categoria; "Selecionar" como modo (barra de ações em lote só aparece quando há seleção); mês atual aberto e demais recolhidos (já existe) + virtualização/paginação ("carregar mais") para listas longas.
- **Risco:** M. Não tocar em parcelamento, divisão por categoria e fatura_mes (`ModalCompra`, `EditarCompra`).

### 4.5 Faturas (`Faturas.jsx`, 451 linhas)  ·  **P0**
- **Problemas:** (a) abre com **gráfico "Compromissos a longo prazo" (12 meses)** e seletor "Meses à frente" antes do mês atual; (b) o mês atual vem abaixo da dobra; (c) status é um único selo ("fatura não lançada") e **não distingue** estimada/valor real/divergente/conciliada/paga; (d) **0 referências à conciliação de importação**: o resultado de "Importar fatura" (Importação concluída/Conciliação parcial/Fatura conciliada) não aparece aqui; (e) não há botão "Importar fatura" nem "Conciliar" no cartão; (f) meses futuros, atuais e históricos misturados na mesma lista.
- **Solução:** cartão por cartão **do mês selecionado** (nome, valor lançado, valor do banco, diferença, vencimento, estado), com **estados independentes** (estimada · valor real informado · divergente · conciliada · paga) lidos de `faturas`, `fixosPagamentos` e `importacoes_fatura.status_conciliacao`; ações: Ver compras, Importar/Conciliar, Informar valor real, Registrar pagamento. "Compromissos a longo prazo" e meses futuros em seção secundária recolhida.
- **Risco:** M (cruza 3 fontes; leitura de `importacoes_fatura` já existe no `importacaoLote.js`).

### 4.6 Parcelamentos (`Parcelamentos.jsx`, 353 linhas)  ·  P2
- **Já existe:** indicadores (dívida restante, parcelas ativas, comprometido do mês), agrupamento por pessoa/cartão/categoria, progresso por linha.
- **Problemas:** 60 estilos inline; tabela de agrupamento com 6 colunas + lista com 9; barra "Participação" e "Progresso" competem; todos os itens visíveis ao mesmo tempo; colunas ocultas no celular (58 células).
- **Solução:** 4 indicadores (Restante, Compromisso mensal, Ativos, Próximos encerramentos), cartões com barra discreta, agrupar recolhido por padrão, "encerra em" como destaque.
- **Risco:** B.

### 4.7 Calendário (`Calendario.jsx`, 61 linhas)  ·  P2
- Tela curta, só calendário. Falta **agenda cronológica**, separação Atrasados/Hoje/7 dias/demais e tratamento de contas sem vencimento. A linha do mês do Início já usa `contasDoMes` (reaproveitável).
- **Risco:** B.

### 4.8 Por pessoa (`PorPessoa.jsx`, 84 linhas)  ·  P2
- Mostra total por pessoa; falta participação %, principais categorias e maiores despesas; **não separa** o que é próprio do que é devido por terceiros (Divididos tem esse conceito em `lib/divisoes.js`). Preservar as regras de atribuição.
- **Risco:** M (depende de `divisoes`).

### 4.9 Gráficos e Evolução (`Graficos.jsx` 190, `Evolucao.jsx` 129)  ·  P2
- Gráficos já têm "ver em tabela" (bom). Problemas: 9 gráficos em uma página; projeções usam `sobraDoMes` rotulado "sobra"; períodos vazios aparecem como zero (não diferencia ausência de dado e zero); projeção "à vista estimado" sem aviso de base mínima.
- **Solução:** abas por pergunta (Estamos gastando mais/menos? Categorias que cresceram? Sobra média? Compromissos futuros? Distribuição?), meses sem dado como "sem dados", base mínima para tendência.
- **Risco:** M.

### 4.10 Demais telas (resumo)
| Tela | Observação | Prioridade |
|---|---|---|
| Inbox | Fica na gaveta e na barra inferior; precisa aparecer como "Pendências" também no Início | P1 |
| Importar fatura | Fluxo recém-refeito (4 etapas); só integrar com Faturas e Início | P1 |
| Divididos | Mantém; cuidar de "Recebi" e vínculo com Por pessoa | P2 |
| Renda / Renda sazonal | Telas longas (3.087 px no celular), 25 alvos pequenos | P2 |
| Orçamento, Metas, Reserva, Simulador, Empréstimos, Fechamento, Plano de dívidas, Consultor, Meu plano, Cenário | Telas de planejamento densas; agrupar por jornada, sem alterar regras | P2 |
| Aulas, Atendimentos | Perfil/aba própria; manter, só resumir no Início | P2 |
| Cadastros, Automações, Backup, Configurações | Mover para "Mais" | P2 |

---

## 5. Navegação: validação da proposta de 5 áreas

Proposta do prompt: **Início · Movimentações · Cartões · Planejamento · Mais**. Mapeamento validado contra as 34 telas e as dependências:

| Área | Telas | Observações |
|---|---|---|
| **Início** | Início | + bloco de pendências (inclui Inbox) |
| **Movimentações** | Compras, Pagamentos, Parcelamentos, Divididos, Inbox, Buscar | Inbox aqui com selo de contagem; Buscar vira campo de busca global no topo |
| **Cartões** | Faturas, Importar fatura, Cartões | Conciliação passa a morar aqui (junto de Faturas) |
| **Planejamento** | Meu plano, Renda, Contas fixas, Orçamento, Metas, Reserva, Plano de dívidas, Simulador, Empréstimos, Cenário "E se eu adiar?", Fechamento, Aulas, Atendimentos | 13 itens: precisa de **sub-agrupamento** (Planejar · Dívidas · Fechar o mês · Negócios) |
| **Mais** | Dashboard, Gráficos, Evolução, Calendário, Por pessoa, Pessoas, Categorias, Regras aprendidas, Automações, Configurações, Backup | Dashboard/Gráficos/Evolução/Calendário/Por pessoa são **análises**: sugiro uma 6ª entrada **"Análises"** em vez de enterrá-las em "Mais" |

Pontos de atenção:
- **Calendário** é operacional (vencimentos) e analítico: fica em Movimentações > Pagamentos (visão Calendário) e em Análises.
- **Aulas/Atendimentos** dependem do perfil: continuam respeitando `abasOcultas`.
- **Celular:** barra inferior com **Início · Movimentações · Cartões · Planejamento · Mais**; o selo do Inbox migra para "Movimentações" e para o Início. Isso troca os atalhos atuais (Início/Inbox/Compras/Pagar/Menu): "Pagar" e "Compras" viram sub-abas de Movimentações, então **uma tarefa frequente (pagar conta) ganha um toque a mais** se não houver atalho. Mitigação: ação "Registrar pagamento" no Início e sub-abas lembrando a última usada.
- **URLs:** hoje não existem; proponho **hash por tela (`#/pagamentos`)**, mantendo `localStorage` como fallback, sem quebrar nada e permitindo links diretos (Telegram, avisos).
- Nenhuma funcionalidade é removida; os ids das telas continuam os mesmos internamente.

---

## 6. Design system proposto (resumo)

- **Tokens novos** (sem mexer nos existentes): `--space-1…8` (4/8/12/16/24/32), `--radius-sm/md/lg` (6/10/14), escala tipográfica (12/13/14/16/20/28), `--z-*` e sombras. Breakpoints reduzidos a **3**: 640, 900, 1200.
- **Cores semânticas** separadas da marca: `--ok` (pago/conciliado), `--aviso`, `--erro`, `--info`, `--neutro`, e `--brand` só para ação principal. Valor positivo ≠ sucesso ≠ ação.
- **Componentes únicos:** `Indicador` (substitui `.kpi/.metric/.ini-res/.rs-kpi`), `Botao`, `Selo` (cor + ícone/texto, nunca só cor), `Modal`/`Sheet` (foco preso e devolvido, bottom sheet no celular), `ConfirmarDialogo` (substitui os 63 `confirm/alert`), `EstadoVazio`, `Skeleton` por seção, `Lista/Linha` operacional (substitui tabelas onde faz sentido), `BarraDeAcoesEmLote`.
- **Acessibilidade:** rótulos nos checkboxes, `caption` nas tabelas, foco visível consistente, alvos ≥ 44 px no celular, status com texto/ícone.
- **Offline/sync:** o ponto "Sincronizado/Erro ao sincronizar" fica; acrescentar aviso explícito de **sem conexão** e fila de reenvio quando for seguro.

---

## 7. Riscos técnicos e como contê-los

| Risco | Contenção |
|---|---|
| Alterar números sem querer ao reorganizar | Nenhuma fórmula muda; criar **teste de contrato** que congela `resumoDoMes` e `montarInicio` com fixtures antes de mexer nas telas |
| Telas enormes (Pagamentos 584 linhas, 64 estilos inline) | Extrair componentes pequenos primeiro, trocar a composição depois, um PR por tela |
| Regressão nos fluxos de pagamento | Teste E2E de ponta a ponta (já existe a base em `scripts/e2e`) para: marcar pago, adiar, corrigir valor, desfazer |
| Navegação nova quebrar "voltar" do celular | `useVoltar` já trata histórico; manter e cobrir com E2E |
| Perfil esteticista | Rodar a matriz de abas por perfil (`abasOcultas`) em cada fase |
| Dados existentes | Nenhuma migração de banco prevista nesta refatoração |
| Telas com muita informação 'oculta' no celular | Trocar `col-opc` por linha com detalhes, sem perder campo |

---

## 8. Plano em fases (cada uma termina com testes, regressão e sua validação)

| Fase | Entrega | Principais arquivos | Validação |
|---|---|---|---|
| **1** | Esta auditoria + **teste de contrato dos indicadores** (sem mudar tela) | `docs/ux/`, `src/lib/__tests__/` | sua aprovação |
| **2** | Tokens, componentes base (Indicador, Botão, Selo, Modal/Sheet, Confirmar, EstadoVazio, Skeleton), **nova navegação** (5–6 áreas, hash por tela, barra inferior) | `src/index.css`, `src/components/ui/*`, `src/App.jsx`, `src/lib/useVoltar.js` | E2E de navegação desktop/celular |
| **3** | **Pagamentos**, Compras, Faturas (com status de conciliação) | `Pagamentos.jsx`, `Compras.jsx`, `Faturas.jsx`, `lib/inicio.js` (leitura) | E2E de pagar/adiar/lote/importar |
| **4** | **Início** (situação, pendências, ações) e **Dashboard** (análise) + glossário único de indicadores | `Inicio.jsx`, `Dashboard.jsx`, `lib/inicio.js` | teste de contrato + E2E |
| **5** | Parcelamentos, Calendário (calendário/agenda), Por pessoa, Gráficos/Evolução | respectivos `.jsx` | E2E |
| **6** | Responsividade, acessibilidade, regressão completa, perfis | transversal | checklist da seção 20 do prompt |

Cada fase: explicar, listar arquivos, implementar de forma incremental (PRs pequenos), rodar testes (`vitest`, lint, build, E2E), apresentar e só avançar com seu OK.

---

## 9. Decisões tomadas (validadas pelo usuário)

1. **Navegação:** 6 áreas: Início · Movimentações · Cartões · Planejamento · **Análises** · Mais.
2. **URLs:** hash por tela (`#/pagamentos`), mantendo `localStorage` como reserva e o botão voltar do celular como hoje.
3. **TypeScript:** manter JavaScript (JSX) nesta refatoração.
4. **Ordem:** testes de contrato dos indicadores → Fase 2 (tokens, componentes base, navegação) → Fase 3 (Pagamentos, Compras, Faturas) → Fase 4 (Início, Dashboard) → Fases 5 e 6.
5. **Nomes dos indicadores** (seção 3): a validar na Fase 4, quando as telas de Início/Dashboard forem refeitas.

### 9.1 Achado do teste de contrato
O Início e o Dashboard leem a opção "usar a sobra do mês anterior" (`lerUsarSaldoAnterior()`, **ligada por padrão**), enquanto Evolução, Gráficos,
Resumo mensal e Empréstimos calculam sem ela. Por isso o "Pode gastar" do Início inclui a sobra de setembro e o "Resultado do mês" dos gráficos não.
Isso é intencional no código, mas **não está explicado em nenhuma tela**: na Fase 4 o rótulo deve dizer "inclui a sobra do mês anterior".

## 10. Fora do escopo desta refatoração (registrado para depois)
- Bugs/regras financeiras: nenhum encontrado que bloqueie a UX. Observação a investigar separadamente: o estado de "usar sobra do mês anterior" em Pagamentos (`usarSobra`) vs `lerUsarSaldoAnterior()` (Início/Dashboard).
- Migração para TypeScript.
- Integração com saldo bancário real (não existe hoje; "Saldo atual" depende do ajuste manual).


---

## 11. Fase 2 · o que foi entregue (navegação e fundação)

- **Navegação em 6 áreas** (`src/lib/navegacao.js`): Início · Movimentações · Cartões · Planejamento · Análises · Mais. Os ids das telas não mudaram.
  Perfis respeitam `abasOcultas` (esteticista sem Aulas; padrão sem Atendimentos).
- **Endereço por tela** (`#/pagamentos`): link direto, recarregar mantém a tela, endereço inválido é ignorado, botão voltar do celular preservado (`useVoltar`).
- **Barra inferior do celular** com as 5 áreas (Análises fica sob "Mais"); o selo de pendências do Inbox passou para **Movimentações**.
- **Sub-navegação** (chips) no celular com as telas da área; ao tocar numa área abre a **última tela usada nela**.
- **Barra lateral do desktop** agrupada nas 6 áreas.
- **Tokens** (espaço, raio, texto, alvo de toque, cores semânticas) e **componentes base** em `src/components/ui`: `Selo`, `Indicador`, `EstadoVazio`, `Esqueleto`.
  Ainda **não** adotados nas telas (entram na Fase 3). `ConfirmarDialogo` e `Sheet` serão criados na Fase 3, junto do primeiro uso (Pagamentos).
- **Testes:** 11 de navegação, 6 de componentes, E2E de navegação (celular e desktop) e varredura das 34 telas sem rolagem horizontal nem erros.


## 12. Fase 3 · Pagamentos (primeira tela da fase)

- **Lista única de contas** (`src/lib/pagamentosLista.js`): junta contas fixas, faturas de cartão e compras sem cartão, ordenada por urgência
  (atrasadas → a vencer → sem vencimento → pagas). Os totais batem com `resumoDoMes` (teste de contrato). Mês anterior em aberto conta como atrasado; mês futuro nunca.
- **Tela** (`Pagamentos.jsx` + `components/pagamentos/*`): resumo compacto (A pagar, Pago, Atrasadas, Próximos 7 dias) → abas A pagar / Atrasadas / Pagas / Todas (com contagem) → busca → lista com uma ação principal por conta (Pagar/Desfazer) → seleção em lote (só contas seguras) → "Por categoria" e "Dinheiro disponível" recolhidos abaixo.
- **Detalhes expansíveis** por conta: categoria, valor deste mês (contas variáveis), corrigir valor, data do pagamento, adiar, virar dívida, ver fatura.
- **Desfazer** logo após pagar (uma conta ou lote). **Diálogos do app** (`ui/Dialogos.jsx`) no lugar de todos os `confirm/alert/prompt` nativos de Pagamentos.
- **Mantido sem alteração:** `toggleFixo/toggleCartao/toggleOutraConta`, regras de adiamento, dívida, valor variável, fechamento de mês e as fórmulas do resumo.
- **Medido:** altura da tela no celular 1.839 → 1.163 px; colunas ocultas 15 → 0; sem rolagem horizontal; sem diálogos nativos.


## 13. Fase 3 · Compras

- **Lista enxuta** no lugar da tabela de 9 colunas (`Compras.jsx` + `components/compras/LinhaCompra.jsx`): cada compra mostra descrição, data, valor, categoria, pessoa e forma de pagamento. O resto (subcategoria, parcelas, observação, origem, fatura escolhida, divisão, status de pagamento sem cartão) fica nos **detalhes expansíveis**.
- **Ordenação** (data, valor, descrição) e **filtro por origem** (Telegram, manual, fatura…), além dos filtros que já existiam. Agrupamento por mês mantido (mês atual aberto, anteriores recolhidos).
- **Edição rápida de categoria** nos detalhes (a subcategoria fica para você escolher; só salva com os dois). **Renomear** e **Excluir** por diálogos do app; exclusão continua com "Desfazer".
- **Seleção** só quando você pede ("Selecionar"): caixas e barra flutuante com a soma e a troca de categoria em lote (com confirmação).
- **Paginação por mês** (30 por vez, "Mostrar mais") para não pesar no celular.
- **Mantido:** parcelamento, divisão por categoria, fatura escolhida, exportar CSV, regras de mês fechado (`updateCompra`, `salvarDivisao`, `delCompra` inalterados).
- **Estado vazio** com ação (limpar filtros / nova compra) e sem `confirm/prompt` nativos.
- **Medido (celular, 40 compras):** altura 6.803 → 3.583 px; alvos de toque pequenos 84 → 0; colunas ocultas 205 → 0; sem rolagem horizontal.


## 14. Fase 3 · Faturas (visão por mês)

- **Visão "Por mês"** (padrão): um mês por vez (navegação de mês), resumo (Lançado, Valor do banco, Diferença, Pagas) e **um card por cartão** (`components/faturas/CartaoFatura.jsx`, regras em `lib/faturasMes.js`).
- **Quatro estados independentes por fatura, que coexistem:** valor (estimado | real informado) · diferença (sem diferença | faltam identificar | excede) · **conciliação** (sem importação | importada | parcial | conciliada, lida de `importacoes_fatura`) · pagamento (a pagar | vencida | paga).
- **Ações no card:** Ver compras, Importar/Conciliar/Rever conciliação (abre `#/importar`), Informar/Corrigir valor real (modal existente), Registrar/Desfazer pagamento (mesma gravação de Pagamentos), Editar fatura.
- **Secundário e recolhido:** "Compromissos a longo prazo" (gráfico) e "Outros meses" (resumo de uma linha por mês, com atalho).
- **Preservado:** visão **"Todos os meses"** com a tabela antiga, busca, filtros, exportar CSV e a lista de faturas suspeitas; modal de lançar/editar fatura; regras de `lancadoDoCartao`/`faturaDe`.
- **Medido (celular):** 0 colunas ocultas, sem rolagem horizontal; alvos de toque pequenos 5 (eram 12 no desktop).


## 15. Fase 4 · Início

- **Destaque da situação** (`components/inicio/HeroInicio.jsx`): "**Livre para gastar**" (estimativa, com "Não é o saldo da conta"), por dia, barra pago/a pagar/livre e três números de apoio: **Disponível agora · A pagar · Comprometido (% da entrada)**. Sem renda cadastrada o número vira "—" e pede a renda (não mostra projeção como fato). Negativo: "Faltando para fechar o mês".
- **Precisa da sua atenção** (`itensDeAtencao` em `lib/inicio.js`): vencidas, dívidas atrasadas, renda não cadastrada, faturas com diferença, faturas importadas para conciliar, compras no Inbox, vence em 7 dias, valores a receber, plano sazonal; do mais urgente ao menos, com um botão em cada item; 4 visíveis + "Ver todas".
- **Ações rápidas:** + Gasto, + Entrada, Registrar pagamento, Importar fatura, Conferir pendências (4 no topo do desktop).
- **Glossário único** (`lib/glossario.js`): Disponível agora, Sobra prevista do mês, Livre para gastar, A pagar, Comprometido, Resultado do mês, com a definição de cada um; Dashboard passou a usar os mesmos nomes (sem mudar nenhum número).
- **Contraste:** `--text3` de `#5d6b63` (3,2:1) para `#7f8f86` (5,2:1).
- **Removido do Início por redundância:** cartão "Resumo do mês" (entrada/comprometido já estão no destaque). "Linha do mês" ficou recolhida; "Contas a pagar" virou "Próximos pagamentos".
- **Preservado:** categorias (rosca), Aulas, Atendimentos, Dívidas, longo prazo, mês fechado, perfis. Fórmulas inalteradas (`montarInicio` só ganhou `disponivel` e `pctComprometido`, aditivos).
- **Medido (celular):** o primeiro item de atenção termina dentro da primeira tela (≤ 780 px); altura total 2.014 px (era 1.973: ganhou a lista de atenção e perdeu o resumo repetido).


## 16. Fase 5 · Análises e Calendário

- **Análises** (`components/Analises.jsx`): uma tela com seis abas: *Visão geral* (ex-Dashboard) · *Evolução* (ex-Evolução + gráficos de renda × despesas e sobra) · *Categorias* · *Pessoas* (ex-Por pessoa + gasto por pessoa) · *Compromissos* (projeção, parcelas e longo prazo) · ***Orçado × realizado*** (novo). Reaproveita as telas existentes (prop `embutido`), sem mudar nenhum número.
- **Endereços antigos continuam funcionando:** `#/dashboard`, `#/graficos`, `#/evolucao`, `#/porpessoa` abrem a aba certa de Análises; `#/calendario` abre Pagamentos > Calendário. Endereço com aba interna: `#/analises/evolucao`. `irPara('dashboard')` etc. também são resolvidos.
- **Visão geral sem repetição:** KPIs de análise (Renda, Comprometido, Sobra prevista, Resultado do mês); "Já pago", "A pagar" e "Disponível agora" ficaram no Início/Pagamentos; "Atenção neste mês" virou "Alertas do mês", recolhido.
- **Comparação sem tendência inventada** (`lib/comparacoes.js`): só compara com a média quando há **3+ meses com dados**; meses antes do início do app não diluem a média. Antes: "↑ 400%" com 1 mês de histórico; agora: "histórico insuficiente".
- **Orçado × realizado** (`lib/orcadoRealizado.js`): teto × gasto por categoria, com barra (texto acessível), selo (dentro do teto / perto / estourou), restante ou excesso, resumo e estado vazio que leva a Orçamento. Mesmas contas da tela Orçamento.
- **Calendário em Pagamentos** (`CalendarioMes.jsx`, `grade()` em `lib/calendario.js`): visão **Contas | Calendário**; grade do mês (domingo a sábado) com o estado de cada dia (atrasada, a pagar, paga), hoje destacado e o dia aberto abaixo com "Abrir". Área de toque de 44 px. Calendário antigo (lista por dia) removido: a lista de Contas é a agenda.
- **Medido:** 34 telas sem rolagem horizontal e sem erros; abas de Análises sem rolagem horizontal no celular.


## 17. Fase 6 · Planejamento e diálogos

- **Grupos por jornada:** as telas de Planejamento ficam em quatro grupos: *Planejar* (Meu plano, Renda, Contas fixas, Orçamento, Metas, Reserva) · *Dívidas* (Plano de dívidas, Empréstimos, Simulador, "E se eu adiar?") · *Fechar o mês* (Fechamento) · *Negócios* (Aulas, Atendimentos). Aparecem como subtítulos no menu lateral e como rótulos nos chips do celular. Perfis continuam escondendo telas; grupo vazio some.
- **Diálogos do app em todo o sistema** (`lib/dialogos.js` + `DialogoGlobal`): `confirm()`, `alert()` e `prompt()` nativos foram **todos** substituídos (≈ 60 usos em 38 arquivos: Planejamento, Aulas, Atendimentos, Cadastros, Inbox, Divididos, Backup, importação e as justificativas de mês fechado do `useStore`). Mesma aparência, foco automático, Esc e botão voltar do celular funcionam. Sem o componente montado (testes), cai no nativo.
- **Consistência visual:** `.card` e `.metric` passam a usar os mesmos raios, espaços e rótulos dos tokens (`.kpi`, `.indicador`); alvos de toque de 44 px nos controles de Renda sazonal (alvos pequenos em Renda: 21 → 3).
- **Não alterado:** regras e fórmulas de orçamento, metas, reserva, dívidas, empréstimos, simulador, fechamento, aulas e atendimentos; tabelas de simulação continuam com rolagem interna ao cartão.
- **Validado:** 1.065 testes; E2E de navegação, importação, pagamentos, compras, faturas, início, análises e planejamento; varredura das 34 telas sem rolagem horizontal e sem erros.


## 18. Fase 7 · Refinamento (desempenho, acessibilidade, offline, perfis)

- **Desempenho:** as telas carregam sob demanda (`React.lazy`) e as bibliotecas ficam em arquivos próprios. O JavaScript inicial caiu de **1.238 kB (353 kB comprimido) para 151 kB de código do app (49 kB) + 142 kB de React e 210 kB do Supabase**, estes dois reaproveitados do cache entre atualizações. O aviso de pacote acima de 500 kB deixou de aparecer.
- **Falha de carregamento:** se uma tela não carregar (típico logo após uma atualização), aparece "Não consegui abrir esta tela" com **Recarregar**; menu e barra inferior continuam funcionando; trocar de tela limpa o erro.
- **Sem conexão:** aviso no topo e indicador "Sem conexão"; some sozinho quando a internet volta.
- **Janelas (acessibilidade):** o foco entra na janela ao abrir, **fica preso** nela (Tab/Shift+Tab), Esc fecha e o foco volta ao botão que abriu; papel de diálogo e `aria-modal`.
- **Nomes acessíveis:** `acessibilidadeRotulos.js` liga cada `<label>` ao seu campo e usa o placeholder quando falta rótulo. **Campos/botões sem nome acessível nas 34 telas (celular): 17 → 0** (medido).
- **Perfil esteticista:** build próprio testado (Atendimentos visíveis, Aulas escondidas, `#/aulas` ignorado, sem rolagem horizontal, sem erros).
- **Estilos inline:** 1.079 (eram 1.142): não foi feita varredura em massa; cada tela refeita já usa os componentes e tokens do design system, e as demais seguem com estilos inline até serem revisitadas (risco de regressão visual sem benefício imediato).
- **Testes de ponta a ponta no total:** navegação, importação, pagamentos, compras, faturas, início, análises, planejamento, acessibilidade e perfil esteticista (Chromium real, celular e desktop), mais varredura das 34 telas.
