# Sobrou! · Proposta de modernização UX/UI (a partir do protótipo `sobrou-prototipo-completo-2.html`)

Status: **diagnóstico e proposta**. Nenhuma tela foi alterada por este documento. A implementação de Faturas (Fase 3c) está **pausada** à espera da sua decisão.
Complementa `docs/ux/fase1-auditoria.md` (auditoria do código) e não a repete: aqui o foco é confrontar o protótipo com o sistema real.

---

## 1. Resumo

1. **O protótipo e o app já compartilham a mesma identidade.** Fundo verde-escuro quase preto (`#0b100e` × `#0d1210`), painéis (`#141e19` × `#131a17`), verde-limão (`#c5f34c` × `#c6f24e`), cartões arredondados. Isso confirma que **o caminho é evoluir o app, não reescrevê-lo** com outra cara.
2. **O que o protótipo traz de valioso** e vale adotar: um *hero* de situação com número grande; lista "Precisa da sua atenção" com um botão de ação em cada item; separação explícita entre *Sobra projetada* e *Saldo informado*; aviso "importação ≠ conciliação"; navegação mobile de 5 posições; etiquetas pequenas em caixa alta sobre os números.
3. **O que eu questiono** (e proponho diferente): (a) uma barra inferior de 5 itens **sem "Mais"** deixaria 20+ telas sem acesso; (b) **misturar compras e pagamentos numa lista só** confunde dois modelos mentais; (c) um **único selo** por fatura apaga estados que coexistem; (d) gráficos feitos de `div`s sem eixo, valores ou legenda semântica; (e) glifos Unicode no lugar de ícones; (f) "Próximo vencimento: Dia 1" sem dizer **qual** conta.
4. **O app já tem mais do que o protótipo mostra:** kit de gráficos em SVG (colunas, linhas, barras, com `ResizeObserver`, rótulos acessíveis e visão em tabela), "por dia" e repartição pago/falta pagar/livre no Início, estados de conciliação de importação, desfazer, diálogos próprios. O protótipo só tem 5 telas simuladas.
5. **Problema que o protótipo não resolve e o app tem:** o texto secundário `--text3` (`#5d6b63`) tem contraste **3,16:1** sobre os cartões (abaixo do mínimo AA de 4,5:1) e está espalhado por rótulos e legendas. O `muted` do protótipo tem 7,37:1.
6. **Já entregue** das fases de UX (publicado): navegação em 6 áreas + endereço por tela + barra inferior, tokens e componentes base, **Pagamentos** e **Compras** redesenhados. **Faturas** está em andamento (pausada).

---

## 2. Diagnóstico

### 2.1 O protótipo (o que existe de fato no arquivo)
- 5 telas: Início, Movimentações, Cartões, Planejamento, Análises. Dados **demonstrativos**, ações simuladas, nenhuma persistência.
- **Início:** hero em gradiente com "Sobra projetada" (R$ 8.608,80) + barra + duas linhas; 4 cartões (Saldo informado, A pagar, Pendências, Próximo vencimento); "Precisa da sua atenção"; "Próximos pagamentos"; atalhos.
- **Movimentações:** 3 indicadores, busca + filtro de pessoa + abas Todas/A pagar/Pagas, lista com botão Pagar/Desfazer. (O filtro de pessoa reaproveita o campo de busca; não filtra de verdade.)
- **Cartões:** lista de faturas com um selo (Pendente / Revisar / Conferido) e painel de detalhes (lançado, banco, diferença) com Conciliar / Importar / Informar valor.
- **Planejamento:** 3 indicadores + abas Dívidas/Orçamento/Metas/Simulador (Dívidas e Metas são texto/placeholder).
- **Análises:** 3 abas; gráficos de barras feitos com `div` de altura percentual ("visualização ilustrativa"), sem eixo, sem valores, legenda só em texto.
- **Mobile:** barra inferior com 5 glifos Unicode e rótulos de 10 px; conteúdo com 14 px de margem; abas com rolagem horizontal; toast acima da barra.

Fragilidades do protótipo a **não** herdar: sem `aria`/foco em diálogos, sem estados de carregamento/erro, número do hero arbitrário (soma itens pagos ao valor fixo), sem "Mais", sem Atrasadas, sem Inbox, sem Parcelamentos/Divididos/Calendário, ícones por caractere.

### 2.2 O sistema atual (delta desde a auditoria da Fase 1)
Medições reais (Chromium, 34 telas, celular 390 px e desktop 1366 px, dados simulados):

| Tela | Antes | Hoje | Observação |
|---|---|---|---|
| Pagamentos (celular) | 1.839 px, 15 colunas ocultas | 1.163 px, 0 ocultas | lista única, abas, lote, desfazer |
| Compras (celular, 40 compras) | 6.803 px, 84 alvos pequenos | 3.583 px, 0 alvos pequenos | lista enxuta, ordenação, origem |
| Início (celular) | 1.973 px | 1.973 px | **ainda não refeito** |
| Dashboard, Gráficos, Planejamento (14 telas) | densos | **sem mudança** | próximas fases |

Problemas que persistem (resumo; detalhes na Fase 1):
- **Início não responde às 8 perguntas** do negócio: mostra "Pode gastar" (que é projeção), mas não destaca pendências de conferência (Inbox, faturas divergentes), nem a diferença entre *disponível agora* e *sobra prevista*.
- **Dashboard repete o Início** (6 KPIs) e tem comparação enganosa com base curta (ex.: "↑ 400%" com 1 mês de histórico).
- **Vocabulário:** o mesmo número com 3 nomes ("Pode gastar", "Sobra projetada", "Saldo"); "sobra" nos gráficos é **outro** número (sem saldo anterior).
- **Design system incompleto:** tokens novos criados, mas **1.100+ estilos inline** e 4 cartões de indicador antigos ainda vivem nas telas não refeitas; 13 larguras de breakpoint.
- **Contraste:** `--text3` 3,16:1 (falha AA). Alvos de toque pequenos em Renda, Pessoas, Início.
- **Faturas** não mostra o status de conciliação das importações (0 referências a `importacoes_fatura` até a Fase 3c).

### 2.3 Pontos positivos a preservar
Identidade verde-limão/escura; kit de gráficos SVG acessível com tabela; `useVoltar` (botão voltar do celular); skeleton de carga; toasts com desfazer; regras financeiras testadas (`resumoDoMes` com testes de contrato); importação de fatura com 4 etapas; perfis (esteticista); isolamento de dados.

---

## 3. Confronto protótipo × sistema

| Tema | Protótipo | Sistema | Veredito |
|---|---|---|---|
| Áreas de navegação | 5 (Início, Movimentações, Cartões, Planejamento, Análises) | 6 já publicadas (+ "Mais") | **Manter 6.** "Mais" é necessário: Cadastros, Automações, Backup, Pessoas, Categorias, Regras, Configurações |
| Barra inferior | 5 áreas, rótulos 10 px | 5 posições (Análises sob "Mais") | Manter; subir rótulo para 11 px e área de toque 48 px |
| Hero | Gradiente, número 30–49 px, barra | Hero escuro simples, "Pode gastar" | **Adotar o hero**, com o número certo e legenda do que ele é |
| Saldo × sobra × livre | Separa "Saldo informado" de "Sobra projetada" | Mistura em 3 nomes | **Adotar a separação**, com definições do código (seção 4.3) |
| "Atenção" com ação por item | Sim | Parcial (alerta de vencimentos) | **Adotar**, estendendo a Inbox, faturas divergentes, vencidas |
| Movimentações | Compras+pagamentos numa lista | Pagamentos e Compras separados por sub-abas | **Questionar:** manter separados (contas a pagar ≠ compras no cartão) |
| Faturas | 1 selo por cartão | 4 estados independentes (Fase 3c) | **Manter 4 estados**; copiar o painel de detalhes lado a lado no desktop |
| Gráficos | `div`s, sem eixo | SVG com tabela e acessibilidade | **Manter nosso kit** e melhorar (seção 4.5) |
| Ícones | Unicode | SVG próprio | Manter SVG |
| Tipografia | system-ui | DM Sans + DM Mono + Fredoka | Manter (identidade); formalizar escala |
| Contraste | muted 7,4:1 | text3 3,2:1 | **Corrigir o nosso** |
| Dashboard | (não existe) | Tela própria repetida | **Fundir em Análises** |

---

## 4. Proposta

### 4.1 Arquitetura de navegação
Seis áreas (a hipótese de cinco + "Mais"), com os mesmos ids de tela e endereço `#/tela`:

- **Início:** situação, atenção, próximos pagamentos, ações rápidas.
- **Movimentações:** Pagamentos · Compras · Parcelamentos · Divididos · Inbox · Buscar.
- **Cartões:** Faturas · Importar fatura · Cartões.
- **Planejamento:** Meu plano · Renda · Contas fixas · Orçamento · Metas · Reserva · Dívidas (+ Consultor) · Empréstimos · Simulador · "E se eu adiar?" · Fechamento · Aulas/Atendimentos. Sub-agrupado em *Planejar · Dívidas · Fechar o mês · Negócios*.
- **Análises** (**mudança proposta**): em vez de Dashboard + Gráficos + Evolução + Por pessoa + Calendário como 5 telas soltas, **uma tela com abas**: *Visão geral* (o que hoje é o Dashboard) · *Evolução* (receita, despesa, sobra) · *Categorias* · *Pessoas* · *Compromissos* (parcelas, dívidas, longo prazo) · *Orçado × realizado*. Os ids antigos (`dashboard`, `graficos`, `evolucao`, `porpessoa`) continuam funcionando como **atalhos** para a aba certa: nenhuma URL ou acesso é perdido.
- **Mais:** Pessoas, Categorias, Regras aprendidas, Automações, Configurações, Backup.

**Onde fica o Calendário?** Seu rascunho o coloca em Planejamento; hoje está em Análises. Recomendo **Movimentações > Pagamentos como visão "Calendário"** (lista | calendário), porque a pergunta que ele responde é "o que vence quando", ligada a pagar; o Início aponta para ele. Decisão sua (seção 7).

### 4.2 Hierarquia de informação por tela (mobile primeiro)

**Início (390 × 844):** cabeçalho 56 px → mês → **Hero** (≈ 190 px) → "Precisa da sua atenção" (3 itens com botão) → "Próximos pagamentos" (4) → ações rápidas → gastos por categoria (resumo, "ver análises").
```
┌ Início                    ● ┐
│ ‹  Nov/26  ›                │
│ ┌─ HERO ──────────────────┐ │
│ │ LIVRE PARA GASTAR       │ │   número grande, 1 por tela
│ │ R$ 2.340   ≈ R$ 117/dia │ │   por dia: já existe (porDia)
│ │ ▓▓▓▓▓▓░░░░░  pago·a pagar·livre │ já existe (reparto)
│ │ Disponível agora  R$ x  │ │   2 conceitos distintos, nomeados
│ │ Sobra prevista    R$ y  │ │
│ └─────────────────────────┘ │
│ Precisa da sua atenção      │
│  ⚠ 2 contas vencidas  [Pagar]│
│  ✉ 3 compras no Inbox [Revisar]│
│  ▣ Fatura Inter com diferença [Conferir]│
│ Próximos pagamentos  ver tudo│
│ + Gasto  + Entrada  Importar fatura│
└ Início Mov. Cartões Plan. Mais ┘
```
Desktop: hero (2/3) ao lado de "atenção" (1/3); abaixo, próximos pagamentos e categorias lado a lado.

**Movimentações > Pagamentos / Compras:** já refeitas (abas, lista única, lote, desfazer).
**Cartões > Faturas:** visão por mês, um card por cartão com 4 estados independentes (valor · diferença · conciliação · pagamento); no desktop painel de detalhes ao lado.
**Planejamento:** cartões-resumo (reserva, compromissos futuros, orçamento) e abas por jornada; cada aba reaproveita a tela existente com o novo layout.
**Análises:** abas com o kit de gráficos; seletor de período no topo (3, 6, 12 meses).

### 4.3 Indicadores: três conceitos de dinheiro, sem fórmula nova
Todos já existem em `resumoDoMes` (testes de contrato):

| Nome na tela (proposta) | Número real | O que significa | Cuidado |
|---|---|---|---|
| **Disponível agora** | `disponivel` | dinheiro que existe hoje segundo o app (renda + sobra anterior − já pago + acerto − aulas a receber) | só é "saldo da conta" se você usou **Acertar com o saldo real**; senão é estimativa |
| **Sobra prevista do mês** | `sobraProjetada` | o que sobra no fim do mês se tudo previsto acontecer | **projeção**, nunca chamar de dinheiro disponível |
| **Livre para gastar** | `max(sobraProjetada, 0)` (já usado em `repartoDoMes`) e `porDia` | parte da sobra prevista ainda não comprometida | continua sendo estimativa; sem renda cadastrada, mostrar "Cadastre a renda" |
| **A pagar** | `aPagar` | comprometido − pago | substitui "Falta pagar" e "Total dívidas (a pagar)" |
| **Comprometido** + **% da renda** | `comprometido`, `pct` | o que já está assumido no mês | já calculado no Dashboard |

"Saldo bancário" **não existe** no app (não há integração). O protótipo mostra "Saldo informado R$ 19.178": só poderia aparecer se o usuário o digitar (acerto). **Não proponho criar esse campo agora.**

### 4.4 Design system
- **Cores:** manter a paleta; **separar** marca/ação (limão) de significado (ok, aviso, erro, info, neutro), já em tokens `--cor-*`. Subir `--text3` de `#5d6b63` (3,2:1) para **`#7f8f86` (5,2:1)**. Hero: gradiente escuro-verde de uso único por tela.
- **Tipografia:** DM Sans (texto), DM Mono (valores, algarismos tabulares), Fredoka (marca). Escala 12/13/14/16/20/28 e **hero 36–44 px** (`clamp`). Eyebrow em caixa alta 11–12 px.
- **Espaço e forma:** passo 4/8; raios 10/14/18; sombras mínimas; bordas 1 px.
- **Componentes:** Hero · Indicador · Selo · Linha operacional · Card · Abas/pílulas · Sub-navegação · Barra inferior · Diálogo/Sheet · Toast com desfazer · Estado vazio · Esqueleto por seção · Barra de filtros · **Kit de gráficos**.
- **Adoção:** trocar os 4 cartões de indicador antigos e reduzir estilos inline conforme cada tela for refeita (não em uma varredura única).

### 4.5 Padrão de gráficos
Manter o kit SVG e padronizar: eixos com valores abreviados ("R$ 12 mil"); rótulo de valor no toque/foco; legenda com **forma + cor** (nunca só cor); alternância **Gráfico | Tabela** (já existe); seletor de período (3/6/12 meses); **ausência de dado ≠ zero** (mês sem dados fica vazio com legenda "sem dados"); **projeção/estimativa** em traço tracejado ou hachurado; base mínima (≥ 3 meses) para comparar com média, senão "histórico insuficiente"; largura via `ResizeObserver` (já existe) com rótulos que se reduzem no celular (sem corte, sem rolagem horizontal); estado de carregamento por gráfico.
Novos gráficos propostos (dados já existem): **Orçado × realizado** por categoria, **evolução de faturas** por cartão, **projeção de parcelas e dívidas** (reaproveita `LongoPrazo`).

### 4.6 Regras mobile-first
- **Orçamento de altura (390 × 844):** cabeçalho ≤ 56, hero ≤ 200, barra inferior 64 → o conteúdo prioritário (atenção) aparece **sem rolar**.
- Alturas definidas pelo conteúdo (nada de `min-height` fixo em cartões); espaçamento vertical entre blocos fixo em 12 px (celular) / 16 px (desktop).
- Toque ≥ 44 px; rótulos da barra ≥ 11 px; sem rolagem horizontal da página (verificado automaticamente nas 34 telas).
- Tabelas viram listas/cartões; nenhum campo essencial escondido por `col-opc`.
- Tablet: duas colunas a partir de 700 px; desktop: três a partir de 1100 px.

### 4.7 Jornadas principais (cada uma validada com teste de ponta a ponta)
1. **Pagar uma conta:** Início (atenção) → Pagar → desfazer. *(Pagamentos já entregue.)*
2. **Conferir uma fatura:** Início/Cartões → card do cartão → Importar/Conciliar → status atualizado nos 4 estados.
3. **Lançar compra:** "+ Gasto" no Início → formulário → lista.
4. **Revisar Inbox:** Início (atenção) → Inbox → confirmar.

### 4.8 Trade-offs
- Fundir Dashboard em Análises **reduz repetição** mas muda um hábito (quem abre "Dashboard"); mitigado com atalho/aliases.
- Nome "Livre para gastar" é mais claro que "Pode gastar", mas exige explicar que é **estimativa**; por isso o hero sempre mostra *Disponível agora* e *Sobra prevista* logo abaixo.
- Manter DM Sans em vez de `system-ui` custa ~20 KB de fonte, mas preserva a identidade.
- Sub-navegação por chips no celular adiciona uma linha de altura (~48 px) em troca de acesso direto às telas da área.

---

## 5. Plano de implementação (ajustado ao que já existe)

| Fase | Entrega | Situação |
|---|---|---|
| 1 | Auditoria e testes de contrato dos indicadores | ✅ publicada |
| 2 | Navegação em 6 áreas, endereço por tela, tokens, componentes base | ✅ publicada |
| 3a | Pagamentos | ✅ publicada |
| 3b | Compras | ✅ publicada |
| **3c** | **Faturas** (visão por mês, 4 estados, conciliação) | ⏸ em andamento (código parcial na branch `claude/ux-fase3-faturas`) |
| **4** | **Início** (hero, atenção, ações) + glossário único de indicadores + correção de contraste (`--text3`) | a fazer |
| **5** | **Análises** (Dashboard + Gráficos + Evolução + Por pessoa + Calendário/Compromissos em abas) e kit de gráficos | a fazer |
| **6** | **Planejamento** (Orçamento, Metas, Reserva, Dívidas, Simulador, Fixos, Renda, Fechamento…) | a fazer |
| **7** | Refinamento: trocar estilos inline e cartões antigos pelo design system, acessibilidade, desempenho, regressão completa, perfis | a fazer |

Cada fase: arquivos afetados listados antes, PRs pequenos, testes unitários + E2E reais (celular e desktop), **sua validação antes de publicar**.

## 6. O que não muda
Fórmulas financeiras, banco de dados, autenticação/RLS, Telegram/Android, importação de fatura (apenas integração visual), perfis, backup. Se eu encontrar um problema real nessas regras, **documento à parte** com teste, nunca misturado ao visual.

## 7. Decisões tomadas (validadas pelo usuário)
1. **Análises** vira **uma tela com abas** (Visão geral, Evolução, Categorias, Pessoas, Compromissos, Orçado × realizado); `#/dashboard`, `#/graficos`, `#/evolucao` e `#/porpessoa` continuam como atalhos.
2. **Calendário** vai para **Movimentações > Pagamentos**, como visão Lista | Calendário.
3. **Número principal do Início:** **"Livre para gastar"**, com *Disponível agora* e *Sobra prevista* logo abaixo.
4. **Ordem:** terminar **Faturas (3c)** e depois **Início (Fase 4)**.
5. Contraste do texto secundário (`--text3` → `#7f8f86`): incluído na Fase 4 (não foi objeto de pergunta separada; avise se discordar).
