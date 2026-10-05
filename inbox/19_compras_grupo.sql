-- Compra dividida em várias categorias (ex.: pedido do Mercado Livre).
-- Cada parte é uma linha normal de `compras`; as partes do mesmo pedido compartilham o mesmo grupo_id.
-- Repetível: pode rodar de novo sem problema. Não altera nem apaga nada que já existe.
alter table compras add column if not exists grupo_id uuid;
create index if not exists compras_grupo_idx on compras (grupo_id) where grupo_id is not null;
