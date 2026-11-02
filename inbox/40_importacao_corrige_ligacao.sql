-- Inbox 40 · Importação de fatura: corrige a ligação compras.importacao_id. Repetível.
-- O inbox/37 fez "add column if not exists importacao_id ... references importacoes_fatura". Se a coluna já existia no seu banco
-- (criada antes, ligada a outra tabela), a ligação nova nunca foi criada e a importação falhava com
--   23503 · violates foreign key constraint "compras_importacao_id_fkey" · Key is not present in table "importacoes".
-- Este arquivo preserva a coluna antiga (renomeada para importacao_legada_id, sem a ligação, com os dados intactos) e cria a certa.
-- Se o seu banco já está certo, não muda nada.

do $$
declare
  v_attnum smallint;
  v_con record;
  v_certa boolean := false;
begin
  select attnum into v_attnum from pg_attribute where attrelid = 'public.compras'::regclass and attname = 'importacao_id' and not attisdropped;
  if v_attnum is null then
    alter table public.compras add column importacao_id uuid references public.importacoes_fatura(id) on delete set null;
    return;
  end if;

  for v_con in
    select c.conname, c.confrelid
      from pg_constraint c
     where c.conrelid = 'public.compras'::regclass and c.contype = 'f' and c.conkey = array[v_attnum]
  loop
    if v_con.confrelid = 'public.importacoes_fatura'::regclass then
      v_certa := true;
    else
      -- ligação errada (outra tabela): preserva a coluna antiga e cria uma nova, ligada ao lote de importação
      execute format('alter table public.compras drop constraint %I', v_con.conname);
      alter table public.compras rename column importacao_id to importacao_legada_id;
      alter index if exists public.compras_importacao_idx rename to compras_importacao_legada_idx;
      alter table public.compras add column importacao_id uuid references public.importacoes_fatura(id) on delete set null;
      return;
    end if;
  end loop;

  if not v_certa then
    -- coluna sem ligação nenhuma: limpa valores que não apontam para um lote e liga
    update public.compras set importacao_id = null where importacao_id is not null and importacao_id not in (select id from public.importacoes_fatura);
    alter table public.compras add constraint compras_importacao_id_fkey foreign key (importacao_id) references public.importacoes_fatura(id) on delete set null;
  end if;
end $$;

create index if not exists compras_importacao_idx on public.compras (importacao_id) where importacao_id is not null;
