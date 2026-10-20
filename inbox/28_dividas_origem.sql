-- Inbox 28 · Plano de dívidas v2: de onde veio a dívida (para não importar a mesma conta duas vezes) e o saldo do começo (para mostrar o quanto já foi pago).
-- Repetível: pode rodar de novo sem estragar nada. Precisa do inbox/27_dividas.sql já executado.

alter table public.dividas add column if not exists origem text;                       -- ex.: 'fixo|<id>|2026-10' quando veio de uma conta atrasada do app
alter table public.dividas add column if not exists saldo_inicial numeric(12, 2);      -- quanto devia quando entrou no plano
create unique index if not exists dividas_origem_unica on public.dividas (origem) where origem is not null;

update public.dividas set saldo_inicial = saldo where saldo_inicial is null;
