-- Inbox 29 · Remove a trava antiga que só aceitava as pessoas Giovanna, Sabrina e Casa.
-- Sintoma: ao salvar uma conta fixa (ou compra) com outra pessoa, o app mostra
--   'new row for relation "fixos" violates check constraint "fixos_pessoa_check"'.
-- Hoje as pessoas são cadastradas na tela Pessoas, então a trava não faz mais sentido.
-- Repetível: se a trava já não existir, não faz nada. Só mexe em travas que falam de pessoa/titular nestas tabelas.

do $$
declare r record;
begin
  for r in
    select c.conrelid::regclass::text as tabela, c.conname
      from pg_constraint c
     where c.contype = 'c'
       and c.conrelid::regclass::text in ('fixos', 'compras', 'cartoes', 'public.fixos', 'public.compras', 'public.cartoes')
       and (pg_get_constraintdef(c.oid) ilike '%pessoa%' or pg_get_constraintdef(c.oid) ilike '%titular%')
  loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
    raise notice 'removida a trava % de %', r.conname, r.tabela;
  end loop;
end $$;
