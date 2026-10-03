-- Sobrou! · Orçamento por categoria (teto mensal)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez sem problema.
-- Uma linha por categoria; `valor` é o teto mensal (R$). `categoria` guarda o
-- NOME da categoria (texto, igual a compras/fixos) — renomear/excluir uma
-- categoria pelo app já atualiza/remove o teto correspondente.

create table if not exists public.orcamentos (
  categoria text primary key,
  valor numeric not null check (valor >= 0),
  atualizado_em timestamptz not null default now()
);

alter table public.orcamentos enable row level security;
drop policy if exists "usuarios logados" on public.orcamentos;
create policy "usuarios logados" on public.orcamentos
  for all to authenticated using (true) with check (true);
