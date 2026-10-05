-- Divididos: parte de uma compra ou conta fixa que é de outra pessoa (ex.: Mãe paga parte do convênio).
-- Repetível: pode rodar de novo sem duplicar nada.

create table if not exists divisoes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('compra', 'fixo')),
  ref_id uuid not null,                          -- id da compra ou da conta fixa
  pessoa text not null,                          -- quem paga a parte (ex.: Mãe)
  modo text not null default 'valor' check (modo in ('valor', 'percentual')),
  valor numeric not null check (valor >= 0),     -- R$ (compra: total da parte; fixo: por mês) ou %
  observacao text,
  criada_em timestamptz not null default now()
);
create index if not exists divisoes_ref_idx on divisoes (tipo, ref_id);

-- Um registro por mês em que a parte foi recebida. Sem registro = ainda a receber.
create table if not exists divisoes_repasses (
  id uuid primary key default gen_random_uuid(),
  divisao_id uuid not null references divisoes(id) on delete cascade,
  mes text not null,
  valor_recebido numeric not null check (valor_recebido >= 0),
  recebido_em date,
  usuario text,
  criado_em timestamptz not null default now(),
  unique (divisao_id, mes)
);

do $$
declare t text;
begin
  foreach t in array array['divisoes', 'divisoes_repasses']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format('create policy "usuarios logados" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- ---------- Restauração de backup passa a incluir Divididos ----------
-- Mesma função da 17, só com as duas tabelas novas na ordem (divisoes antes de divisoes_repasses).
drop function if exists restaurar_backup(jsonb, text);
create or replace function restaurar_backup(p_tabelas jsonb, p_usuario text)
returns jsonb language plpgsql as $$
declare
  -- ordem: quem é "pai" primeiro. Chave: coluna que identifica a linha.
  v_ordem text[][] := array[
    ['pessoas','id'], ['cartoes','id'], ['categorias','id'], ['rendas','id'], ['saldo_ajustes','mes'],
    ['orcamentos','categoria'], ['config','chave'], ['fixos','id'], ['regras_categorizacao','id'],
    ['estabelecimento_aliases','alias'], ['compras','id'], ['faturas','id'], ['fixos_pagamentos','id'],
    ['compras_pagamentos','id'], ['eventos_financeiros','id'], ['fechamentos','mes'], ['metas','id'],
    ['metas_movimentos','id'], ['divisoes','id'], ['divisoes_repasses','id']
  ];
  v_t text;
  v_pk text;
  v_cols text;
  v_sets text;
  v_dados jsonb;
  v_resumo jsonb := '{}'::jsonb;
  i int;
begin
  if p_tabelas is null or jsonb_typeof(p_tabelas) <> 'object' then
    raise exception 'Backup inválido: faltam as tabelas.';
  end if;

  -- Apagar compras apaga junto os pagamentos das parcelas: backup antigo sem eles não pode substituir.
  if p_tabelas ? 'compras' and not p_tabelas ? 'compras_pagamentos'
     and to_regclass('public.compras_pagamentos') is not null then
    raise exception 'Este backup não traz os pagamentos das parcelas (compras_pagamentos). Restaurar apagaria os pagamentos atuais.';
  end if;

  -- 1) apagar, dos filhos para os pais
  for i in reverse array_length(v_ordem, 1)..1 loop
    v_t := v_ordem[i][1]; v_pk := v_ordem[i][2];
    if p_tabelas ? v_t and to_regclass('public.' || v_t) is not null then
      v_dados := p_tabelas -> v_t;
      if jsonb_typeof(v_dados) <> 'array' then raise exception 'Tabela % inválida no backup.', v_t; end if;
      if v_t = 'pessoas' then
        -- pessoas guardam pareamentos do Telegram (apagar levaria junto): só sai quem não está no backup
        execute format('delete from public.pessoas where id::text not in (select x->>''id'' from jsonb_array_elements($1) x)') using v_dados;
      else
        execute format('delete from public.%I', v_t);
      end if;
    end if;
  end loop;

  -- 2) inserir, dos pais para os filhos (só colunas que o banco não calcula sozinho)
  for i in 1..array_length(v_ordem, 1) loop
    v_t := v_ordem[i][1]; v_pk := v_ordem[i][2];
    if p_tabelas ? v_t and to_regclass('public.' || v_t) is not null then
      v_dados := p_tabelas -> v_t;
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
             string_agg(format('%1$s = excluded.%1$s', quote_ident(column_name)), ', ' order by ordinal_position)
             filter (where column_name <> v_pk)
        into v_cols, v_sets
        from information_schema.columns
       where table_schema = 'public' and table_name = v_t and is_generated = 'NEVER';
      if jsonb_array_length(v_dados) > 0 then
        if v_t = 'pessoas' then
          execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1) on conflict (%I) do update set %s',
                         v_t, v_cols, v_cols, v_t, v_pk, v_sets) using v_dados;
        else
          execute format('insert into public.%I (%s) select %s from jsonb_populate_recordset(null::public.%I, $1)',
                         v_t, v_cols, v_cols, v_t) using v_dados;
        end if;
      end if;
      v_resumo := v_resumo || jsonb_build_object(v_t, jsonb_array_length(v_dados));
    end if;
  end loop;

  insert into auditoria_financeira (usuario, entidade, entidade_id, acao, depois, motivo)
  values (p_usuario, 'backup', 'restauracao', 'restaurar', v_resumo, 'Substituição completa pelos dados de um backup');
  return v_resumo;
end $$;

revoke all on function restaurar_backup(jsonb, text) from public, anon;
grant execute on function restaurar_backup(jsonb, text) to authenticated, service_role;
