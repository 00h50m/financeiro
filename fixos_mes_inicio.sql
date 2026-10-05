-- Histórico das contas fixas: permite mudar o valor "só a partir de um mês".
alter table fixos add column if not exists mes_inicio text;
