-- Sobrou! · Configurações do app (chave/valor) — usado pela Reserva de emergência
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
create table if not exists public.config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);

alter table public.config enable row level security;
drop policy if exists "usuarios logados" on public.config;
create policy "usuarios logados" on public.config
  for all to authenticated using (true) with check (true);
