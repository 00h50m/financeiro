-- Gi & Sabi · Sistema Financeiro
-- Schema do banco (Supabase / Postgres).
--
-- Este arquivo documenta as tabelas já existentes no projeto (reconstruídas a
-- partir do código, já que o schema original usado para criar o banco não
-- ficou salvo no repositório) e adiciona a tabela `categorias`.
--
-- Se as tabelas abaixo já existem no seu projeto Supabase, rode apenas o
-- bloco "CATEGORIAS" no SQL Editor. Se for um banco novo, rode o arquivo
-- inteiro.

-- ============================================================
-- CARTÕES
-- ============================================================
create table if not exists cartoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  titular text not null,
  fechamento int,
  vencimento int,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- COMPRAS
-- ============================================================
-- `cartao_id` é opcional: compras sem cartão (dinheiro/Pix/boleto avulso) usam
-- `pago`/`data_pagamento` para controle de pagamento individual — compras COM
-- cartão continuam sendo controladas pelo pagamento da fatura (tabela
-- `faturas`), não por esses dois campos.
create table if not exists compras (
  id uuid primary key default gen_random_uuid(),
  data_compra date not null,
  descricao text not null,
  categoria text not null,
  subcategoria text not null,
  pessoa text not null,
  cartao_id uuid references cartoes(id) on delete set null,
  valor_total numeric not null,
  parcelas int not null default 1,
  obs text,
  pago boolean not null default false,
  data_pagamento date,
  created_at timestamptz not null default now()
);

alter table compras add column if not exists pago boolean not null default false;
alter table compras add column if not exists data_pagamento date;

-- ============================================================
-- RENDAS (uma linha por mês, formato YYYY-MM)
-- ============================================================
create table if not exists rendas (
  id uuid primary key default gen_random_uuid(),
  mes text not null unique,
  giovanna numeric not null default 0,
  sabrina numeric not null default 0,
  extra_sabrina numeric not null default 0,
  mesada numeric not null default 0,
  outros numeric not null default 0,
  created_at timestamptz not null default now()
);

-- ============================================================
-- FIXOS (gastos fixos mensais)
-- `mes_fim` (YYYY-MM, opcional): último mês em que essa conta ainda conta
-- como ativa — para fixos com prazo (ex: financiamento). Null = sem fim.
-- ============================================================
create table if not exists fixos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric not null,
  pessoa text not null,
  ativo boolean not null default true,
  mes_fim text,
  created_at timestamptz not null default now()
);

alter table fixos add column if not exists mes_fim text;

-- ============================================================
-- FATURAS (valor real informado pelo banco, por cartão/mês)
-- `pago`/`data_pagamento`: controle de pagamento — a fatura é paga de uma
-- vez só, então isso cobre todas as compras/parcelas daquele cartão no mês.
-- ============================================================
create table if not exists faturas (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid references cartoes(id) on delete cascade,
  mes text not null,
  valor_real numeric not null,
  pago boolean not null default false,
  data_pagamento date,
  created_at timestamptz not null default now(),
  unique (cartao_id, mes)
);

alter table faturas add column if not exists pago boolean not null default false;
alter table faturas add column if not exists data_pagamento date;

-- ============================================================
-- CATEGORIAS
-- Uma linha por categoria; subcategorias fica como array de texto.
-- categoria/subcategoria em `compras` continuam sendo texto livre (não FK) —
-- renomear aqui atualiza os nomes nesta tabela, e a aplicação também
-- atualiza em cascata o texto já gravado em `compras` para manter os dois
-- lados consistentes.
-- ============================================================
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  subcategorias text[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into categorias (nome, subcategorias) values
  ('Casa', array['Condomínio','Energia','Manutenção','Decoração','IPTU','Outros']),
  ('Alimentação', array['Mercado','Delivery','Restaurante','Padaria','Lanche','Outros']),
  ('Transporte', array['Combustível','Estacionamento','Uber/99','Manutenção veículo','Pedágio','Outros']),
  ('Saúde', array['Farmácia','Consulta','Plano de saúde','Academia','Exame','Outros']),
  ('Vestuário', array['Roupas','Calçados','Acessórios','Outros']),
  ('Lazer', array['Viagem','Entretenimento','Presente','Bar/Balada','Hobby','Outros']),
  ('Assinaturas', array['Streaming','Apps','Anuidade cartão','Internet','Celular','Outros']),
  ('Animais', array['Ração','Veterinário','Pet shop','Medicamento','Outros']),
  ('Financeiro', array['Empréstimo','IPVA','Seguro','IOF','Outros']),
  ('Diversos', array['Outros'])
on conflict (nome) do nothing;

-- ============================================================
-- FIXOS_PAGAMENTOS (controle de pagamento dos gastos fixos, por mês)
-- `fixos` é um cadastro/template (recorrente enquanto ativo=true); esta
-- tabela guarda, por mês, se aquela conta fixa foi paga.
-- ============================================================
create table if not exists fixos_pagamentos (
  id uuid primary key default gen_random_uuid(),
  fixo_id uuid not null references fixos(id) on delete cascade,
  mes text not null,
  pago boolean not null default true,
  data_pagamento date,
  created_at timestamptz not null default now(),
  unique (fixo_id, mes)
);

-- ============================================================
-- SALDO_AJUSTES (ajuste manual do "dinheiro disponível", por mês)
-- "Dinheiro disponível" é calculado como renda do mês - já pago no mês; este
-- ajuste (pode ser positivo ou negativo) corrige esse valor calculado —
-- por exemplo para somar o saldo que sobrou de meses anteriores.
-- ============================================================
create table if not exists saldo_ajustes (
  mes text primary key,
  ajuste numeric not null default 0,
  atualizado_em timestamptz not null default now()
);

-- ============================================================
-- RLS
-- Ajuste conforme a política já usada nas outras tabelas do seu projeto.
-- Se as tabelas acima NÃO têm RLS habilitado (o app usa só a anon key, sem
-- login), deixe `categorias`, `fixos_pagamentos` e `saldo_ajustes` do mesmo
-- jeito para não quebrar o acesso. IMPORTANTE: se a tabela for criada pelo
-- Table Editor do Supabase (em vez do SQL Editor), ele habilita RLS
-- automaticamente sem nenhuma policy — isso já bloqueou o app antes. Rode
-- este bloco pelo SQL Editor e, se aparecer erro "row-level security policy"
-- em alguma tabela nova, rode (trocando o nome da tabela):
--   alter table fixos_pagamentos disable row level security;
--   alter table saldo_ajustes disable row level security;
-- ============================================================
-- alter table categorias enable row level security;
-- create policy "allow all" on categorias for all using (true) with check (true);
