-- Gi & Sabi · Financeiro
-- Proteção das tabelas: só usuários LOGADOS (Supabase Auth) leem e gravam.
--
-- ATENÇÃO — ordem:
--   1. Publique primeiro a versão do app com tela de login (já no ar na Vercel).
--   2. Só então rode este script no SQL Editor do Supabase.
-- Se rodar antes, o app antigo (sem login) deixa de carregar os dados.
--
-- Para desfazer (voltar ao acesso aberto), veja o bloco "REVERTER" no final.

do $$
declare
  t text;
begin
  foreach t in array array[
    'cartoes', 'compras', 'rendas', 'fixos', 'faturas',
    'categorias', 'pessoas', 'fixos_pagamentos', 'saldo_ajustes'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format(
      'create policy "usuarios logados" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
  end loop;
end $$;

-- Conferência: todas devem aparecer com rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('cartoes','compras','rendas','fixos','faturas','categorias','pessoas','fixos_pagamentos','saldo_ajustes')
order by tablename;

-- ============================================================
-- REVERTER (só se precisar voltar ao acesso aberto — NÃO recomendado)
-- ============================================================
-- do $$
-- declare t text;
-- begin
--   foreach t in array array['cartoes','compras','rendas','fixos','faturas','categorias','pessoas','fixos_pagamentos','saldo_ajustes']
--   loop
--     execute format('drop policy if exists "usuarios logados" on public.%I', t);
--     execute format('alter table public.%I disable row level security', t);
--   end loop;
-- end $$;
