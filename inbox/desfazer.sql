-- Inbox · DESFAZER (só se precisar; apaga os dados do Inbox)
drop function if exists public.confirmar_evento(uuid, jsonb, text);
drop function if exists public.vincular_evento(uuid, uuid, text);
drop function if exists public.resolver_campos_evento(eventos_financeiros, jsonb);
drop table if exists webhook_updates, pareamentos, eventos_financeiros,
  integracoes_telegram, dispositivos_android, regras_categorizacao,
  estabelecimento_aliases;
alter table compras drop constraint if exists compras_origem_formato,
  drop column if exists origem, drop column if exists descricao_original,
  drop column if exists confirmado_por, drop column if exists confirmado_em,
  drop column if exists regra_id, drop column if exists confianca;
alter table pessoas drop column if exists apelidos;
