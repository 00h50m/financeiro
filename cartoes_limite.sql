-- Sobrou! · Limite do cartão (opcional)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez.
alter table public.cartoes add column if not exists limite numeric;
