-- 20 · Contas fixas de valor variável (energia, condomínio, água...)
-- fixos.valor passa a ser só a ESTIMATIVA quando variavel = true; o valor real de cada mês fica em fixos_valores.
-- Cada mês tem a sua linha: informar o valor de um mês nunca altera os outros.
alter table fixos add column if not exists variavel boolean not null default false;

create table if not exists fixos_valores (
  id uuid primary key default gen_random_uuid(),
  fixo_id uuid not null references fixos(id) on delete cascade,
  mes text not null,
  valor numeric not null,
  created_at timestamptz not null default now(),
  unique (fixo_id, mes)
);

alter table public.fixos_valores enable row level security;
drop policy if exists "usuarios logados" on public.fixos_valores;
create policy "usuarios logados" on public.fixos_valores for all to authenticated using (true) with check (true);
revoke all on public.fixos_valores from anon;
