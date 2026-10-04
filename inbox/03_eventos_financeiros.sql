-- Inbox 03/10 · eventos_financeiros (o Inbox)
-- status: pendente · aguardando_dados · confirmado · vinculado · ignorado
-- Guarda só dados estruturados (nunca o texto de notificações em geral).
create table if not exists eventos_financeiros (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem ~ '^[a-z][a-z0-9_]*$'),
  id_externo text not null,
  app_origem text,
  dispositivo_id uuid,
  unique (origem, id_externo),
  valor numeric not null check (valor <> 0),
  data_evento date not null,
  parcelas int not null default 1 check (parcelas >= 1),
  descricao_original text not null,
  descricao_normalizada text,
  estabelecimento_chave text,
  forma_pagamento text check (forma_pagamento in ('cartao','pix','dinheiro','boleto','outro')),
  cartao_id uuid references cartoes(id) on delete set null,
  pessoa_id uuid references pessoas(id) on delete set null,
  categoria text,
  subcategoria text,
  pago boolean,
  obs text,
  regra_id uuid references regras_categorizacao(id) on delete set null,
  confianca_categoria numeric check (confianca_categoria between 0 and 1),
  confianca_origem numeric check (confianca_origem between 0 and 1),
  match_compra_id uuid references compras(id) on delete set null,
  match_nivel text not null default 'nenhum' check (match_nivel in ('exato','provavel','nenhum')),
  match_score numeric check (match_score between 0 and 1),
  status text not null default 'pendente'
    check (status in ('pendente','aguardando_dados','confirmado','vinculado','ignorado')),
  faltando text[] not null default '{}',
  contexto jsonb not null default '{}',
  compra_id uuid references compras(id) on delete set null,
  capturado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por text
);
create index if not exists eventos_status_idx on eventos_financeiros (status)
  where status in ('pendente','aguardando_dados');
create index if not exists eventos_chave_idx on eventos_financeiros (estabelecimento_chave);
create index if not exists eventos_compra_idx on eventos_financeiros (compra_id);
