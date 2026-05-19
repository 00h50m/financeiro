# Gi & Sabi · Sistema Financeiro

Sistema financeiro pessoal com Supabase + React + Vite.

## Pré-requisitos

- Node.js 18+
- Conta no [Supabase](https://supabase.com) com as tabelas criadas (use o `schema.sql`)
- Conta no [Vercel](https://vercel.com)

## Rodar localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:5173`

## Deploy no Vercel

### Opção 1 — Via GitHub (recomendado)

1. Suba o projeto para um repositório no GitHub
2. Acesse [vercel.com](https://vercel.com) → **Add New Project**
3. Importe o repositório
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL` → `https://tsubudquwmobcpeoftwm.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` → sua anon key
5. Clique em **Deploy**

### Opção 2 — Via Vercel CLI

```bash
npm install -g vercel
vercel
```

Siga as instruções. Quando pedir as variáveis de ambiente, informe as duas acima.

## Variáveis de ambiente

Crie um arquivo `.env` na raiz (já existe como exemplo em `.env.example`):

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

> ⚠️ Nunca commite o `.env` com credenciais reais. O `.gitignore` já o exclui.

## Estrutura

```
src/
  lib/
    supabase.js     # cliente Supabase
    useStore.js     # todas as queries e mutations
    utils.js        # funções e constantes compartilhadas
  components/
    Dashboard.jsx
    Compras.jsx
    Parcelamentos.jsx
    Faturas.jsx
    Renda.jsx
    Fixos.jsx
    Cartoes.jsx
    ModalCompra.jsx
  App.jsx
  main.jsx
  index.css
```
