-- Fase 1 · 14: pagamento por parcela das compras SEM cartão (dinheiro, Pix, boleto).
-- Antes havia um único "pago" para a compra inteira (compras.pago). Agora cada parcela (mês) tem o seu.
-- Mesmo molde de fixos_pagamentos e faturas: uma linha por item e mês.
create table if not exists compras_pagamentos (
  id uuid primary key default gen_random_uuid(),
  compra_id uuid not null references compras(id) on delete cascade,
  mes text not null,
  pago boolean not null default true,
  data_pagamento date,
  created_at timestamptz not null default now(),
  unique (compra_id, mes)
);

alter table compras_pagamentos enable row level security;
drop policy if exists "usuarios logados" on compras_pagamentos;
create policy "usuarios logados" on compras_pagamentos for all to authenticated using (true) with check (true);
revoke all on compras_pagamentos from anon;

-- Migra o que já estava marcado: compra sem cartão com pago = true vira uma linha "paga" para cada parcela
-- (era assim que o app contava). A coluna compras.pago continua existindo e não é apagada.
-- Pode ser rodado de novo: não duplica nem altera linhas que já existem.
insert into compras_pagamentos (compra_id, mes, pago, data_pagamento)
select c.id,
       to_char(date_trunc('month', c.data_compra) + (g.i || ' months')::interval, 'YYYY-MM'),
       true,
       c.data_pagamento
from compras c
cross join lateral generate_series(0, greatest(coalesce(c.parcelas, 1), 1) - 1) as g(i)
where c.cartao_id is null and c.pago = true
on conflict (compra_id, mes) do nothing;

-- Conferência: quantas linhas foram criadas
-- select count(*) from compras_pagamentos;
