-- Inbox 06/10 · valida e junta os campos de um evento (regras de negócio)
-- Usada por confirmar_evento. Corrigir um campo = passá-lo em `c`.
create or replace function public.resolver_campos_evento(e eventos_financeiros, c jsonb)
returns jsonb language plpgsql stable set search_path = public as $$
declare
  v_valor numeric := coalesce((c->>'valor')::numeric, e.valor);
  v_parc int := coalesce((c->>'parcelas')::int, e.parcelas, 1);
  v_desc text := nullif(btrim(coalesce(c->>'descricao', e.descricao_original)), '');
  v_cat text := coalesce(c->>'categoria', e.categoria);
  v_sub text := coalesce(c->>'subcategoria', e.subcategoria);
  v_pid uuid := coalesce((c->>'pessoa_id')::uuid, e.pessoa_id);
  v_forma text := coalesce(c->>'forma_pagamento', e.forma_pagamento);
  v_cartao uuid := case when c ? 'cartao_id'
    then nullif(c->>'cartao_id', '')::uuid else e.cartao_id end;
  v_pessoa text;
  v_pago boolean;
begin
  if v_valor is null or v_valor <= 0 then raise exception 'Valor inválido'; end if;
  if v_parc < 1 then raise exception 'Número de parcelas inválido'; end if;
  if v_desc is null then raise exception 'Informe a descrição'; end if;
  if not exists (select 1 from categorias where nome = v_cat and v_sub = any (subcategorias)) then
    raise exception 'Categoria / subcategoria inválida: % > %', v_cat, v_sub;
  end if;
  select nome into v_pessoa from pessoas where id = v_pid;
  if v_pessoa is null then raise exception 'Informe a pessoa'; end if;
  if v_cartao is not null then
    if not exists (select 1 from cartoes where id = v_cartao) then
      raise exception 'Cartão não encontrado';
    end if;
    v_forma := 'cartao'; v_pago := false;  -- no cartão, quem paga é a fatura
  else
    if v_forma is null or v_forma = 'cartao' then
      raise exception 'Informe o cartão ou a forma de pagamento (sem cartão)';
    end if;
    v_pago := coalesce((c->>'pago')::boolean, e.pago);
    if v_pago is null then raise exception 'Informe se a compra sem cartão já foi paga'; end if;
  end if;
  return jsonb_build_object('valor', v_valor, 'parcelas', v_parc, 'descricao', v_desc,
    'data', coalesce((c->>'data_compra')::date, e.data_evento),
    'categoria', v_cat, 'subcategoria', v_sub, 'pessoa_id', v_pid, 'pessoa', v_pessoa,
    'cartao_id', v_cartao, 'forma', v_forma, 'pago', v_pago,
    'obs', concat_ws(' · ', nullif(btrim(coalesce(c->>'obs', e.obs)), ''),
      case when v_cartao is null then initcap(v_forma) end));
end $$;
