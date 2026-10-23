-- Inbox 35 · Atendimentos, parte 2: pacotes de sessões, retornos, produtos e vendas. Repetível.
-- Valores em reais. Só precisa rodar na instalação que usa Atendimentos (perfil esteticista).
--   pacotes: a cliente compra N sessões por um valor; cada atendimento que usa o pacote tem valor 0 (a receita é a venda do pacote).
--   servicos.retorno_dias: de quantos em quantos dias a cliente costuma voltar (manutenção); gera a lista "para chamar".
--   clientes.retorno_adiado_ate: "já chamei": some da lista de retornos até essa data.
-- Inclui a atualização da função de restauração de backup (as tabelas que não existem são ignoradas).

alter table public.servicos add column if not exists retorno_dias integer check (retorno_dias is null or retorno_dias between 1 and 730);
alter table public.clientes add column if not exists retorno_adiado_ate date;

create table if not exists pacotes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references clientes(id) on delete cascade,
  nome text not null,
  servico_id uuid references servicos(id) on delete set null,
  sessoes_total integer not null check (sessoes_total between 1 and 200),
  valor numeric(12, 2) not null default 0 check (valor >= 0),
  data_venda date not null default current_date,
  validade date,
  pago boolean not null default false,
  forma_pagamento text,
  data_pagamento date,
  ativo boolean not null default true,
  observacao text,
  criado_em timestamptz not null default now()
);
create index if not exists pacotes_cliente_idx on pacotes (cliente_id);

alter table public.atendimentos add column if not exists pacote_id uuid references pacotes(id) on delete set null;

create table if not exists produtos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  preco numeric(12, 2) not null default 0 check (preco >= 0),
  custo numeric(12, 2) not null default 0 check (custo >= 0),
  estoque integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists vendas_produtos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid references produtos(id) on delete set null,
  produto_nome text not null,
  cliente_id uuid references clientes(id) on delete set null,
  data date not null default current_date,
  quantidade integer not null default 1 check (quantidade >= 1),
  valor_unit numeric(12, 2) not null default 0 check (valor_unit >= 0),
  custo_unit numeric(12, 2) not null default 0 check (custo_unit >= 0),
  pago boolean not null default true,
  forma_pagamento text,
  data_pagamento date,
  criado_em timestamptz not null default now()
);
create index if not exists vendas_produtos_data_idx on vendas_produtos (data);

alter table public.pacotes enable row level security;
alter table public.produtos enable row level security;
alter table public.vendas_produtos enable row level security;
drop policy if exists "usuarios logados" on public.pacotes;
drop policy if exists "usuarios logados" on public.produtos;
drop policy if exists "usuarios logados" on public.vendas_produtos;
create policy "usuarios logados" on public.pacotes for all to authenticated using (true) with check (true);
create policy "usuarios logados" on public.produtos for all to authenticated using (true) with check (true);
create policy "usuarios logados" on public.vendas_produtos for all to authenticated using (true) with check (true);
revoke all on public.pacotes, public.produtos, public.vendas_produtos from anon;

drop function if exists restaurar_backup(jsonb, text);
create or replace function restaurar_backup(p_tabelas jsonb, p_usuario text)
returns jsonb language plpgsql as $$
declare
  -- ordem: quem é "pai" primeiro. Chave: coluna que identifica a linha.
  v_ordem text[][] := array[
    ['pessoas','id'], ['cartoes','id'], ['categorias','id'], ['rendas','id'], ['saldo_ajustes','mes'],
    ['orcamentos','categoria'], ['config','chave'], ['fixos','id'], ['regras_categorizacao','id'],
    ['estabelecimento_aliases','alias'], ['compras','id'], ['faturas','id'], ['fixos_pagamentos','id'], ['fixos_valores','id'],
    ['compras_pagamentos','id'], ['eventos_financeiros','id'], ['fechamentos','mes'], ['metas','id'],
    ['metas_movimentos','id'], ['divisoes','id'], ['divisoes_repasses','id'],
    ['renda_sazonal','id'], ['alunos','id'], ['aulas_programacao','id'], ['aulas','id'], ['aulas_previsao_inicial','id'],
    ['aulas_fechamentos','id'], ['aulas_fechamentos_hist','id'], ['aulas_pausas','id'], ['adiamentos','id'], ['dividas','id'], ['reserva_fontes','id'], ['planos_vida','id'],
    ['clientes','id'], ['servicos','id'], ['pacotes','id'], ['atendimentos','id'], ['produtos','id'], ['vendas_produtos','id']
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
