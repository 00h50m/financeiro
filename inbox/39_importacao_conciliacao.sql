-- Inbox 39 · Importação de fatura, parte 5: conciliação posterior. Repetível.
-- Reabre um lote já importado para resolver o que ficou pendente (vincular, atualizar valor, mover de fatura, criar o que sobrou),
-- sem criar outro lote e sem duplicar: cada rodada tem um id (p_operacao) e repetir a mesma rodada devolve o mesmo resultado.
--   importacoes_fatura.conciliada_em   quando a conferência fechou (só quando o status é 'conciliada')
--   aplicar_conciliacao()              aplica as decisões da rodada numa transação só e atualiza o status de conciliação

alter table public.importacoes_fatura add column if not exists conciliada_em timestamptz;

-- Auxiliares: as mesmas validações da importação, para criar, atualizar e mover (chamados só por aplicar_conciliacao).
drop function if exists imp_criar_compras(uuid, text, jsonb);
create or replace function imp_criar_compras(p_lote uuid, p_origem text, p_criar jsonb)
returns uuid[] language plpgsql as $fn$
declare
  v_c jsonb; v_n int := 0; v_id uuid; v_ids uuid[] := '{}'; v_data date; v_valor numeric; v_parcelas int; v_cat categorias%rowtype; v_cartao uuid;
begin
  for v_c in select * from jsonb_array_elements(p_criar) loop
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
    v_cartao := nullif(v_c->>'cartao_id', '')::uuid;
    if v_cartao is null or not exists (select 1 from cartoes where id = v_cartao) then raise exception 'Lançamento %: cartão não encontrado.', v_n; end if;
    if coalesce(v_c->>'fatura_mes', '') <> '' and v_c->>'fatura_mes' !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Lançamento %: mês da fatura inválido.', v_n; end if;
    insert into compras (data_compra, descricao, descricao_original, identificacao, categoria, subcategoria, pessoa, cartao_id, valor_total, parcelas, fatura_mes, obs, origem, importacao_id)
    values (v_data, btrim(v_c->>'descricao'), left(v_c->>'descricao_original', 300), nullif(btrim(coalesce(v_c->>'identificacao', '')), ''),
            v_c->>'categoria', v_c->>'subcategoria', v_c->>'pessoa', v_cartao, round(v_valor, 2), v_parcelas, nullif(v_c->>'fatura_mes', ''), left(nullif(v_c->>'obs', ''), 500), p_origem, p_lote)
    returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  return v_ids;
end
$fn$;

drop function if exists imp_atualizar_valores(uuid, jsonb, text);
create or replace function imp_atualizar_valores(p_lote uuid, p_atualizar jsonb, p_usuario text)
returns int language plpgsql as $fn$
declare v_c jsonb; v_n int := 0; v_compra compras%rowtype; v_valor numeric; v_feitas int := 0;
begin
  for v_c in select * from jsonb_array_elements(p_atualizar) loop
    v_n := v_n + 1;
    select * into v_compra from compras where id = nullif(v_c->>'compra_id', '')::uuid for update;
    if not found then raise exception 'Atualização %: a compra não existe mais. Refaça a conferência.', v_n; end if;
    begin v_valor := (v_c->>'valor_total')::numeric; exception when others then raise exception 'Atualização %: valor inválido.', v_n; end;
    if v_valor is null or v_valor = 0 or abs(v_valor) > 10000000 then raise exception 'Atualização %: valor inválido.', v_n; end if;
    if v_compra.valor_total is distinct from nullif(v_c->>'valor_anterior', '')::numeric then
      raise exception 'Atualização %: a compra "%" mudou desde a conferência (está em % agora). Refaça a conferência.', v_n, v_compra.descricao, v_compra.valor_total;
    end if;
    update compras set valor_total = round(v_valor, 2) where id = v_compra.id;
    insert into auditoria_financeira (usuario, entidade, entidade_id, acao, antes, depois, motivo)
    values (p_usuario, 'compra', v_compra.id::text, 'atualizar_valor_importacao', jsonb_build_object('valor_total', v_compra.valor_total), jsonb_build_object('valor_total', round(v_valor, 2)), 'Conciliação da fatura ' || p_lote::text);
    v_feitas := v_feitas + 1;
  end loop;
  return v_feitas;
end
$fn$;

drop function if exists imp_mover_faturas(uuid, jsonb, text);
create or replace function imp_mover_faturas(p_lote uuid, p_mover jsonb, p_usuario text)
returns int language plpgsql as $fn$
declare v_c jsonb; v_n int := 0; v_compra compras%rowtype; v_feitas int := 0;
begin
  for v_c in select * from jsonb_array_elements(p_mover) loop
    v_n := v_n + 1;
    if coalesce(v_c->>'fatura_mes', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Movimentação %: mês da fatura inválido.', v_n; end if;
    select * into v_compra from compras where id = nullif(v_c->>'compra_id', '')::uuid for update;
    if not found then raise exception 'Movimentação %: a compra não existe mais. Refaça a conferência.', v_n; end if;
    if v_compra.fatura_mes is distinct from nullif(v_c->>'fatura_mes_anterior', '') then
      raise exception 'Movimentação %: a compra "%" mudou de fatura desde a conferência. Refaça a conferência.', v_n, v_compra.descricao;
    end if;
    update compras set fatura_mes = v_c->>'fatura_mes' where id = v_compra.id;
    insert into auditoria_financeira (usuario, entidade, entidade_id, acao, antes, depois, motivo)
    values (p_usuario, 'compra', v_compra.id::text, 'mover_fatura_importacao', jsonb_build_object('fatura_mes', v_compra.fatura_mes), jsonb_build_object('fatura_mes', v_c->>'fatura_mes'), 'Conciliação da fatura ' || p_lote::text);
    v_feitas := v_feitas + 1;
  end loop;
  return v_feitas;
end
$fn$;

-- p_dados: { status_conciliacao, decisoes, compras: [...criar], atualizar: [...], mover: [...] } (todos opcionais: dá para só salvar a conferência)
-- Devolve: { importacao_id, operacao, status_conciliacao, criadas, atualizadas, movidas, ids, repetida? }
drop function if exists aplicar_conciliacao(uuid, uuid, jsonb, text);
create or replace function aplicar_conciliacao(p_importacao uuid, p_operacao uuid, p_dados jsonb, p_usuario text default null)
returns jsonb language plpgsql as $fn$
declare
  v_lote importacoes_fatura%rowtype;
  v_status text := coalesce(nullif(p_dados->>'status_conciliacao', ''), 'pendente');
  v_criar jsonb := case when jsonb_typeof(p_dados->'compras') = 'array' then p_dados->'compras' else '[]'::jsonb end;
  v_atualizar jsonb := case when jsonb_typeof(p_dados->'atualizar') = 'array' then p_dados->'atualizar' else '[]'::jsonb end;
  v_mover jsonb := case when jsonb_typeof(p_dados->'mover') = 'array' then p_dados->'mover' else '[]'::jsonb end;
  v_ids uuid[]; v_atual int; v_mov int; v_resultado jsonb; v_decisoes jsonb; v_ops jsonb;
begin
  if p_importacao is null or p_operacao is null then raise exception 'Conciliação sem identificação.'; end if;
  if v_status not in ('pendente', 'parcial', 'conciliada') then raise exception 'Status de conciliação inválido.'; end if;
  if jsonb_array_length(v_criar) > 500 or jsonb_array_length(v_atualizar) > 200 or jsonb_array_length(v_mover) > 200 then raise exception 'Operações demais de uma vez.'; end if;
  select * into v_lote from importacoes_fatura where id = p_importacao for update;
  if not found then raise exception 'Importação não encontrada.'; end if;
  if v_lote.status_importacao <> 'concluida' then raise exception 'Esta importação ainda não foi concluída.'; end if;

  -- rodada repetida: devolve o resultado de antes, sem gravar nada
  v_ops := coalesce(v_lote.decisoes->'operacoes', '{}'::jsonb);
  if v_ops ? p_operacao::text then
    return (v_ops->p_operacao::text) || jsonb_build_object('repetida', true);
  end if;

  v_ids := imp_criar_compras(p_importacao, v_lote.origem_leitura, v_criar);
  v_atual := imp_atualizar_valores(p_importacao, v_atualizar, p_usuario);
  v_mov := imp_mover_faturas(p_importacao, v_mover, p_usuario);

  v_resultado := jsonb_build_object('importacao_id', p_importacao, 'operacao', p_operacao, 'status_conciliacao', v_status,
                                    'criadas', coalesce(array_length(v_ids, 1), 0), 'atualizadas', v_atual, 'movidas', v_mov, 'ids', to_jsonb(v_ids));
  v_decisoes := (case when jsonb_typeof(p_dados->'decisoes') = 'object' then p_dados->'decisoes' else coalesce(v_lote.decisoes, '{}'::jsonb) end)
                || jsonb_build_object('operacoes', v_ops || jsonb_build_object(p_operacao::text, v_resultado));
  update importacoes_fatura set status_conciliacao = v_status, decisoes = v_decisoes, atualizado_em = now(),
    conciliada_em = case when v_status = 'conciliada' then coalesce(conciliada_em, now()) else null end
  where id = p_importacao;
  insert into auditoria_financeira (usuario, entidade, entidade_id, acao, depois, motivo)
  values (p_usuario, 'importacao_fatura', p_importacao::text, 'conciliar', jsonb_build_object('status', v_status, 'criadas', coalesce(array_length(v_ids, 1), 0), 'atualizadas', v_atual, 'movidas', v_mov), 'Conciliação posterior da fatura');
  return v_resultado;
end
$fn$;

revoke all on function imp_criar_compras(uuid, text, jsonb), imp_atualizar_valores(uuid, jsonb, text), imp_mover_faturas(uuid, jsonb, text), aplicar_conciliacao(uuid, uuid, jsonb, text) from public, anon;
grant execute on function imp_criar_compras(uuid, text, jsonb), imp_atualizar_valores(uuid, jsonb, text), imp_mover_faturas(uuid, jsonb, text), aplicar_conciliacao(uuid, uuid, jsonb, text) to authenticated, service_role;

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
