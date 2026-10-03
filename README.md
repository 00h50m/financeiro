# Sobrou! · Seu dinheiro, finalmente, sobrando.

Sistema financeiro pessoal (React + Vite + Supabase), com login, instalável no celular (PWA).

## Funcionalidades

**Visão geral**
- **Dashboard** — resumo do mês (renda, comprometido, sobra projetada, % da renda), distribuição por pessoa, gastos por categoria (clique para ver o que compõe cada uma), avisos de teto estourado e projeção dos próximos 6 meses.

**Dia a dia**
- **Compras** — lançamento com parcelas, pessoa, categoria/subcategoria, cartão (ou sem cartão), várias compras em uma só (ex.: Mercado Livre), nome como aparece no cartão + identificação opcional.
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

Usuários: crie em **Authentication → Users** e deixe o cadastro aberto desligado.

## Rodar localmente

```bash
npm install
npm run dev
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
  components/      # uma tela por arquivo (Dashboard, Compras, Pagamentos, Orcamento, Reserva, Simulador, ...)
  App.jsx          # login, menu lateral e roteamento por aba
  index.css
```
