# Sobrou! · Seu dinheiro, finalmente, sobrando.

Sistema financeiro pessoal (React + Vite + Supabase), com login, instalável no celular (PWA).

## Funcionalidades

**Visão geral**
- **Dashboard** — resumo do mês (renda, comprometido, sobra projetada, % da renda), distribuição por pessoa, gastos por categoria (clique para ver o que compõe cada uma), avisos de teto estourado e projeção dos próximos 6 meses.

**Dia a dia**
- **Inbox** — lançamentos que chegam de outras fontes (por enquanto: adicionados no próprio Inbox; depois Telegram, notificações do Android e fatura) e ainda não viraram compra. Cada item mostra a origem, a categoria sugerida (aprendida com o seu histórico), avisa o que falta e detecta se já existe uma compra parecida ("Vincular" ou "Criar separadamente"). Nada vira compra sem confirmação.
- **Compras** — mostra de onde veio cada compra (Telegram, fatura...), permite marcar várias e trocar a categoria de uma vez; lançamento com parcelas, pessoa, categoria/subcategoria, cartão (ou sem cartão), várias compras em uma só (ex.: Mercado Livre), nome como aparece no cartão + identificação opcional.
- **Parcelamentos** — compras parceladas em andamento, progresso, valor restante e término.
- **Faturas** — valor real de cada fatura (por cartão/mês) comparado ao que foi lançado.
- **Pagamentos** — controle do que está pago e a pagar no mês (contas fixas, faturas, contas sem cartão), total de dívidas, dinheiro disponível (renda + sobra do mês anterior − pago) e acerto com o saldo real da conta.
- **Importar fatura** — CSV da fatura → revisão editável → salva. Detecta duplicatas, confere parcelas e valor da fatura, sugere categoria pelo histórico e lança parcelas em andamento.

**Planejamento**
- **Renda** — renda por mês (salários, extras, mesada, outros).
- **Contas fixas** — gastos mensais recorrentes, com mês de término e dia de vencimento opcionais.
- **Orçamento** — teto mensal por categoria, gasto, restante, status e sugestão pela média dos 3 meses anteriores.
- **Reserva** — reserva de emergência: quantos meses ela cobre, meta e ritmo para completar.
- **Simulador** — impacto de uma compra parcelada mês a mês, parcela máxima que cabe, menor parcelamento possível, melhor mês para começar e aviso de limite do cartão.

**Cadastros**
- **Automações** — conecta o bot do Telegram (status, ativar, gerar código de pareamento, testar, pausar, desconectar).
- **Cartões** — titular, fechamento, vencimento e limite (com uso do limite).
- **Categorias** — categorias e subcategorias editáveis; excluir exige migrar os lançamentos.
- **Pessoas** — pessoas e cores.
- **Backup** — backup completo (.json) e CSV por tabela.

**Geral**: login (Supabase Auth), tela cheia no computador, menu em gaveta no celular, instalável como app (PWA).

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com) com as tabelas criadas
- Conta no [Vercel](https://vercel.com)

## Banco de dados (SQL)

Rode no SQL Editor do Supabase:

| Arquivo | Para quê |
|---|---|
| `schema.sql` | Todas as tabelas (banco novo do zero) |
| `rls_login.sql` | Protege as tabelas: só usuários logados (rodar **depois** de publicar o app com login) |
| `orcamentos.sql` | Tabela de tetos por categoria |
| `config.sql` | Configurações (reserva de emergência) |
| `cartoes_limite.sql` | Coluna de limite do cartão |
| `inbox/01` a `inbox/12` | Inbox Financeiro (rodar **em ordem**, uma parte por vez; cada uma é repetível). `inbox/desfazer.sql` reverte. |

Usuários: crie em **Authentication → Users** e deixe o cadastro aberto desligado.

## Telegram (lançar gastos por mensagem)

Mensagens como `gastei 89,90 no Outback no Nubank`, `mercado 187,40 inter gi` ou `uber 32,50` viram um
item no Inbox/confirmação no próprio chat. Nada é lançado sem tocar em **Confirmar**; se faltar algo
(cartão, categoria...), o bot pergunta. Só pessoas **pareadas** são atendidas; qualquer outro usuário é ignorado.

Configuração (uma vez):
1. No Telegram, converse com **@BotFather** → `/newbot` → guarde o **token**.
2. Na Vercel (Settings › Environment Variables) cadastre e faça um novo deploy:
   `TELEGRAM_BOT_TOKEN` (token do passo 1) · `TELEGRAM_WEBHOOK_SECRET` (senha livre, só letras/números, 20+ caracteres) ·
   `SUPABASE_SERVICE_ROLE_KEY` (Supabase › Project Settings › API › `service_role`).
   A service role **nunca** vai no navegador (por isso não tem o prefixo `VITE_`).
3. No app: **Automações › Ativar bot**, depois **Gerar código** para cada pessoa e envie `/start CÓDIGO` ao bot
   (ou toque no link mostrado). O código vale 10 minutos e uma única vez.

**Foto de notinha (opcional):** com a variável `ANTHROPIC_API_KEY` na Vercel (chave de [console.anthropic.com](https://console.anthropic.com)), o bot
também lê a foto de uma notinha ou comprovante (valor, local e data) e mostra o mesmo resumo com **Confirmar**. A legenda
completa o resto (ex.: `nubank gi`, `3x`). Usa o modelo Claude Sonnet 5.5 (centavos por foto); sem a chave, o bot avisa
que não lê fotos. Só quem está pareado gasta a IA. Datas futuras ("amanhã") são recusadas.

**Recado de voz (opcional):** com a variável `GROQ_API_KEY` na Vercel (chave de [console.groq.com](https://console.groq.com)), o bot
transcreve recados de voz de até 1 minuto (Whisper Large v3 Turbo, em português) e segue como se o texto tivesse sido
digitado: mostra o que entendeu (`🎤 Entendi: ...`) e o resumo com **Confirmar**. Sem a chave, o bot avisa que não entende áudio.

**Resumo automático de domingo (opcional):** rode `inbox/11_resumo_semanal.sql` no Supabase e cadastre `CRON_SECRET` na Vercel
(qualquer texto longo e secreto, em todos os ambientes; a Vercel o manda sozinha no cabeçalho do agendamento de `vercel.json`).
Cada pessoa liga com `/avisos on` e desliga com `/avisos off`; o envio sai todo domingo às 19h (horário de Brasília) por `api/cron-resumo.js`.

**Menu:** mandar "oi", "menu" ou `/menu` mostra botões para as consultas (resumo, faturas, próximas faturas, última compra, pendentes, avisos). Os botões só consultam; nada é lançado ou apagado por eles.

**Próximas faturas:** `/proximas` (ou "quais as próximas faturas do nubank?") lista mês a mês o que já está comprometido em parcelas.

**Lançamento automático (opcional, desligado por padrão):** rode `inbox/12_auto_lancar.sql` no Supabase e use `/auto on`. Só gastos *digitados* (não foto nem voz) são lançados sem Confirmar, e só quando tudo é certo: lugar com 90%+ de confiança no histórico (cerca de 9 compras confirmadas, sem correções), cartão dito na mensagem, sem compra parecida e valor até R$ 300. O bot avisa e dá para corrigir em `/ultima`; quando não lança sozinho, diz o motivo. `/auto off` volta ao normal.

**Aviso de teto:** se a categoria tem teto na tela Orçamento, ao confirmar uma compra o bot avisa quando ela passa de 80% ou estoura o teto do mês (só quando essa compra mudou a situação).

Código do bot: `api/telegram.js` (webhook), `api/telegram-admin.js` (tela Automações) e `api/_lib/` (lógica e `leitorNota.js`, testada
sem rede). Segurança: segredo do webhook conferido em tempo constante, `update_id` processado uma vez, limite de
mensagens por minuto, só conversa privada.

## Rodar localmente

```bash
npm install
npm run dev
npm test      # testes (regras do Inbox, parser do Telegram, lógica do bot)
```

Acesse `http://localhost:5173`

## Deploy no Vercel

1. Suba o projeto para um repositório no GitHub
2. Em [vercel.com](https://vercel.com) → **Add New Project** → importe o repositório
3. Em **Environment Variables**, adicione `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`
4. **Deploy** (cada `git push` na `master` publica sozinho)

## Variáveis de ambiente

Crie um arquivo `.env` na raiz (modelo em `.env.example`):

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

> ⚠️ Nunca commite o `.env` com credenciais reais. O `.gitignore` já o exclui.

## Instalar como app (PWA)

- **Android/Chrome**: menu ⋮ → *Instalar app* (ou *Adicionar à tela inicial*).
- **iPhone/Safari**: botão compartilhar → *Adicionar à Tela de Início*.
- **Computador (Chrome/Edge)**: ícone de instalar na barra de endereço.

O service worker (`public/sw.js`) guarda só o "casco" do app (HTML/JS/CSS/ícones). Os dados financeiros nunca ficam em cache no aparelho.

## Estrutura

```
public/            # ícones, manifest.webmanifest, sw.js
src/
  lib/             # supabase.js, useStore.js (queries/mutations), utils.js (cálculos compartilhados)
                   # normalizacao / estabelecimento / categorizacao / reconciliacao / evento: regras do Inbox (puras e testadas)
  components/      # uma tela por arquivo (Dashboard, Compras, Pagamentos, Orcamento, Reserva, Simulador, ...)
  App.jsx          # login, menu lateral e roteamento por aba
api/               # funções de servidor da Vercel (Telegram); `_lib/` não é rota
  index.css
```
