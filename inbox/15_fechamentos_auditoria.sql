-- Fase 2 · 15: fechamento mensal, foto do mês (snapshot) e auditoria financeira.
-- Repetível: pode rodar de novo sem duplicar nada.

-- Um registro por competência (mês). status 'fechado' ou 'aberto' (reaberto). A foto do mês fica
-- guardada aqui e NUNCA é recalculada: regras futuras não mudam um mês já fechado.
create table if not exists fechamentos (
  id uuid primary key default gen_random_uuid(),
  mes text not null unique,
  status text not null default 'fechado' check (status in ('fechado', 'aberto')),
  renda numeric not null default 0,            -- renda realizada
  despesas numeric not null default 0,         -- comprometido final (fixos + faturas + sem cartão)
  pago numeric not null default 0,
  pendente numeric not null default 0,
  sobra numeric not null default 0,            -- renda − despesas
  saldo_anterior numeric not null default 0,
  ajuste numeric not null default 0,
  saldo_final numeric not null default 0,      -- renda + saldo anterior + ajuste − despesas
  reserva_destinada numeric not null default 0,-- parte do saldo final separada para metas/reserva
  saldo_transportado numeric not null default 0, -- saldo_final − reserva_destinada: vira o saldo anterior do mês seguinte
  por_categoria jsonb not null default '{}'::jsonb,
  por_pessoa jsonb not null default '{}'::jsonb,
  detalhes jsonb not null default '{}'::jsonb, -- fixos, faturas, compras sem cartão, alertas aceitos
  versao_motor int not null default 1,
  fechado_por text,
  fechado_em timestamptz,
  created_at timestamptz not null default now()
);

-- Auditoria: só eventos financeiros relevantes (fechar, reabrir, editar mês fechado, ajuste de saldo,
-- aporte/retirada, restauração, lançamento automático do bot). Não é um log de tudo.
create table if not exists auditoria_financeira (
  id uuid primary key default gen_random_uuid(),
  quando timestamptz not null default now(),
  usuario text,
  entidade text not null,       -- 'fechamento', 'compra', 'saldo_ajuste', 'meta_movimento', 'backup', 'bot'...
  entidade_id text,
  acao text not null,           -- 'fechar', 'reabrir', 'editar_mes_fechado', 'ajustar', 'lancar_automatico'...
  antes jsonb,
  depois jsonb,
  motivo text
);
create index if not exists auditoria_quando_idx on auditoria_financeira (quando desc);
create index if not exists auditoria_entidade_idx on auditoria_financeira (entidade, entidade_id);

-- Fechar e reabrir acontecem numa transação só (ou faz tudo, ou não faz nada).
create or replace function fechar_mes(p_mes text, p_foto jsonb, p_usuario text)
returns uuid language plpgsql as $$
declare
  v_id uuid;
  v_atual fechamentos%rowtype;
begin
  select * into v_atual from fechamentos where mes = p_mes for update;
  if found and v_atual.status = 'fechado' then
    raise exception 'O mês % já está fechado. Reabra antes de fechar de novo.', p_mes;
  end if;

  insert into fechamentos (mes, status, renda, despesas, pago, pendente, sobra, saldo_anterior, ajuste,
                           saldo_final, reserva_destinada, saldo_transportado, por_categoria, por_pessoa,
                           detalhes, versao_motor, fechado_por, fechado_em)
  values (p_mes, 'fechado',
          coalesce((p_foto->>'renda')::numeric, 0), coalesce((p_foto->>'despesas')::numeric, 0),
          coalesce((p_foto->>'pago')::numeric, 0), coalesce((p_foto->>'pendente')::numeric, 0),
          coalesce((p_foto->>'sobra')::numeric, 0), coalesce((p_foto->>'saldo_anterior')::numeric, 0),
          coalesce((p_foto->>'ajuste')::numeric, 0), coalesce((p_foto->>'saldo_final')::numeric, 0),
          coalesce((p_foto->>'reserva_destinada')::numeric, 0), coalesce((p_foto->>'saldo_transportado')::numeric, 0),
          coalesce(p_foto->'por_categoria', '{}'::jsonb), coalesce(p_foto->'por_pessoa', '{}'::jsonb),
          coalesce(p_foto->'detalhes', '{}'::jsonb), coalesce((p_foto->>'versao_motor')::int, 1),
          p_usuario, now())
  on conflict (mes) do update set
    status = 'fechado', renda = excluded.renda, despesas = excluded.despesas, pago = excluded.pago,
    pendente = excluded.pendente, sobra = excluded.sobra, saldo_anterior = excluded.saldo_anterior,
    ajuste = excluded.ajuste, saldo_final = excluded.saldo_final, reserva_destinada = excluded.reserva_destinada,
    saldo_transportado = excluded.saldo_transportado, por_categoria = excluded.por_categoria,
    por_pessoa = excluded.por_pessoa, detalhes = excluded.detalhes, versao_motor = excluded.versao_motor,
    fechado_por = excluded.fechado_por, fechado_em = excluded.fechado_em
  returning id into v_id;

  insert into auditoria_financeira (usuario, entidade, entidade_id, acao, antes, depois)
  values (p_usuario, 'fechamento', p_mes, 'fechar',
          case when v_atual.id is null then null else to_jsonb(v_atual) end, p_foto);
  return v_id;
end $$;

create or replace function reabrir_mes(p_mes text, p_motivo text, p_usuario text)
returns uuid language plpgsql as $$
declare
  v_atual fechamentos%rowtype;
begin
  if p_motivo is null or length(trim(p_motivo)) < 3 then
    raise exception 'Informe o motivo da reabertura.';
  end if;
  select * into v_atual from fechamentos where mes = p_mes for update;
  if not found or v_atual.status <> 'fechado' then
    raise exception 'O mês % não está fechado.', p_mes;
  end if;
  -- O fechamento anterior fica inteiro na auditoria (antes). A linha passa a "aberto".
  insert into auditoria_financeira (usuario, entidade, entidade_id, acao, antes, motivo)
  values (p_usuario, 'fechamento', p_mes, 'reabrir', to_jsonb(v_atual), p_motivo);
  update fechamentos set status = 'aberto' where id = v_atual.id;
  return v_atual.id;
end $$;

-- Mesmo padrão das demais tabelas: só usuários logados.
do $$
declare t text;
begin
  foreach t in array array['fechamentos', 'auditoria_financeira']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "usuarios logados" on public.%I', t);
    execute format('create policy "usuarios logados" on public.%I for all to authenticated using (true) with check (true)', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
revoke all on function fechar_mes(text, jsonb, text) from public, anon;
revoke all on function reabrir_mes(text, text, text) from public, anon;
grant execute on function fechar_mes(text, jsonb, text) to authenticated, service_role;
grant execute on function reabrir_mes(text, text, text) to authenticated, service_role;
