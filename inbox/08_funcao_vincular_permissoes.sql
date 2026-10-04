-- Inbox 08/10 · vincula um evento a uma compra que JÁ existe (sem duplicar)
-- Preserva as duas origens: o evento aponta para a compra e a compra guarda a
-- descrição original que ainda não tinha.
create or replace function public.vincular_evento(
  p_evento uuid, p_compra uuid, p_resolvido_por text default null
) returns void language plpgsql set search_path = public as $$
declare
  e eventos_financeiros%rowtype;
begin
  select * into e from eventos_financeiros where id = p_evento for update;
  if not found then raise exception 'Evento não encontrado'; end if;
  if e.status not in ('pendente', 'aguardando_dados') then
    raise exception 'Este lançamento já foi resolvido (%)', e.status;
  end if;
  if not exists (select 1 from compras where id = p_compra) then
    raise exception 'Compra não encontrada';
  end if;
  update compras set descricao_original = coalesce(descricao_original, e.descricao_original)
    where id = p_compra;
  update eventos_financeiros set status = 'vinculado', compra_id = p_compra,
    faltando = '{}', resolvido_em = now(), resolvido_por = p_resolvido_por
    where id = e.id;
end $$;

-- Permissões: só usuário logado e servidor podem chamar as funções.
revoke all on function public.resolver_campos_evento(eventos_financeiros, jsonb) from public, anon;
revoke all on function public.confirmar_evento(uuid, jsonb, text) from public, anon;
revoke all on function public.vincular_evento(uuid, uuid, text) from public, anon;
grant execute on function public.resolver_campos_evento(eventos_financeiros, jsonb)
  to authenticated, service_role;
grant execute on function public.confirmar_evento(uuid, jsonb, text)
  to authenticated, service_role;
grant execute on function public.vincular_evento(uuid, uuid, text)
  to authenticated, service_role;
