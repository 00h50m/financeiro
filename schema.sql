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
  created_at timestamptz not null default now()
);

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
-- ============================================================
create table if not exists fixos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric not null,
  pessoa text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- FATURAS (valor real informado pelo banco, por cartão/mês)
-- ============================================================
create table if not exists faturas (
  id uuid primary key default gen_random_uuid(),
  cartao_id uuid references cartoes(id) on delete cascade,
  mes text not null,
  valor_real numeric not null,
  created_at timestamptz not null default now(),
  unique (cartao_id, mes)
);

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
-- RLS
-- Ajuste conforme a política já usada nas outras tabelas do seu projeto.
-- Se as tabelas acima NÃO têm RLS habilitado (o app usa só a anon key, sem
-- login), deixe `categorias` do mesmo jeito para não quebrar o acesso:
-- ============================================================
-- alter table categorias enable row level security;
-- create policy "allow all" on categorias for all using (true) with check (true);
