-- Sobrou! · Conta fixa paga no cartão de crédito (opcional)
-- Rode no SQL Editor do Supabase. Pode rodar mais de uma vez; não altera nem apaga nada.
-- Fixo com cartão passa a contar dentro da fatura daquele cartão (em vez de conta à parte).
-- Se o cartão for excluído, o fixo volta a ser uma conta à parte (cartao_id = null).
alter table fixos add column if not exists cartao_id uuid references cartoes(id) on delete set null;
