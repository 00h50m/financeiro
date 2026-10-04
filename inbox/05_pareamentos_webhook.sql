-- Inbox 05/10 · códigos de pareamento e proteção contra reenvio

-- Código de uso único para conectar Telegram ou Android. O navegador gera o
-- código e guarda só o hash; o servidor confere e cria a integração.
-- Validade máxima: 15 minutos.
create table if not exists pareamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('telegram','android')),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  codigo_hash text not null unique,
  expira_em timestamptz not null default (now() + interval '10 minutes'),
  usado_em timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (expira_em <= created_at + interval '15 minutes')
);

-- Anti-replay do webhook do Telegram (ele reenvia quando a resposta falha)
-- e base do limite de requisições por usuário. Linhas antigas podem ser apagadas.
create table if not exists webhook_updates (
  update_id bigint primary key,
  telegram_user_id bigint,
  recebido_em timestamptz not null default now()
);
create index if not exists webhook_updates_usuario_idx
  on webhook_updates (telegram_user_id, recebido_em);
