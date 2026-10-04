-- Inbox 07/10 · confirma um evento criando a compra (atômico: o "for update" impede duas compras)
create or replace function public.confirmar_evento(
  p_evento uuid, p_campos jsonb default '{}'::jsonb, p_resolvido_por text default null
) returns uuid language plpgsql set search_path = public as $$
declare
  e eventos_financeiros%rowtype;
  r jsonb;
  v_compra uuid;
  v_regra uuid;
begin
  select * into e from eventos_financeiros where id = p_evento for update;
  if not found then raise exception 'Evento não encontrado'; end if;
  if e.status not in ('pendente', 'aguardando_dados') then
    raise exception 'Este lançamento já foi resolvido (%)', e.status;
  end if;
  r := resolver_campos_evento(e, p_campos);
  insert into compras (data_compra, descricao, categoria, subcategoria, pessoa, cartao_id,
    valor_total, parcelas, obs, pago, data_pagamento, origem, descricao_original,
    confirmado_por, confirmado_em, regra_id, confianca)
  values ((r->>'data')::date, r->>'descricao', r->>'categoria', r->>'subcategoria',
    r->>'pessoa', (r->>'cartao_id')::uuid, (r->>'valor')::numeric, (r->>'parcelas')::int,
    nullif(r->>'obs', ''), (r->>'pago')::boolean,
    case when (r->>'pago')::boolean then (now() at time zone 'America/Sao_Paulo')::date end,
    e.origem, e.descricao_original, p_resolvido_por, now(), e.regra_id, e.confianca_categoria)
  returning id into v_compra;
  -- Aprendizado: confirma a regra; penaliza a sugerida se o usuário escolheu outra.
  if e.estabelecimento_chave is not null then
    insert into regras_categorizacao (estabelecimento_chave, categoria, subcategoria,
      confirmacoes, ultima_utilizacao)
    values (e.estabelecimento_chave, r->>'categoria', r->>'subcategoria', 1, now())
    on conflict (estabelecimento_chave, categoria, subcategoria) do update
      set confirmacoes = regras_categorizacao.confirmacoes + 1, ultima_utilizacao = now()
    returning id into v_regra;
    if e.regra_id is not null and e.regra_id is distinct from v_regra then
      update regras_categorizacao set rejeicoes = rejeicoes + 1 where id = e.regra_id;
    end if;
  end if;
  update eventos_financeiros set status = 'confirmado', compra_id = v_compra,
    valor = (r->>'valor')::numeric, data_evento = (r->>'data')::date,
    parcelas = (r->>'parcelas')::int, categoria = r->>'categoria',
    subcategoria = r->>'subcategoria', pessoa_id = (r->>'pessoa_id')::uuid,
    cartao_id = (r->>'cartao_id')::uuid, forma_pagamento = r->>'forma',
    pago = (r->>'pago')::boolean, faltando = '{}', resolvido_em = now(),
    resolvido_por = p_resolvido_por
  where id = e.id;
  return v_compra;
end $$;
