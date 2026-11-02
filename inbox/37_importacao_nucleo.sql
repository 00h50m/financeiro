-- Inbox 37 · Importação de fatura, parte 1 (núcleo seguro): lote da importação + gravação atômica e idempotente. Repetível.
-- Nada é apagado nem alterado nas compras que já existem.
--
--   importacoes_fatura  um "lote" por importação: cartão, mês, o que foi lido do arquivo, total do banco, e dois estados DISTINTOS:
--                       status_importacao  (rascunho | concluida)      → os lançamentos escolhidos foram gravados?
--                       status_conciliacao (pendente | parcial | conciliada) → a fatura foi conferida com o banco/app?
--                       Terminar a importação NUNCA marca a conciliação como feita (começa 'pendente').
--   compras.importacao_id  de qual lote a compra veio.
--   aplicar_importacao()   grava o lote e as compras NUMA transação só, valida tudo no servidor e é idempotente:
--                          repetir a mesma confirmação (mesmo id) ou reenviar o mesmo arquivo não duplica nada.

create table if not exists importacoes_fatura (
  id uuid primary key,                                   -- gerado pelo app ao abrir o arquivo: é a chave de idempotência
  cartao_id uuid references cartoes(id) on delete set null,
  mes text not null check (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  arquivo_nome text,
  origem_leitura text not null default 'csv' check (origem_leitura in ('csv', 'pdf')),
  chave text not null,                                   -- impressão digital do conteúdo (cartão + mês + linhas): mesmo arquivo = mesma chave
  total_banco numeric,                                   -- total impresso na fatura (PDF), quando existe
  total_extraido numeric,                                -- soma das linhas lidas
  linhas jsonb not null default '[]'::jsonb,             -- linhas como foram lidas (somente leitura; base da conciliação posterior)
  decisoes jsonb not null default '{}'::jsonb,           -- decisões e pendências (usado nas próximas partes)
  resultado jsonb,                                       -- o que a gravação devolveu (repetir a confirmação devolve o mesmo resultado)
  status_importacao text not null default 'rascunho' check (status_importacao in ('rascunho', 'concluida')),
  status_conciliacao text not null default 'pendente' check (status_conciliacao in ('pendente', 'parcial', 'conciliada')),
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  concluida_em timestamptz
);
-- O mesmo conteúdo, no mesmo cartão e mês, só pode ser concluído uma vez (duas confirmações ao mesmo tempo: uma delas falha e é desfeita).
create unique index if not exists importacoes_fatura_conclusao_unica
  on importacoes_fatura ((coalesce(cartao_id, '00000000-0000-0000-0000-000000000000'::uuid)), mes, chave) where status_importacao = 'concluida';
create index if not exists importacoes_fatura_cartao_mes_idx on importacoes_fatura (cartao_id, mes);

alter table public.compras add column if not exists importacao_id uuid references importacoes_fatura(id) on delete set null;
create index if not exists compras_importacao_idx on public.compras (importacao_id) where importacao_id is not null;

alter table public.importacoes_fatura enable row level security;
drop policy if exists "usuarios logados" on public.importacoes_fatura;
create policy "usuarios logados" on public.importacoes_fatura for all to authenticated using (true) with check (true);
revoke all on public.importacoes_fatura from anon;

-- p_dados: { cartao_id, mes, arquivo_nome, origem_leitura ('csv'|'pdf'), chave, total_banco, total_extraido, linhas: [...], compras: [...] }
-- Cada compra: { data_compra, descricao, descricao_original, identificacao, categoria, subcategoria, pessoa, cartao_id, valor_total, parcelas, fatura_mes, obs }
-- Devolve: { importacao_id, status_importacao, status_conciliacao, criadas, ids, repetida?, motivo? }
drop function if exists aplicar_importacao(uuid, jsonb, text);
create or replace function aplicar_importacao(p_importacao uuid, p_dados jsonb, p_usuario text default null)
returns jsonb language plpgsql as $fn$
declare
  v_chave text := p_dados->>'chave';
  v_mes text := p_dados->>'mes';
  v_cartao uuid;
  v_origem text := coalesce(nullif(p_dados->>'origem_leitura', ''), 'csv');
  v_lote importacoes_fatura%rowtype;
  v_outro importacoes_fatura%rowtype;
  v_c jsonb;
  v_n int := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_data date;
  v_valor numeric;
  v_parcelas int;
  v_cat categorias%rowtype;
  v_cartao_linha uuid;
  v_resultado jsonb;
begin
  if p_importacao is null then raise exception 'Importação sem identificação.'; end if;
  if v_chave is null or length(v_chave) < 16 then raise exception 'Importação sem a impressão digital do arquivo.'; end if;
  if v_mes is null or v_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês da fatura inválido.'; end if;
  if v_origem not in ('csv', 'pdf') then raise exception 'Origem da leitura inválida.'; end if;
  if jsonb_typeof(p_dados->'compras') is distinct from 'array' or jsonb_array_length(p_dados->'compras') = 0 then
    raise exception 'Não há lançamentos para importar.';
  end if;
  if jsonb_array_length(p_dados->'compras') > 500 then raise exception 'Lançamentos demais de uma vez (máximo 500).'; end if;
  v_cartao := nullif(p_dados->>'cartao_id', '')::uuid;
  if v_cartao is not null and not exists (select 1 from cartoes where id = v_cartao) then raise exception 'Cartão da fatura não encontrado.'; end if;

  -- o lote: criado na primeira confirmação e travado enquanto esta transação roda (duas confirmações com o mesmo id esperam uma à outra)
  insert into importacoes_fatura (id, cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas, criado_por)
  values (p_importacao, v_cartao, v_mes, left(p_dados->>'arquivo_nome', 200), v_origem, v_chave,
          nullif(p_dados->>'total_banco', '')::numeric, nullif(p_dados->>'total_extraido', '')::numeric,
          case when jsonb_typeof(p_dados->'linhas') = 'array' then p_dados->'linhas' else '[]'::jsonb end, p_usuario)
  on conflict (id) do nothing;
  select * into v_lote from importacoes_fatura where id = p_importacao for update;

  -- 1) mesma confirmação repetida: devolve o resultado de antes, sem gravar nada
  if v_lote.status_importacao = 'concluida' then
    return coalesce(v_lote.resultado, '{}'::jsonb) || jsonb_build_object('repetida', true, 'motivo', 'mesma_confirmacao');
  end if;
  -- 2) o mesmo arquivo já foi importado por outra confirmação
  select * into v_outro from importacoes_fatura
   where coalesce(cartao_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_cartao, '00000000-0000-0000-0000-000000000000'::uuid)
     and mes = v_mes and chave = v_chave and status_importacao = 'concluida' and id <> p_importacao limit 1;
  if found then
    delete from importacoes_fatura where id = p_importacao and status_importacao = 'rascunho'; -- este envio não vira lote: não deixa rascunho sobrando
    return coalesce(v_outro.resultado, '{}'::jsonb) || jsonb_build_object('repetida', true, 'motivo', 'mesmo_arquivo', 'concluida_em', v_outro.concluida_em);
  end if;

  -- 3) valida e grava cada compra (qualquer erro desfaz o lote inteiro, inclusive as compras já gravadas)
  for v_c in select * from jsonb_array_elements(p_dados->'compras') loop
    v_n := v_n + 1;
    if coalesce(btrim(v_c->>'descricao'), '') = '' or length(v_c->>'descricao') > 300 then raise exception 'Lançamento %: descrição inválida.', v_n; end if;
    if coalesce(v_c->>'data_compra', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Lançamento %: data inválida.', v_n; end if;
    begin v_data := (v_c->>'data_compra')::date; exception when others then raise exception 'Lançamento %: data inválida.', v_n; end;
    if v_data < date '2000-01-01' or v_data > current_date + 400 then raise exception 'Lançamento %: data fora do esperado (%).', v_n, v_data; end if;
    begin v_valor := (v_c->>'valor_total')::numeric; exception when others then raise exception 'Lançamento %: valor inválido.', v_n; end;
    if v_valor is null or v_valor = 0 or abs(v_valor) > 10000000 then raise exception 'Lançamento %: valor inválido.', v_n; end if;
    begin v_parcelas := coalesce(nullif(v_c->>'parcelas', '')::int, 1); exception when others then raise exception 'Lançamento %: parcelas inválidas.', v_n; end;
    if v_parcelas < 1 or v_parcelas > 120 then raise exception 'Lançamento %: parcelas inválidas.', v_n; end if;
    select * into v_cat from categorias where nome = v_c->>'categoria';
    if not found then raise exception 'Lançamento %: categoria "%" não existe.', v_n, v_c->>'categoria'; end if;
    if not (v_c->>'subcategoria' = any (v_cat.subcategorias)) then raise exception 'Lançamento %: subcategoria "%" não existe em %.', v_n, v_c->>'subcategoria', v_cat.nome; end if;
    if not exists (select 1 from pessoas where nome = v_c->>'pessoa') then raise exception 'Lançamento %: pessoa "%" não existe.', v_n, v_c->>'pessoa'; end if;
    v_cartao_linha := nullif(v_c->>'cartao_id', '')::uuid;
    if v_cartao_linha is null or not exists (select 1 from cartoes where id = v_cartao_linha) then raise exception 'Lançamento %: cartão não encontrado.', v_n; end if;
    if coalesce(v_c->>'fatura_mes', '') <> '' and v_c->>'fatura_mes' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Lançamento %: mês da fatura inválido.', v_n; end if;

    insert into compras (data_compra, descricao, descricao_original, identificacao, categoria, subcategoria, pessoa, cartao_id, valor_total, parcelas, fatura_mes, obs, origem, importacao_id)
    values (v_data, btrim(v_c->>'descricao'), left(v_c->>'descricao_original', 300), nullif(btrim(coalesce(v_c->>'identificacao', '')), ''),
            v_c->>'categoria', v_c->>'subcategoria', v_c->>'pessoa', v_cartao_linha, round(v_valor, 2), v_parcelas,
            nullif(v_c->>'fatura_mes', ''), left(nullif(v_c->>'obs', ''), 500), v_origem, p_importacao)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;

  -- 4) conclui o lote: a importação terminou; a conciliação continua 'pendente' (quem decide é a conferência, não a gravação)
  v_resultado := jsonb_build_object('importacao_id', p_importacao, 'status_importacao', 'concluida', 'status_conciliacao', 'pendente', 'criadas', v_n, 'ids', to_jsonb(v_ids));
  update importacoes_fatura set status_importacao = 'concluida', concluida_em = now(), atualizado_em = now(), resultado = v_resultado where id = p_importacao;
  insert into auditoria_financeira (usuario, entidade, entidade_id, acao, depois, motivo)
  values (p_usuario, 'importacao_fatura', p_importacao::text, 'importar', jsonb_build_object('mes', v_mes, 'criadas', v_n, 'origem', v_origem), 'Importação de fatura');
  return v_resultado;
exception when unique_violation then
  -- duas confirmações do mesmo conteúdo ao mesmo tempo: a segunda é desfeita por inteiro e devolve o resultado da primeira
  select * into v_outro from importacoes_fatura
   where coalesce(cartao_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_cartao, '00000000-0000-0000-0000-000000000000'::uuid)
     and mes = v_mes and chave = v_chave and status_importacao = 'concluida' limit 1;
  if found then
    return coalesce(v_outro.resultado, '{}'::jsonb) || jsonb_build_object('repetida', true, 'motivo', 'mesmo_arquivo', 'concluida_em', v_outro.concluida_em);
  end if;
  raise;
end
$fn$;

revoke all on function aplicar_importacao(uuid, jsonb, text) from public, anon;
grant execute on function aplicar_importacao(uuid, jsonb, text) to authenticated, service_role;

drop function if exists restaurar_backup(jsonb, text);
create or replace function restaurar_backup(p_tabelas jsonb, p_usuario text)
returns jsonb language plpgsql as $$
declare
  -- ordem: quem é "pai" primeiro. Chave: coluna que identifica a linha.
  v_ordem text[][] := array[
    ['pessoas','id'], ['cartoes','id'], ['importacoes_fatura','id'], ['categorias','id'], ['rendas','id'], ['saldo_ajustes','mes'],
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
