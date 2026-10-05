-- Fase 1 · 13: o valor real da fatura passa a ser opcional.
-- Antes, marcar uma fatura como paga obrigava a gravar um valor, e o app gravava a estimativa como se
-- fosse o valor real do banco. Agora a linha pode existir só com "pago" e o valor real continuar vazio.
alter table faturas alter column valor_real drop not null;

-- Conferência (deve mostrar is_nullable = YES):
-- select column_name, is_nullable from information_schema.columns
--  where table_name = 'faturas' and column_name = 'valor_real';
