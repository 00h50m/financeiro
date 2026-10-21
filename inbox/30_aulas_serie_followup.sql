-- Aulas particulares: série do aluno, saída prevista, motivo de encerramento e follow-up de pausas. Repetível.
alter table public.alunos add column if not exists serie text;
alter table public.alunos add column if not exists saida_prevista date;
alter table public.alunos add column if not exists motivo_encerramento text;
alter table public.aulas_pausas add column if not exists followup_feito_em date;
