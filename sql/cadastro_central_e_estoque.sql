-- Etapas 2 e 3: cadastro central de produtos + estoque
-- Rodar UMA VEZ no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query -> Run)
--
-- Reaproveita a tabela "products" que já existe (nada de cadastro paralelo).
-- Registros antigos continuam válidos: as colunas novas têm default.

-- 1) Cadastro central: status, imagem e preço de venda padrão
alter table public.products
  add column if not exists active boolean not null default true,
  add column if not exists image_url text,
  add column if not exists default_price numeric not null default 0;

-- 2) Estoque — 1 linha por produto, isolado por usuário
create table if not exists public.stock (
  user_id uuid not null default auth.uid(),
  product_id uuid not null,
  qty numeric not null default 0,
  min_qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);

alter table public.stock enable row level security;

drop policy if exists "stock_select_own" on public.stock;
drop policy if exists "stock_insert_own" on public.stock;
drop policy if exists "stock_update_own" on public.stock;
drop policy if exists "stock_delete_own" on public.stock;

create policy "stock_select_own" on public.stock
  for select using (auth.uid() = user_id);
create policy "stock_insert_own" on public.stock
  for insert with check (auth.uid() = user_id);
create policy "stock_update_own" on public.stock
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stock_delete_own" on public.stock
  for delete using (auth.uid() = user_id);
