-- Inbox 12 · liga/desliga o lançamento automático no Telegram (/auto on, /auto off)
alter table integracoes_telegram add column if not exists auto_lancar boolean not null default false;

-- Conferência: deve aparecer uma linha com auto_lancar.
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'integracoes_telegram' and column_name = 'auto_lancar';
