-- Inbox 10/10 · RLS de Android, pareamentos e anti-replay + conferência

-- Android: o navegador NUNCA lê token_hash; só vê/edita o que a tela precisa.
alter table dispositivos_android enable row level security;
drop policy if exists "ler" on dispositivos_android;
drop policy if exists "editar" on dispositivos_android;
create policy "ler" on dispositivos_android for select to authenticated using (true);
create policy "editar" on dispositivos_android for update to authenticated
  using (true) with check (true);
revoke all on dispositivos_android from anon, authenticated;
grant select (id, pessoa_id, nome, apps_permitidos, criado_em, ultimo_uso, revogado_em)
  on dispositivos_android to authenticated;
grant update (apps_permitidos, revogado_em) on dispositivos_android to authenticated;

-- Pareamentos: o navegador só INSERE (o código nasce lá); não lê nem altera.
alter table pareamentos enable row level security;
drop policy if exists "criar" on pareamentos;
create policy "criar" on pareamentos for insert to authenticated with check (true);
revoke all on pareamentos from anon, authenticated;
grant insert (tipo, pessoa_id, codigo_hash) on pareamentos to authenticated;

-- Anti-replay: só o servidor (RLS ligado, nenhuma política).
alter table webhook_updates enable row level security;
revoke all on webhook_updates from anon, authenticated;

-- Conferência: as 7 tabelas devem aparecer com rowsecurity = true.
select tablename, rowsecurity from pg_tables
where schemaname = 'public'
  and tablename in ('estabelecimento_aliases', 'regras_categorizacao', 'eventos_financeiros',
    'integracoes_telegram', 'dispositivos_android', 'pareamentos', 'webhook_updates')
order by tablename;
