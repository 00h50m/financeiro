-- Inbox 09/10 · RLS das tabelas que a interface usa e do Telegram
-- A service role (só nas funções /api da Vercel) ignora RLS.

-- Mesmo padrão das demais tabelas do app: só usuários logados.
do $$
declare t text;
begin
  foreach t in array array['estabelecimento_aliases', 'regras_categorizacao', 'eventos_financeiros']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format('create policy "usuarios logados" on public.%I for all to authenticated '
      || 'using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- Telegram: o navegador lê, pausa (ativo) e desconecta (delete).
-- NÃO cria vínculos: quem cria é o servidor, depois de validar o código.
alter table integracoes_telegram enable row level security;
drop policy if exists "ler" on integracoes_telegram;
drop policy if exists "pausar" on integracoes_telegram;
drop policy if exists "desconectar" on integracoes_telegram;
create policy "ler" on integracoes_telegram for select to authenticated using (true);
create policy "pausar" on integracoes_telegram for update to authenticated
  using (true) with check (true);
create policy "desconectar" on integracoes_telegram for delete to authenticated using (true);
revoke all on integracoes_telegram from anon, authenticated;
grant select, delete on integracoes_telegram to authenticated;
grant update (ativo) on integracoes_telegram to authenticated;
