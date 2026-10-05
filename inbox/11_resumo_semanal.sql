-- Inbox 11 · liga/desliga o resumo automático de domingo no Telegram (/avisos on, /avisos off)
alter table integracoes_telegram add column if not exists resumo_semanal boolean not null default false;

-- Conferência: deve aparecer uma linha com resumo_semanal.
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'integracoes_telegram' and column_name = 'resumo_semanal';
