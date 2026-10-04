-- Inbox 02/10 · auditoria em compras (como cada compra entrou)
-- Tudo com valor padrão: as compras e telas atuais não mudam.
-- Compras antigas ficam como 'manual'.
alter table compras add column if not exists origem text not null default 'manual';
alter table compras add column if not exists descricao_original text;
alter table compras add column if not exists confirmado_por text;
alter table compras add column if not exists confirmado_em timestamptz;
alter table compras add column if not exists regra_id uuid
  references regras_categorizacao(id) on delete set null;
alter table compras add column if not exists confianca numeric;

-- Aceita origens novas no futuro: só valida o formato.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_origem_formato') then
    alter table compras add constraint compras_origem_formato
      check (origem ~ '^[a-z][a-z0-9_]*$');
  end if;
end $$;

-- Apoia a busca de correspondência (mesmo cartão, janela de datas).
create index if not exists compras_cartao_data_idx on compras (cartao_id, data_compra);
