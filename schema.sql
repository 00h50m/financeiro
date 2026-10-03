-- Sobrou! · Sistema Financeiro
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

-- Limite do cartão (R$, opcional) — usado para mostrar quanto está comprometido.
alter table cartoes add column if not exists limite numeric;

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

-- `descricao` guarda o nome como aparece no cartão/fatura (sem o trecho
-- "Parcela x/y", que é tratado nos campos de parcelas); `identificacao` é
-- opcional e guarda o que a compra é, escrito pela usuária.
alter table compras add column if not exists identificacao text;

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
-- `dia_vencimento` (opcional): dia do mês em que a conta vence, só para
-- ajudar a priorizar pagamento — não afeta nenhum cálculo.
-- `categoria`/`subcategoria`: mesma lista usada em compras (tabela
-- `categorias`) — substitui o antigo campo `pessoa`, que não era usado em
-- nenhum cálculo (fixos entram no Dashboard sempre como bloco único).
-- `pessoa` continua na tabela por compatibilidade mas não é mais preenchido
-- pelo app.
-- ============================================================
create table if not exists fixos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  valor numeric not null,
  pessoa text,
  categoria text,
  subcategoria text,
  ativo boolean not null default true,
  mes_fim text,
  dia_vencimento int,
  created_at timestamptz not null default now()
);

alter table fixos add column if not exists mes_fim text;
alter table fixos add column if not exists dia_vencimento int;
alter table fixos add column if not exists categoria text;
alter table fixos add column if not exists subcategoria text;
alter table fixos alter column pessoa drop not null;

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
-- categoria/subcategoria em `compras`/`fixos` continuam sendo texto livre
-- (não FK) — renomear aqui atualiza os nomes nesta tabela, e a aplicação
-- também atualiza em cascata o texto já gravado em `compras` e `fixos` para
-- manter os três lados consistentes. Remover uma categoria/subcategoria que
-- já tem movimentações exige, pela UI, escolher um destino para migrar esses
-- registros antes de remover (nunca fica nada órfão).
--
-- Estrutura v2 (2026-10): reorganizada de ~10 categorias "fonte" (ex: Casa,
-- Financeiro genérico) para ~23 categorias por finalidade econômica do
-- gasto, com estabelecimento/fornecedor tratado como dimensão separada (não
-- deve virar categoria — ex: não criar categorias "iFood"/"Netflix"/
-- "Amazon"). A migração dos dados já existentes (categoria antiga → nova)
-- foi feita uma única vez diretamente no banco em produção; este INSERT é
-- só para popular um banco novo do zero.
-- ============================================================
create table if not exists categorias (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  subcategorias text[] not null default '{}',
  created_at timestamptz not null default now()
);

insert into categorias (nome, subcategorias) values
  ('Alimentação', array['Mercado','Restaurante','Delivery','Padaria','Lanche/Café','Outros']),
  ('Moradia', array['Aluguel/Financiamento','Condomínio','Energia','Água','Gás','IPTU','Manutenção/Reparos','Móveis/Eletrodomésticos','Decoração','Limpeza','Outros']),
  ('Transporte', array['Combustível','Uber/99/Táxi','Transporte público','Estacionamento','Pedágio','Manutenção/Revisão','Seguro veículo','IPVA/Licenciamento','Multas','Lavagem','Outros']),
  ('Saúde', array['Plano de saúde','Consulta','Exames','Farmácia','Odontologia','Terapia','Fisioterapia','Óculos/Lentes','Outros']),
  ('Esporte e Fitness', array['Academia','Personal','Esportes','Suplementos','Equipamentos','Eventos esportivos','Outros']),
  ('Animais', array['Ração','Veterinário','Medicamentos','Pet shop','Banho/Tosa','Acessórios','Hospedagem','Outros']),
  ('Educação', array['Escola/Faculdade','Cursos','Certificações','Livros','Material','Idiomas','Eventos/Congressos','Outros']),
  ('Vestuário', array['Roupas','Calçados','Acessórios','Bolsas/Mochilas','Outros']),
  ('Cuidados Pessoais', array['Cabeleireiro/Barbearia','Estética','Cosméticos','Higiene','Manicure','Outros']),
  ('Lazer', array['Cinema/Teatro','Shows/Eventos','Bar/Balada','Passeios','Games','Hobby','Outros']),
  ('Viagens', array['Passagens','Hospedagem','Alimentação','Transporte','Passeios','Outros']),
  ('Presentes e Comemorações', array['Presentes','Festas','Aniversários','Datas comemorativas','Outros']),
  ('Assinaturas', array['Streaming','Música','Apps/Software','Armazenamento','Games','Outros']),
  ('Comunicação', array['Internet','Celular','Outros']),
  ('Tecnologia', array['Celular','Computador','Eletrônicos','Acessórios','Manutenção','Outros']),
  ('Serviços Profissionais', array['Contabilidade','Advocacia','Despachante','Consultoria','Outros']),
  ('Financeiro', array['Juros','Tarifas bancárias','Anuidade cartão','Empréstimos','Parcelamento de dívidas','Capitalização','Outros']),
  ('Impostos e Taxas', array['Imposto de Renda','Taxas públicas','Cartório/Documentos','Outros']),
  ('Seguros', array['Vida','Residencial','Outros']),
  ('Serviços Domésticos', array['Diarista','Lavanderia','Jardinagem','Dedetização','Outros']),
  ('Doações e Ajuda', array['Doações','Ajuda familiar','Contribuições','Outros']),
  ('Profissional/Trabalho', array['Materiais','Ferramentas','Serviços','Deslocamentos','Outros']),
  ('Diversos', array['Outros'])
on conflict (nome) do nothing;

-- ============================================================
-- PESSOAS
-- Antes era uma lista fixa no código (Giovanna, Sabrina, Casa). `cor` é uma
-- das classes de badge já existentes no app (purple, blue, green, amber,
-- red, gray) — não introduz cor nova. `pessoa` em compras/fixos e `titular`
-- em cartoes continuam texto livre (não FK); renomear aqui atualiza em
-- cascata essas três tabelas.
-- ============================================================
create table if not exists pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  cor text not null default 'gray',
  created_at timestamptz not null default now()
);

insert into pessoas (nome, cor) values
  ('Giovanna', 'purple'),
  ('Sabrina', 'blue'),
  ('Casa', 'gray')
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
-- ORCAMENTOS (teto mensal por categoria) — veja também orcamentos.sql
-- `categoria` é o nome da categoria (texto, sem FK); o app mantém em sincronia
-- ao renomear/excluir categorias.
-- ============================================================
create table if not exists orcamentos (
  categoria text primary key,
  valor numeric not null check (valor >= 0),
  atualizado_em timestamptz not null default now()
);
alter table orcamentos enable row level security;
drop policy if exists "usuarios logados" on orcamentos;
create policy "usuarios logados" on orcamentos for all to authenticated using (true) with check (true);

-- ============================================================
-- CONFIG (chave/valor) — veja também config.sql
-- Usada hoje pela Reserva de emergência: reserva_valor, reserva_atualizada,
-- reserva_meta_meses, reserva_base.
-- ============================================================
create table if not exists config (
  chave text primary key,
  valor jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table config enable row level security;
drop policy if exists "usuarios logados" on config;
create policy "usuarios logados" on config for all to authenticated using (true) with check (true);

-- ============================================================
-- RLS
-- ATUAL: o app tem login (Supabase Auth) e as tabelas ficam protegidas com
-- RLS ligado + política "usuarios logados" — veja rls_login.sql. Tabelas
-- novas devem seguir o mesmo padrão (não usar mais `disable row level
-- security`). As notas abaixo são do período anterior, sem login.
--
-- Ajuste conforme a política já usada nas outras tabelas do seu projeto.
-- Se as tabelas acima NÃO têm RLS habilitado (o app usa só a anon key, sem
-- login), deixe `categorias`, `fixos_pagamentos`, `saldo_ajustes` e `pessoas`
-- do mesmo jeito para não quebrar o acesso. IMPORTANTE: se a tabela for
-- criada pelo Table Editor do Supabase (em vez do SQL Editor), ele habilita
-- RLS automaticamente sem nenhuma policy — isso já bloqueou o app antes.
-- Rode este bloco pelo SQL Editor e, se aparecer erro "row-level security
-- policy" em alguma tabela nova, rode (trocando o nome da tabela):
--   alter table pessoas disable row level security;
-- ============================================================
-- alter table categorias enable row level security;
-- create policy "allow all" on categorias for all using (true) with check (true);
