# Nova instalação do Sobrou! (outra pessoa, outro banco)

Cada pessoa tem a **sua instalação**: banco, site e (se quiser) bot próprios. O código é o mesmo, mas **nenhum dado é compartilhado**.
Quem cria o projeto no Supabase consegue abrir as tabelas dele: por isso **a dona da instalação cria as próprias contas**
e não passa senhas, chaves `service_role` nem tokens para ninguém.

Perfis disponíveis (variável `VITE_PERFIL`, e `PERFIL` nas funções do servidor):

| Perfil | O que muda |
|---|---|
| `padrao` (ou vazio) | O app como é: com Aulas particulares (a aba Atendimentos fica escondida) |
| `esteticista` | Com **Atendimentos** (clientes, serviços e agenda) no lugar de Aulas particulares; nomes de renda neutros ("Renda principal"); uma pessoa só ("Eu") |

## Os dados nunca se misturam

- Cada instalação tem **o próprio projeto no Supabase** (banco e logins) e **o próprio site na Vercel**, com as próprias variáveis.
  Não existe nenhum lugar onde duas instalações compartilhem dados: o que uma pessoa lança não aparece na outra, nem para quem administra o código.
- O código é o mesmo, então as **tabelas existem em todas as instalações**, mas ficam vazias onde não são usadas (a aba correspondente nem aparece).
- Só há mistura se alguém **colocar as chaves do mesmo Supabase nos dois sites**: confira `VITE_SUPABASE_URL` ao configurar cada um.

## 1. Conta e projeto no Supabase (grátis)

1. Crie a conta em [supabase.com](https://supabase.com) e um **New project** (anote a senha do banco; escolha a região mais próxima).
2. Em **SQL Editor**, cole o conteúdo do arquivo `banco-completo.sql` e clique **Run**. Quem tem o repositório gera o arquivo com:
   - perfil padrão: `node scripts/juntar-sql.mjs > banco-completo.sql`
   - perfil esteticista: `node scripts/juntar-sql.mjs esteticista > banco-completo.sql`

   O arquivo só tem a estrutura (tabelas, regras de segurança e funções), nenhum dado. Rodar de novo não estraga nada.
   Ele já termina com a proteção "só usuários logados" (`rls_login.sql`).
3. Em **Authentication → Users → Add user**, crie o login (e-mail e senha) de quem vai usar o app.
4. Em **Authentication → Sign In / Providers**, **desligue** "Allow new users to sign up" (cadastro aberto).
5. Em **Project Settings → API**, copie: **Project URL**, **anon public key** e **service_role key** (esta última é segredo: só vai para a Vercel).

## 2. Site na Vercel (grátis)

1. Crie a conta em [vercel.com](https://vercel.com) e **Add New → Project**, importando o repositório do app (a pessoa que tem o repositório precisa dar acesso a ele, ou fazer uma cópia).
2. Em **Environment Variables**, cadastre (Production):

   | Variável | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL |
   | `VITE_SUPABASE_ANON_KEY` | anon public key |
   | `VITE_PERFIL` | `esteticista` (ou `padrao`) |
   | `PERFIL` | o mesmo valor, para as funções do servidor |
   | `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**nunca** com prefixo `VITE_`) |
   | `CRON_SECRET` | um texto longo e secreto qualquer |
   | `APP_URL` | o endereço do site (ex.: `https://minha-instalacao.vercel.app`), depois do primeiro deploy |

3. **Deploy**. Se mudar uma variável `VITE_*`, faça um novo deploy (elas entram na hora do build).
4. Abra o site, entre com o login criado no passo 1.3.

## 3. Opcionais

- **Bot do Telegram** (lançar gasto por mensagem, avisos): crie um bot com o @BotFather e cadastre `TELEGRAM_BOT_TOKEN` e `TELEGRAM_WEBHOOK_SECRET` na Vercel; depois, no app, **Automações › Ativar bot** (veja o README, seção Telegram).
- **IA** (ler notinha e fatura em PDF, consultor e "Meu plano"): `ANTHROPIC_API_KEY`, com a chave da própria dona (o gasto vai para a conta de quem cadastrou a chave).

## 4. Primeiro uso

1. **Pessoas**: confira o nome (perfil esteticista já nasce com "Eu").
2. **Cartões**, **Contas fixas** e **Renda**: cadastre o básico.
3. **Instalar como app**: no celular, abra o site no navegador e use "Adicionar à tela inicial".

## Atualizações

O código novo chega pelo repositório (a Vercel publica sozinha). Quando uma atualização trouxer um SQL novo (`inbox/NN_*.sql`),
rode **só esse arquivo** no SQL Editor da instalação, antes de usar a novidade.
