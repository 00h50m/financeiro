-- 21 · Escolher a fatura de uma compra (quando o banco foge da regra do dia de fechamento).
-- fatura_mes vazio = automático (pelo fechamento do cartão); 'AAAA-MM' = a 1ª parcela cai nessa fatura.
alter table compras add column if not exists fatura_mes text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_fatura_mes_formato') then
    alter table compras add constraint compras_fatura_mes_formato check (fatura_mes is null or fatura_mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
  end if;
end $$;
