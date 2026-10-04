-- Inbox 01/10 · apelidos, aliases e regras de categorização
-- Rode as partes 01 a 10 em ordem. Cada uma pode ser repetida sem problema.
alter table pessoas add column if not exists apelidos text[] not null default '{}';
update pessoas set apelidos = array['gi'] where nome = 'Giovanna' and apelidos = '{}';
update pessoas set apelidos = array['sa'] where nome = 'Sabrina' and apelidos = '{}';

-- "IFOOD *IFOOD" e "IFOOD.COM" apontam para o mesmo estabelecimento.
create table if not exists estabelecimento_aliases (
  alias text primary key,
  chave text not null,
  nome_exibicao text not null,
  created_at timestamptz not null default now()
);
create index if not exists estabelecimento_aliases_chave_idx
  on estabelecimento_aliases (chave);

-- confianca: 1 confirmação = 0,50 · 3 = 0,75 · 9 = 0,90.
-- auto_confirmar fica falso por enquanto (gancho para o futuro).
create table if not exists regras_categorizacao (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_chave text not null,
  categoria text not null,
  subcategoria text not null,
  cartao_id uuid references cartoes(id) on delete set null,
  pessoa_id uuid references pessoas(id) on delete set null,
  confirmacoes int not null default 0 check (confirmacoes >= 0),
  rejeicoes int not null default 0 check (rejeicoes >= 0),
  confianca numeric generated always as
    (confirmacoes::numeric / (confirmacoes + 2 * rejeicoes + 1)) stored,
  auto_confirmar boolean not null default false,
  ultima_utilizacao timestamptz,
  created_at timestamptz not null default now(),
  unique (estabelecimento_chave, categoria, subcategoria)
);
create index if not exists regras_categorizacao_chave_idx
  on regras_categorizacao (estabelecimento_chave);
