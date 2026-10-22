-- Inbox 32 · Renda sazonal: valor digitado por mês (além da porcentagem).
-- Repetível: pode rodar de novo sem duplicar nada. Só ADICIONA uma coluna; nada é apagado nem alterado.
--   valor = quanto a fonte rende naquele mês do ano, digitado em reais. Quando existe, vale ele em vez de
--           "valor normal × fator" (o fator continua gravado como o equivalente em %). Nulo = vale o fator.

alter table public.renda_sazonal add column if not exists valor numeric check (valor is null or valor >= 0);

-- Validação: deve listar a coluna "valor".
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'renda_sazonal' and column_name = 'valor';

-- Para desfazer (os valores digitados se perdem; as porcentagens continuam):
--   alter table public.renda_sazonal drop column if exists valor;
