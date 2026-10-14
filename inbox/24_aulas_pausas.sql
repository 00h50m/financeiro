-- Aulas particulares: períodos sem aula (férias, feriados). Repetível: pode rodar de novo sem estragar nada.
-- aluno_id vazio = vale para todos os alunos.
create table if not exists aulas_pausas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid references alunos(id) on delete cascade,
  inicio date not null,
  fim date not null check (fim >= inicio),
  motivo text,
  criado_em timestamptz not null default now()
);

alter table public.aulas_pausas enable row level security;
drop policy if exists "usuarios logados" on public.aulas_pausas;
create policy "usuarios logados" on public.aulas_pausas for all to authenticated using (true) with check (true);
revoke all on public.aulas_pausas from anon;
