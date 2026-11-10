-- Divididos: dividir só ALGUMAS parcelas de uma compra parcelada (ex.: a Mãe paga da parcela 4 até a 6).
-- Repetível: pode rodar de novo sem duplicar nem estragar nada.
-- Sem as duas colunas, a divisão continua valendo para todas as parcelas (o que já funcionava).

alter table public.divisoes add column if not exists parcela_de int;   -- primeira parcela dela (vazio = desde a 1ª)
alter table public.divisoes add column if not exists parcela_ate int;  -- última parcela dela (vazio = até a última)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'divisoes_parcelas_check') then
    alter table public.divisoes add constraint divisoes_parcelas_check check (
      (parcela_de is null or parcela_de >= 1)
      and (parcela_ate is null or parcela_ate >= 1)
      and (parcela_de is null or parcela_ate is null or parcela_ate >= parcela_de)
    );
  end if;
end $$;

comment on column public.divisoes.parcela_de is 'Compra parcelada: primeira parcela que a pessoa paga (vazio = 1ª)';
comment on column public.divisoes.parcela_ate is 'Compra parcelada: última parcela que a pessoa paga (vazio = última)';
