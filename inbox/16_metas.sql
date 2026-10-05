-- Fase 3 · 16: metas (reserva de emergência e objetivos) com histórico de aportes, retiradas e ajustes.
-- Repetível: pode rodar de novo sem duplicar nada.

create table if not exists metas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'objetivo' check (tipo in ('reserva', 'objetivo')),
  valor_alvo numeric,                 -- objetivo: quanto quer juntar (reserva usa meta_meses)
  prazo date,                         -- objetivo: até quando (opcional)
  meta_meses int,                     -- reserva: quantos meses de custo quer cobrir
  base_custo text,                    -- reserva: 'total' (fixos + parcelas) ou 'fixos'
  prioridade int not null default 1,  -- 1 = mais importante; usada na sugestão de destino da sobra
  ativa boolean not null default true,
  criada_em timestamptz not null default now()
);

-- O saldo de uma meta é a soma dos movimentos (aporte positivo, retirada negativa, ajuste com sinal).
create table if not exists metas_movimentos (
  id uuid primary key default gen_random_uuid(),
  meta_id uuid not null references metas(id) on delete cascade,
  data date not null default current_date,
  tipo text not null check (tipo in ('aporte', 'retirada', 'ajuste')),
  valor numeric not null,
  observacao text,
  mes_origem text,                    -- mês (AAAA-MM) de onde veio o aporte, quando houver
  usuario text,
  criado_em timestamptz not null default now()
);
create index if not exists metas_mov_meta_idx on metas_movimentos (meta_id, data desc);

-- Traz a Reserva atual (tela Reserva, guardada na tabela config) para o novo modelo, uma única vez.
do $$
declare
  v_id uuid;
  v_valor numeric;
  v_meses int;
  v_base text;
begin
  if exists (select 1 from metas where tipo = 'reserva') then return; end if;
  select nullif(valor #>> '{}', '')::numeric into v_valor from config where chave = 'reserva_valor';
  select nullif(valor #>> '{}', '')::int into v_meses from config where chave = 'reserva_meta_meses';
  select valor #>> '{}' into v_base from config where chave = 'reserva_base';
  insert into metas (nome, tipo, meta_meses, base_custo, prioridade)
  values ('Reserva de emergência', 'reserva', coalesce(v_meses, 6), case when v_base = 'fixos' then 'fixos' else 'total' end, 1)
  returning id into v_id;
  if coalesce(v_valor, 0) <> 0 then
    insert into metas_movimentos (meta_id, data, tipo, valor, observacao)
    values (v_id, coalesce((select nullif(valor #>> '{}', '')::date from config where chave = 'reserva_atualizada'), current_date),
            'ajuste', v_valor, 'Saldo inicial trazido da tela Reserva');
  end if;
exception when others then
  -- config pode ter outro formato: cria a meta vazia e segue (a pessoa informa o saldo na tela).
  if v_id is null and not exists (select 1 from metas where tipo = 'reserva') then
    insert into metas (nome, tipo, meta_meses, base_custo) values ('Reserva de emergência', 'reserva', 6, 'total');
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array['metas', 'metas_movimentos']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format('create policy "usuarios logados" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
