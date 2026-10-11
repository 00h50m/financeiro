-- Inbox 22 · Renda sazonal: quanto cada fonte de renda rende em cada mês do ano (férias, meses fracos).
-- Repetível: pode rodar de novo sem duplicar nada.
--   campo        = fonte de renda (giovanna, sabrina, extra_sabrina, mesada, outros)
--   mes_do_ano   = 1 (janeiro) a 12 (dezembro)
--   fator        = 1 normal · 0,7 um pouco menos · 0,4 fraco · 0 não recebe

create table if not exists renda_sazonal (
  id uuid primary key default gen_random_uuid(),
  campo text not null check (campo in ('giovanna', 'sabrina', 'extra_sabrina', 'mesada', 'outros')),
  mes_do_ano int not null check (mes_do_ano between 1 and 12),
  fator numeric not null check (fator >= 0 and fator <= 2),
  atualizado_em timestamptz not null default now(),
  unique (campo, mes_do_ano)
);

alter table public.renda_sazonal enable row level security;
drop policy if exists "usuarios logados" on public.renda_sazonal;
create policy "usuarios logados" on public.renda_sazonal for all to authenticated using (true) with check (true);
revoke all on public.renda_sazonal from anon;
