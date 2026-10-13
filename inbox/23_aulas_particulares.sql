-- Inbox 23 · Aulas particulares: alunos, programação semanal, aulas, previsão inicial e fechamento por aluno.
-- Repetível: pode rodar de novo sem duplicar nada. Valores em CENTAVOS (inteiros); duração em MINUTOS; datas em AAAA-MM-DD.

create table if not exists alunos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  responsavel text,
  telefone text,
  valor_hora_centavos integer not null check (valor_hora_centavos >= 0),
  inicio date not null,
  fim date,
  ativo boolean not null default true,
  inativado_em date,
  observacoes text,
  criado_em timestamptz not null default now()
);

-- Programação semanal. Mudar a programação = encerrar a linha antiga (vigencia_fim) e criar outra, preservando o histórico.
create table if not exists aulas_programacao (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references alunos(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),   -- 0 domingo ... 6 sábado
  horario text,                                                       -- 'HH:MM' (opcional)
  duracao_min integer not null check (duracao_min > 0),
  vigencia_inicio date not null,
  vigencia_fim date,
  criado_em timestamptz not null default now()
);
create index if not exists aulas_programacao_aluno_idx on aulas_programacao (aluno_id);

create table if not exists aulas (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references alunos(id) on delete cascade,
  data date not null,                          -- data atual (muda na remarcação); define a competência
  data_original date not null,                 -- primeira data prevista (não muda)
  horario text,
  duracao_min integer not null check (duracao_min > 0),
  duracao_real_min integer check (duracao_real_min > 0),
  valor_hora_centavos integer not null check (valor_hora_centavos >= 0),
  valor_hora_manual boolean not null default false,   -- true = valor da hora alterado só nesta aula
  valor_centavos integer,                      -- só preenchido quando realizada (fica preservado)
  status text not null default 'prevista' check (status in ('prevista', 'realizada', 'cancelada', 'nao_realizada')),
  origem text not null default 'recorrente' check (origem in ('recorrente', 'avulsa', 'reposicao')),
  programacao_id uuid references aulas_programacao(id) on delete set null,
  reposicao_de uuid references aulas(id) on delete set null,
  quem text check (quem in ('aluno', 'professora')),   -- quem cancelou / faltou
  motivo text,
  observacao text,
  confirmada_em timestamptz,
  status_em timestamptz,
  historico jsonb not null default '[]'::jsonb,        -- remarcações e edições
  criado_em timestamptz not null default now(),
  unique (programacao_id, data_original)               -- impede gerar a mesma aula duas vezes
);
create index if not exists aulas_aluno_data_idx on aulas (aluno_id, data);
create index if not exists aulas_data_idx on aulas (data);

-- Previsão inicial do mês por aluno: gravada na primeira geração e nunca sobrescrita.
create table if not exists aulas_previsao_inicial (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references alunos(id) on delete cascade,
  mes text not null,
  qtd integer not null,
  minutos integer not null,
  valor_centavos integer not null,
  criada_em timestamptz not null default now(),
  unique (aluno_id, mes)
);

-- Fechamento do mês por aluno (usado no passo 2).
create table if not exists aulas_fechamentos (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references alunos(id) on delete cascade,
  mes text not null,
  status text not null default 'fechado' check (status in ('fechado', 'reaberto', 'sem_cobranca')),
  qtd_aulas integer not null default 0,
  minutos integer not null default 0,
  valor_centavos integer not null default 0,
  itens jsonb not null default '[]'::jsonb,
  mensagem text,
  recebido boolean not null default false,
  recebido_em date,
  recebido_centavos integer,
  revisao integer not null default 1,
  fechado_por text,
  fechado_em timestamptz,
  criado_em timestamptz not null default now(),
  unique (aluno_id, mes)
);

create table if not exists aulas_fechamentos_hist (
  id uuid primary key default gen_random_uuid(),
  aluno_id uuid not null references alunos(id) on delete cascade,
  mes text not null,
  revisao integer not null,
  acao text not null,
  valor_centavos integer,
  itens jsonb not null default '[]'::jsonb,
  motivo text,
  usuario text,
  quando timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['alunos', 'aulas_programacao', 'aulas', 'aulas_previsao_inicial', 'aulas_fechamentos', 'aulas_fechamentos_hist']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format('create policy "usuarios logados" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
