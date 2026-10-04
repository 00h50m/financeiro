-- Sobrou! · Inbox Financeiro (camada única de entrada de lançamentos)
--
-- PROPOSTA (Etapa 2) — revisar antes de rodar. Rode no SQL Editor do Supabase.
-- Pode rodar mais de uma vez (tudo é idempotente) e é ADITIVO: não remove nem
-- altera dados existentes; só adiciona colunas com valor padrão e tabelas novas.
-- O app continua funcionando antes e depois deste script.
--
-- Fluxo:  fonte externa (Telegram, Android, CSV, ...) -> eventos_financeiros
--         -> confirmar_evento() -> compras      (ou vincular_evento() a uma compra existente)
--
-- Convenções do projeto mantidas: categoria/subcategoria/pessoa em `compras`
-- continuam texto; RLS ligado + política "usuarios logados" nas tabelas que a
-- interface usa. Tabelas sensíveis (tokens, vínculo do Telegram) são
-- acessíveis ao navegador só no que a tela precisa.
--
-- Ordem de execução: 1) pessoas  2) estabelecimentos/regras  3) compras
--                    4) eventos  5) integrações  6) funções  7) segurança

-- ============================================================
-- 1. PESSOAS — apelidos usados pelo parser ("gi", "sa")
-- Os nomes completos (Giovanna, Sabrina) já são reconhecidos pelo parser.
-- ============================================================
alter table pessoas add column if not exists apelidos text[] not null default '{}';

update pessoas set apelidos = array['gi'] where nome = 'Giovanna' and apelidos = '{}';
update pessoas set apelidos = array['sa'] where nome = 'Sabrina'  and apelidos = '{}';

-- ============================================================
-- 2. ESTABELECIMENTOS E REGRAS DE CATEGORIZAÇÃO
-- `chave` é a descrição normalizada (minúsculas, sem acento/asterisco/números),
-- calculada pelo código compartilhado (src/lib) — nunca substitui o texto original.
-- ============================================================

-- "IFOOD *IFOOD", "IFOOD.COM" -> chave 'ifood', nome de exibição 'iFood'.
create table if not exists estabelecimento_aliases (
  alias text primary key,                -- chave normalizada do texto bruto
  chave text not null,                   -- chave canônica do estabelecimento
  nome_exibicao text not null,
  created_at timestamptz not null default now()
);
create index if not exists estabelecimento_aliases_chave_idx on estabelecimento_aliases (chave);

-- Regra aprendida com o uso. `confianca` cresce com confirmações e cai com
-- rejeições (1 confirmação = 0,50 · 3 = 0,75 · 9 = 0,90).
-- `auto_confirmar` fica sempre falso por enquanto: é o gancho para, no futuro,
-- confirmar sozinho quando a confiança for alta.
create table if not exists regras_categorizacao (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_chave text not null,
  categoria text not null,
  subcategoria text not null,
  cartao_id uuid references cartoes(id) on delete set null,   -- cartão padrão (opcional)
  pessoa_id uuid references pessoas(id) on delete set null,   -- pessoa padrão (opcional)
  confirmacoes int not null default 0 check (confirmacoes >= 0),
  rejeicoes int not null default 0 check (rejeicoes >= 0),
  confianca numeric generated always as
    (confirmacoes::numeric / (confirmacoes + 2 * rejeicoes + 1)) stored,
  auto_confirmar boolean not null default false,
  ultima_utilizacao timestamptz,
  created_at timestamptz not null default now(),
  unique (estabelecimento_chave, categoria, subcategoria)
);
create index if not exists regras_categorizacao_chave_idx on regras_categorizacao (estabelecimento_chave);

-- ============================================================
-- 3. COMPRAS — como cada compra entrou no sistema (auditoria)
-- Tudo opcional / com padrão: linhas e telas atuais não mudam.
-- Compras anteriores a este script ficam com origem 'manual' (não há como
-- distinguir o que veio do CSV antigo).
-- `origem` aceita valores novos no futuro (só valida o formato).
-- ============================================================
alter table compras add column if not exists origem text not null default 'manual';
alter table compras add column if not exists descricao_original text;
alter table compras add column if not exists confirmado_por text;
alter table compras add column if not exists confirmado_em timestamptz;
alter table compras add column if not exists regra_id uuid references regras_categorizacao(id) on delete set null;
alter table compras add column if not exists confianca numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'compras_origem_formato') then
    alter table compras add constraint compras_origem_formato check (origem ~ '^[a-z][a-z0-9_]*$');
  end if;
end $$;

-- Apoia a busca de correspondência (mesmo cartão, janela de datas).
create index if not exists compras_cartao_data_idx on compras (cartao_id, data_compra);

-- ============================================================
-- 4. EVENTOS FINANCEIROS (o Inbox)
-- Uma linha por lançamento ainda não conciliado, qualquer que seja a fonte.
-- Guarda só dados estruturados: o texto bruto de uma notificação NÃO é
-- guardado (apenas, e só de apps autorizados, quando o parser não a reconhece).
--
-- status:
--   pendente          pronto para o usuário confirmar / editar / ignorar
--   aguardando_dados  falta informação obrigatória (ex.: cartão) — o bot pergunta
--   confirmado        virou uma compra nova (compra_id)
--   vinculado         ligado a uma compra que já existia (compra_id)
--   ignorado          descartado pelo usuário
-- ============================================================
create table if not exists eventos_financeiros (
  id uuid primary key default gen_random_uuid(),

  -- de onde veio e como identificar o mesmo evento de novo (idempotência)
  origem text not null check (origem ~ '^[a-z][a-z0-9_]*$'),  -- telegram | android_notification | csv | ...
  id_externo text not null,                                    -- update_id, hash da notificação, hash da linha do CSV
  app_origem text,                                             -- pacote Android / instituição (ex.: com.nu.production)
  dispositivo_id uuid,                                         -- FK adicionada na seção 5
  unique (origem, id_externo),

  -- dados do lançamento (como capturados / sugeridos)
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
  pago boolean,                                                -- só vale para compra sem cartão
  obs text,

  -- inteligência: qual regra sugeriu e com que confiança
  regra_id uuid references regras_categorizacao(id) on delete set null,
  confianca_categoria numeric check (confianca_categoria between 0 and 1),
  confianca_origem numeric check (confianca_origem between 0 and 1),   -- confiança do parser

  -- reconciliação com compras existentes
  match_compra_id uuid references compras(id) on delete set null,
  match_nivel text not null default 'nenhum' check (match_nivel in ('exato','provavel','nenhum')),
  match_score numeric check (match_score between 0 and 1),

  -- estado
  status text not null default 'pendente'
    check (status in ('pendente','aguardando_dados','confirmado','vinculado','ignorado')),
  faltando text[] not null default '{}',     -- campos a perguntar (ex.: {cartao,pessoa})
  contexto jsonb not null default '{}',      -- estado da conversa no Telegram (chat, mensagem, campo esperado)
  compra_id uuid references compras(id) on delete set null,

  -- auditoria
  capturado_em timestamptz not null default now(),
  resolvido_em timestamptz,
  resolvido_por text
);

create index if not exists eventos_status_idx on eventos_financeiros (status) where status in ('pendente','aguardando_dados');
create index if not exists eventos_chave_idx on eventos_financeiros (estabelecimento_chave);
create index if not exists eventos_compra_idx on eventos_financeiros (compra_id);

-- ============================================================
-- 5. INTEGRAÇÕES (Telegram e Android) — gravação só pelo servidor
-- ============================================================

-- Quem pode falar com o bot. Preenchida apenas pelo servidor, ao consumir um
-- código de pareamento — nunca por uma lista fixa nem pelo @usuario.
create table if not exists integracoes_telegram (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  ativo boolean not null default true,
  conectado_em timestamptz not null default now(),
  ultimo_uso timestamptz
);

-- Dispositivos Android. `token_hash` = SHA-256 do token (o token em si só é
-- mostrado uma vez, na hora do pareamento). Revogar = preencher `revogado_em`.
create table if not exists dispositivos_android (
  id uuid primary key default gen_random_uuid(),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  nome text not null,
  token_hash text not null unique,
  apps_permitidos text[] not null default '{}',   -- allowlist aplicada também no servidor
  criado_em timestamptz not null default now(),
  ultimo_uso timestamptz,
  revogado_em timestamptz
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'eventos_dispositivo_fk') then
    alter table eventos_financeiros
      add constraint eventos_dispositivo_fk foreign key (dispositivo_id)
      references dispositivos_android(id) on delete set null;
  end if;
end $$;

-- Códigos de uso único para conectar Telegram ou Android. O navegador gera o
-- código, guarda só o hash e mostra o código ao usuário; o servidor confere o
-- hash, marca como usado e cria a integração. Validade máxima de 15 minutos.
create table if not exists pareamentos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('telegram','android')),
  pessoa_id uuid not null references pessoas(id) on delete cascade,
  codigo_hash text not null unique,
  expira_em timestamptz not null default (now() + interval '10 minutes'),
  usado_em timestamptz,
  criado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (expira_em <= created_at + interval '15 minutes')
);

-- Anti-replay do webhook do Telegram (o Telegram reenvia quando a resposta falha)
-- e base do limite de requisições por usuário. Linhas antigas podem ser apagadas.
create table if not exists webhook_updates (
  update_id bigint primary key,
  telegram_user_id bigint,
  recebido_em timestamptz not null default now()
);
create index if not exists webhook_updates_usuario_idx on webhook_updates (telegram_user_id, recebido_em);

-- ============================================================
-- 6. FUNÇÕES — ponto único das regras de confirmação
-- SECURITY INVOKER (padrão): quem chama é quem tem a permissão. O navegador
-- chama como usuário logado; o servidor chama com a service role.
-- ============================================================

-- Confirma um evento criando uma compra nova. Atômica: o `for update` + a
-- checagem de status impedem duas compras se dois cliques / dispositivos
-- confirmarem ao mesmo tempo. `p_campos` permite corrigir qualquer campo
-- (valor, data_compra, descricao, categoria, subcategoria, pessoa_id,
-- cartao_id, forma_pagamento, parcelas, pago, obs).
create or replace function public.confirmar_evento(
  p_evento uuid,
  p_campos jsonb default '{}'::jsonb,
  p_resolvido_por text default null
) returns uuid
language plpgsql
set search_path = public
as $$
declare
  e eventos_financeiros%rowtype;
  v_valor numeric;
  v_data date;
  v_parcelas int;
  v_descricao text;
  v_categoria text;
  v_subcategoria text;
  v_pessoa_id uuid;
  v_pessoa text;
  v_cartao uuid;
  v_forma text;
  v_pago boolean;
  v_obs text;
  v_compra uuid;
  v_regra uuid;
begin
  select * into e from eventos_financeiros where id = p_evento for update;
  if not found then
    raise exception 'Evento não encontrado';
  end if;
  if e.status not in ('pendente', 'aguardando_dados') then
    raise exception 'Este lançamento já foi resolvido (%)', e.status;
  end if;

  v_valor        := coalesce((p_campos->>'valor')::numeric, e.valor);
  v_data         := coalesce((p_campos->>'data_compra')::date, e.data_evento);
  v_parcelas     := coalesce((p_campos->>'parcelas')::int, e.parcelas, 1);
  v_descricao    := nullif(btrim(coalesce(p_campos->>'descricao', e.descricao_original)), '');
  v_categoria    := coalesce(p_campos->>'categoria', e.categoria);
  v_subcategoria := coalesce(p_campos->>'subcategoria', e.subcategoria);
  v_pessoa_id    := coalesce((p_campos->>'pessoa_id')::uuid, e.pessoa_id);
  v_forma        := coalesce(p_campos->>'forma_pagamento', e.forma_pagamento);
  if p_campos ? 'cartao_id' then
    v_cartao := nullif(p_campos->>'cartao_id', '')::uuid;
  else
    v_cartao := e.cartao_id;
  end if;

  if v_valor is null or v_valor <= 0 then
    raise exception 'Valor inválido';
  end if;
  if v_parcelas < 1 then
    raise exception 'Número de parcelas inválido';
  end if;
  if v_descricao is null then
    raise exception 'Informe a descrição';
  end if;
  if not exists (select 1 from categorias where nome = v_categoria and v_subcategoria = any (subcategorias)) then
    raise exception 'Categoria / subcategoria inválida: % > %', v_categoria, v_subcategoria;
  end if;
  select nome into v_pessoa from pessoas where id = v_pessoa_id;
  if v_pessoa is null then
    raise exception 'Informe a pessoa';
  end if;

  -- Cartão: ou existe, ou a compra é explicitamente sem cartão (pix/dinheiro/boleto/outro).
  if v_cartao is not null then
    if not exists (select 1 from cartoes where id = v_cartao) then
      raise exception 'Cartão não encontrado';
    end if;
    v_forma := 'cartao';
    v_pago := false;                     -- compra no cartão é paga pela fatura
  else
    if v_forma is null or v_forma = 'cartao' then
      raise exception 'Informe o cartão ou a forma de pagamento (sem cartão)';
    end if;
    v_pago := coalesce((p_campos->>'pago')::boolean, e.pago);
    if v_pago is null then
      raise exception 'Informe se a compra sem cartão já foi paga';
    end if;
  end if;

  v_obs := concat_ws(' · ',
    nullif(btrim(coalesce(p_campos->>'obs', e.obs)), ''),
    case when v_cartao is null then initcap(v_forma) end);

  insert into compras (
    data_compra, descricao, categoria, subcategoria, pessoa, cartao_id,
    valor_total, parcelas, obs, pago, data_pagamento,
    origem, descricao_original, confirmado_por, confirmado_em, regra_id, confianca
  ) values (
    v_data, v_descricao, v_categoria, v_subcategoria, v_pessoa, v_cartao,
    v_valor, v_parcelas, nullif(v_obs, ''), v_pago,
    case when v_pago then (now() at time zone 'America/Sao_Paulo')::date end,
    e.origem, e.descricao_original, p_resolvido_por, now(), e.regra_id, e.confianca_categoria
  ) returning id into v_compra;

  -- Aprendizado: confirma (ou cria) a regra do estabelecimento e penaliza a
  -- que foi sugerida se o usuário escolheu outra categoria.
  if e.estabelecimento_chave is not null then
    insert into regras_categorizacao (estabelecimento_chave, categoria, subcategoria, confirmacoes, ultima_utilizacao)
    values (e.estabelecimento_chave, v_categoria, v_subcategoria, 1, now())
    on conflict (estabelecimento_chave, categoria, subcategoria)
    do update set confirmacoes = regras_categorizacao.confirmacoes + 1, ultima_utilizacao = now()
    returning id into v_regra;

    if e.regra_id is not null and e.regra_id is distinct from v_regra then
      update regras_categorizacao set rejeicoes = rejeicoes + 1 where id = e.regra_id;
    end if;
  end if;

  update eventos_financeiros set
    status = 'confirmado',
    compra_id = v_compra,
    valor = v_valor, data_evento = v_data, parcelas = v_parcelas,
    categoria = v_categoria, subcategoria = v_subcategoria,
    pessoa_id = v_pessoa_id, cartao_id = v_cartao, forma_pagamento = v_forma, pago = v_pago,
    faltando = '{}',
    resolvido_em = now(),
    resolvido_por = p_resolvido_por
  where id = e.id;

  return v_compra;
end;
$$;

-- Vincula um evento a uma compra que JÁ existe (reconciliação): não cria
-- compra nova, mas preserva as duas origens (o evento aponta para a compra e
-- a compra guarda a descrição original que ainda não tinha).
create or replace function public.vincular_evento(
  p_evento uuid,
  p_compra uuid,
  p_resolvido_por text default null
) returns void
language plpgsql
set search_path = public
as $$
declare
  e eventos_financeiros%rowtype;
begin
  select * into e from eventos_financeiros where id = p_evento for update;
  if not found then
    raise exception 'Evento não encontrado';
  end if;
  if e.status not in ('pendente', 'aguardando_dados') then
    raise exception 'Este lançamento já foi resolvido (%)', e.status;
  end if;
  if not exists (select 1 from compras where id = p_compra) then
    raise exception 'Compra não encontrada';
  end if;

  update compras set descricao_original = coalesce(descricao_original, e.descricao_original)
  where id = p_compra;

  update eventos_financeiros set
    status = 'vinculado',
    compra_id = p_compra,
    faltando = '{}',
    resolvido_em = now(),
    resolvido_por = p_resolvido_por
  where id = e.id;
end;
$$;

revoke all on function public.confirmar_evento(uuid, jsonb, text) from public, anon;
revoke all on function public.vincular_evento(uuid, uuid, text) from public, anon;
grant execute on function public.confirmar_evento(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.vincular_evento(uuid, uuid, text) to authenticated, service_role;

-- ============================================================
-- 7. SEGURANÇA (RLS e permissões)
-- Padrão do projeto: RLS ligado + "usuarios logados" nas tabelas que a
-- interface edita. Tokens e vínculo do Telegram são mais restritos. A service
-- role (usada só nas funções /api da Vercel) ignora RLS.
-- ============================================================

-- 7.1 Tabelas editadas pela interface: mesmo padrão das demais.
do $$
declare t text;
begin
  foreach t in array array['estabelecimento_aliases', 'regras_categorizacao', 'eventos_financeiros']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format(
      'create policy "usuarios logados" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- 7.2 Telegram: o navegador lê, desconecta (delete) e pausa (update); NÃO cria
-- vínculos — quem cria é o servidor, depois de validar o código de pareamento.
alter table integracoes_telegram enable row level security;
drop policy if exists "ler" on integracoes_telegram;
drop policy if exists "pausar" on integracoes_telegram;
drop policy if exists "desconectar" on integracoes_telegram;
create policy "ler" on integracoes_telegram for select to authenticated using (true);
create policy "pausar" on integracoes_telegram for update to authenticated using (true) with check (true);
create policy "desconectar" on integracoes_telegram for delete to authenticated using (true);
revoke all on integracoes_telegram from anon, authenticated;
grant select, delete on integracoes_telegram to authenticated;
grant update (ativo) on integracoes_telegram to authenticated;

-- 7.3 Android: o navegador NUNCA lê `token_hash`; só vê/edita o que a tela precisa.
alter table dispositivos_android enable row level security;
drop policy if exists "ler" on dispositivos_android;
drop policy if exists "editar" on dispositivos_android;
create policy "ler" on dispositivos_android for select to authenticated using (true);
create policy "editar" on dispositivos_android for update to authenticated using (true) with check (true);
revoke all on dispositivos_android from anon, authenticated;
grant select (id, pessoa_id, nome, apps_permitidos, criado_em, ultimo_uso, revogado_em)
  on dispositivos_android to authenticated;
grant update (apps_permitidos, revogado_em) on dispositivos_android to authenticated;

-- 7.4 Pareamentos: o navegador só INSERE (o código nasce lá); não lê nem altera.
alter table pareamentos enable row level security;
drop policy if exists "criar" on pareamentos;
create policy "criar" on pareamentos for insert to authenticated with check (true);
revoke all on pareamentos from anon, authenticated;
grant insert (tipo, pessoa_id, codigo_hash) on pareamentos to authenticated;

-- 7.5 Anti-replay: só o servidor (RLS ligado, nenhuma política).
alter table webhook_updates enable row level security;
revoke all on webhook_updates from anon, authenticated;

-- ============================================================
-- CONFERÊNCIA (todas devem aparecer com rowsecurity = true)
-- ============================================================
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('estabelecimento_aliases','regras_categorizacao','eventos_financeiros',
                    'integracoes_telegram','dispositivos_android','pareamentos','webhook_updates')
order by tablename;

-- ============================================================
-- REVERTER (só se precisar desfazer; apaga os dados do Inbox)
-- ============================================================
-- drop function if exists public.confirmar_evento(uuid, jsonb, text);
-- drop function if exists public.vincular_evento(uuid, uuid, text);
-- drop table if exists webhook_updates, pareamentos, eventos_financeiros,
--   integracoes_telegram, dispositivos_android, regras_categorizacao, estabelecimento_aliases;
-- alter table compras drop constraint if exists compras_origem_formato,
--   drop column if exists origem, drop column if exists descricao_original,
--   drop column if exists confirmado_por, drop column if exists confirmado_em,
--   drop column if exists regra_id, drop column if exists confianca;
-- alter table pessoas drop column if exists apelidos;
