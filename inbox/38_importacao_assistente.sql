-- Inbox 38 · Importação de fatura, parte 3: rascunho salvo (retomada) e gravação de atualizações/movimentações. Repetível.
-- Nada é apagado nem alterado nas compras existentes além do que a pessoa confirmar na prévia.
--
--   salvar_rascunho_importacao / descartar_rascunho_importacao   o trabalho em andamento fica no lote (status 'rascunho'): dá para
--                          fechar a tela e retomar depois sem duplicar nada (a confirmação continua idempotente, pelo mesmo id).
--   aplicar_importacao v2  além de CRIAR compras, ATUALIZA o valor de compras existentes e MOVE compras de fatura, tudo na mesma
--                          transação, com controle de concorrência: se a compra mudou desde a análise, nada é gravado.
--                          Também guarda as decisões/pendências e o status de conciliação calculado pelo app.

-- Rascunho: só enquanto o lote não foi concluído. p_dados: { cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas, decisoes }
drop function if exists salvar_rascunho_importacao(uuid, jsonb, text);
create or replace function salvar_rascunho_importacao(p_importacao uuid, p_dados jsonb, p_usuario text default null)
returns jsonb language plpgsql as $fn$
declare
  v_mes text := p_dados->>'mes';
  v_cartao uuid := nullif(p_dados->>'cartao_id', '')::uuid;
  v_origem text := coalesce(nullif(p_dados->>'origem_leitura', ''), 'csv');
  v_lote importacoes_fatura%rowtype;
begin
  if p_importacao is null then raise exception 'Rascunho sem identificação.'; end if;
  if v_mes is null or v_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês da fatura inválido.'; end if;
  if v_origem not in ('csv', 'pdf') then raise exception 'Origem da leitura inválida.'; end if;
  if coalesce(length(p_dados->>'chave'), 0) < 16 then raise exception 'Rascunho sem a impressão digital do arquivo.'; end if;
  if v_cartao is not null and not exists (select 1 from cartoes where id = v_cartao) then v_cartao := null; end if;
  select * into v_lote from importacoes_fatura where id = p_importacao for update;
  if found and v_lote.status_importacao = 'concluida' then
    return jsonb_build_object('importacao_id', p_importacao, 'ignorado', true, 'motivo', 'ja_concluida');
  end if;
  insert into importacoes_fatura (id, cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas, decisoes, criado_por)
  values (p_importacao, v_cartao, v_mes, left(p_dados->>'arquivo_nome', 200), v_origem, p_dados->>'chave',
          nullif(p_dados->>'total_banco', '')::numeric, nullif(p_dados->>'total_extraido', '')::numeric,
          case when jsonb_typeof(p_dados->'linhas') = 'array' then p_dados->'linhas' else '[]'::jsonb end,
          case when jsonb_typeof(p_dados->'decisoes') = 'object' then p_dados->'decisoes' else '{}'::jsonb end, p_usuario)
  on conflict (id) do update set cartao_id = excluded.cartao_id, mes = excluded.mes, arquivo_nome = excluded.arquivo_nome, origem_leitura = excluded.origem_leitura,
    chave = excluded.chave, total_banco = excluded.total_banco, total_extraido = excluded.total_extraido, linhas = excluded.linhas, decisoes = excluded.decisoes, atualizado_em = now()
  where importacoes_fatura.status_importacao = 'rascunho';
  return jsonb_build_object('importacao_id', p_importacao, 'salvo', true);
end
$fn$;

drop function if exists descartar_rascunho_importacao(uuid);
create or replace function descartar_rascunho_importacao(p_importacao uuid)
returns jsonb language plpgsql as $fn$
begin
  delete from importacoes_fatura where id = p_importacao and status_importacao = 'rascunho';
  return jsonb_build_object('importacao_id', p_importacao, 'descartado', true);
end
$fn$;

-- p_dados: { cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas, decisoes, status_conciliacao,
--            compras: [...criar], atualizar: [{ compra_id, valor_anterior, valor_total }], mover: [{ compra_id, fatura_mes_anterior, fatura_mes }] }
-- Devolve: { importacao_id, status_importacao, status_conciliacao, criadas, atualizadas, movidas, ids, repetida?, motivo? }
drop function if exists aplicar_importacao(uuid, jsonb, text);
create or replace function aplicar_importacao(p_importacao uuid, p_dados jsonb, p_usuario text default null)
returns jsonb language plpgsql as $fn$
declare
  v_chave text := p_dados->>'chave';
  v_mes text := p_dados->>'mes';
  v_cartao uuid;
  v_origem text := coalesce(nullif(p_dados->>'origem_leitura', ''), 'csv');
  v_status_conc text := coalesce(nullif(p_dados->>'status_conciliacao', ''), 'pendente');
  v_lote importacoes_fatura%rowtype;
  v_outro importacoes_fatura%rowtype;
  v_c jsonb;
  v_n int := 0;
  v_atualizadas int := 0;
  v_movidas int := 0;
  v_id uuid;
  v_ids uuid[] := '{}';
  v_data date;
  v_valor numeric;
  v_parcelas int;
  v_cat categorias%rowtype;
  v_cartao_linha uuid;
  v_compra compras%rowtype;
  v_resultado jsonb;
  v_criar jsonb := case when jsonb_typeof(p_dados->'compras') = 'array' then p_dados->'compras' else '[]'::jsonb end;
  v_atualizar jsonb := case when jsonb_typeof(p_dados->'atualizar') = 'array' then p_dados->'atualizar' else '[]'::jsonb end;
  v_mover jsonb := case when jsonb_typeof(p_dados->'mover') = 'array' then p_dados->'mover' else '[]'::jsonb end;
begin
  if p_importacao is null then raise exception 'Importação sem identificação.'; end if;
  if v_chave is null or length(v_chave) < 16 then raise exception 'Importação sem a impressão digital do arquivo.'; end if;
  if v_mes is null or v_mes !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Mês da fatura inválido.'; end if;
  if v_origem not in ('csv', 'pdf') then raise exception 'Origem da leitura inválida.'; end if;
  if v_status_conc not in ('pendente', 'parcial', 'conciliada') then raise exception 'Status de conciliação inválido.'; end if;
  if jsonb_array_length(v_criar) + jsonb_array_length(v_atualizar) + jsonb_array_length(v_mover) = 0 then raise exception 'Não há nada para gravar.'; end if;
  if jsonb_array_length(v_criar) > 500 or jsonb_array_length(v_atualizar) > 200 or jsonb_array_length(v_mover) > 200 then raise exception 'Operações demais de uma vez.'; end if;
  v_cartao := nullif(p_dados->>'cartao_id', '')::uuid;
  if v_cartao is not null and not exists (select 1 from cartoes where id = v_cartao) then raise exception 'Cartão da fatura não encontrado.'; end if;

  insert into importacoes_fatura (id, cartao_id, mes, arquivo_nome, origem_leitura, chave, total_banco, total_extraido, linhas, criado_por)
  values (p_importacao, v_cartao, v_mes, left(p_dados->>'arquivo_nome', 200), v_origem, v_chave,
          nullif(p_dados->>'total_banco', '')::numeric, nullif(p_dados->>'total_extraido', '')::numeric,
          case when jsonb_typeof(p_dados->'linhas') = 'array' then p_dados->'linhas' else '[]'::jsonb end, p_usuario)
  on conflict (id) do nothing;
  select * into v_lote from importacoes_fatura where id = p_importacao for update;

  if v_lote.status_importacao = 'concluida' then
    return coalesce(v_lote.resultado, '{}'::jsonb) || jsonb_build_object('repetida', true, 'motivo', 'mesma_confirmacao');
  end if;
  select * into v_outro from importacoes_fatura
   where coalesce(cartao_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_cartao, '00000000-0000-0000-0000-000000000000'::uuid)
     and mes = v_mes and chave = v_chave and status_importacao = 'concluida' and id <> p_importacao limit 1;
  if found then
    delete from importacoes_fatura where id = p_importacao and status_importacao = 'rascunho';
    return coalesce(v_outro.resultado, '{}'::jsonb) || jsonb_build_object('repetida', true, 'motivo', 'mesmo_arquivo', 'concluida_em', v_outro.concluida_em);
  end if;

  -- criar compras novas
  for v_c in select * from jsonb_array_elements(v_criar) loop
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

  -- atualizar o valor de compras existentes (só se ainda estiverem como na análise)
  v_n := 0;
  for v_c in select * from jsonb_array_elements(v_atualizar) loop
    v_n := v_n + 1;
    select * into v_compra from compras where id = nullif(v_c->>'compra_id', '')::uuid for update;
    if not found then raise exception 'Atualização %: a compra não existe mais. Refaça a análise.', v_n; end if;
    begin v_valor := (v_c->>'valor_total')::numeric; exception when others then raise exception 'Atualização %: valor inválido.', v_n; end;
    if v_valor is null or v_valor = 0 or abs(v_valor) > 10000000 then raise exception 'Atualização %: valor inválido.', v_n; end if;
    if v_compra.valor_total is distinct from nullif(v_c->>'valor_anterior', '')::numeric then
      raise exception 'Atualização %: a compra "%" mudou desde a análise (está em % agora). Refaça a análise.', v_n, v_compra.descricao, v_compra.valor_total;
    end if;
    update compras set valor_total = round(v_valor, 2) where id = v_compra.id;
    insert into auditoria_financeira (usuario, entidade, entidade_id, acao, antes, depois, motivo)
    values (p_usuario, 'compra', v_compra.id::text, 'atualizar_valor_importacao', jsonb_build_object('valor_total', v_compra.valor_total), jsonb_build_object('valor_total', round(v_valor, 2)), 'Importação de fatura ' || p_importacao::text);
    v_atualizadas := v_atualizadas + 1;
  end loop;

  -- mover compras para esta fatura
  v_n := 0;
  for v_c in select * from jsonb_array_elements(v_mover) loop
    v_n := v_n + 1;
    if coalesce(v_c->>'fatura_mes', '') !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then raise exception 'Movimentação %: mês da fatura inválido.', v_n; end if;
    select * into v_compra from compras where id = nullif(v_c->>'compra_id', '')::uuid for update;
    if not found then raise exception 'Movimentação %: a compra não existe mais. Refaça a análise.', v_n; end if;
    if v_compra.fatura_mes is distinct from nullif(v_c->>'fatura_mes_anterior', '') then
      raise exception 'Movimentação %: a compra "%" mudou de fatura desde a análise. Refaça a análise.', v_n, v_compra.descricao;
    end if;
    update compras set fatura_mes = v_c->>'fatura_mes' where id = v_compra.id;
    insert into auditoria_financeira (usuario, entidade, entidade_id, acao, antes, depois, motivo)
    values (p_usuario, 'compra', v_compra.id::text, 'mover_fatura_importacao', jsonb_build_object('fatura_mes', v_compra.fatura_mes), jsonb_build_object('fatura_mes', v_c->>'fatura_mes'), 'Importação de fatura ' || p_importacao::text);
    v_movidas := v_movidas + 1;
  end loop;

  v_resultado := jsonb_build_object('importacao_id', p_importacao, 'status_importacao', 'concluida', 'status_conciliacao', v_status_conc,
                                    'criadas', jsonb_array_length(v_criar), 'atualizadas', v_atualizadas, 'movidas', v_movidas, 'ids', to_jsonb(v_ids));
  update importacoes_fatura set status_importacao = 'concluida', status_conciliacao = v_status_conc, concluida_em = now(), atualizado_em = now(), resultado = v_resultado,
    decisoes = case when jsonb_typeof(p_dados->'decisoes') = 'object' then p_dados->'decisoes' else decisoes end
  where id = p_importacao;
  insert into auditoria_financeira (usuario, entidade, entidade_id, acao, depois, motivo)
  values (p_usuario, 'importacao_fatura', p_importacao::text, 'importar', jsonb_build_object('mes', v_mes, 'criadas', jsonb_array_length(v_criar), 'atualizadas', v_atualizadas, 'movidas', v_movidas, 'origem', v_origem), 'Importação de fatura');
  return v_resultado;
exception when unique_violation then
  select * into v_outro from importacoes_fatura
   where coalesce(cartao_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(v_cartao, '00000000-0000-0000-0000-000000000000'::uuid)
     and mes = v_mes and chave = v_chave and status_importacao = 'concluida' limit 1;
  if found then
    return coalesce(v_outro.resultado, '{}'::jsonb) || jsonb_build_object('repetida', true, 'motivo', 'mesmo_arquivo', 'concluida_em', v_outro.concluida_em);
  end if;
  raise;
end
$fn$;

revoke all on function salvar_rascunho_importacao(uuid, jsonb, text), descartar_rascunho_importacao(uuid), aplicar_importacao(uuid, jsonb, text) from public, anon;
grant execute on function salvar_rascunho_importacao(uuid, jsonb, text), descartar_rascunho_importacao(uuid), aplicar_importacao(uuid, jsonb, text) to authenticated, service_role;

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
