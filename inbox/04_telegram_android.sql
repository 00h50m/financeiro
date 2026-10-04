-- Inbox 04/10 · Telegram e dispositivos Android (gravação só pelo servidor)

-- Quem pode falar com o bot. Criado só pelo servidor, após validar um código.
create table if not exists integracoes_telegram (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  ativo boolean not null default true,
  conectado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);

-- token_hash = SHA-256 do token (o token só aparece uma vez, no pareamento).
-- Revogar = preencher revogado_em.
create table if not exists dispositivos_android (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  nome text not null,
  token_hash text not null unique,
  apps_permitidos text[] not null default '{}',
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogado_em timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_dispositivo_fk') then
    alter table eventos_financeiros
      add constraint eventos_dispositivo_fk foreign key (dispositivo_id)
      references dispositivos_android(id) on delete set null;
  end if;
end $$;
