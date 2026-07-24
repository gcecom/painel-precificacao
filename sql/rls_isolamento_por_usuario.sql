-- Isolamento de dados por usuário — rodar UMA VEZ no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New query → colar tudo → Run)
--
-- Depois disso: cada login só enxerga (select/insert/update/delete) as próprias
-- linhas. Um usuário criado no futuro não verá nenhum produto, nem mesmo o nome,
-- de outra conta.

-- 1) Tabela "products" — trava por dono
alter table public.products enable row level security;

drop policy if exists "products_select_own" on public.products;
drop policy if exists "products_insert_own" on public.products;
drop policy if exists "products_update_own" on public.products;
drop policy if exists "products_delete_own" on public.products;

create policy "products_select_own" on public.products
  for select using (auth.uid() = user_id);
create policy "products_insert_own" on public.products
  for insert with check (auth.uid() = user_id);
create policy "products_update_own" on public.products
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "products_delete_own" on public.products
  for delete using (auth.uid() = user_id);

-- 2) Nova tabela: Resultado Mensal (1 linha por produto + marketplace)
create table if not exists public.monthly_sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  platform text not null,
  product_id uuid not null,
  units numeric not null default 0,
  price numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, platform, product_id)
);

alter table public.monthly_sales enable row level security;

drop policy if exists "monthly_select_own" on public.monthly_sales;
drop policy if exists "monthly_insert_own" on public.monthly_sales;
drop policy if exists "monthly_update_own" on public.monthly_sales;
drop policy if exists "monthly_delete_own" on public.monthly_sales;

create policy "monthly_select_own" on public.monthly_sales
  for select using (auth.uid() = user_id);
create policy "monthly_insert_own" on public.monthly_sales
  for insert with check (auth.uid() = user_id);
create policy "monthly_update_own" on public.monthly_sales
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "monthly_delete_own" on public.monthly_sales
  for delete using (auth.uid() = user_id);

-- 3) Nova tabela: rótulo do mês (ex.: "Janeiro 2026"), 1 linha por marketplace
create table if not exists public.monthly_meta (
  user_id uuid not null default auth.uid(),
  platform text not null,
  label text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, platform)
);

alter table public.monthly_meta enable row level security;

drop policy if exists "meta_select_own" on public.monthly_meta;
drop policy if exists "meta_insert_own" on public.monthly_meta;
drop policy if exists "meta_update_own" on public.monthly_meta;
drop policy if exists "meta_delete_own" on public.monthly_meta;

create policy "meta_select_own" on public.monthly_meta
  for select using (auth.uid() = user_id);
create policy "meta_insert_own" on public.monthly_meta
  for insert with check (auth.uid() = user_id);
create policy "meta_update_own" on public.monthly_meta
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meta_delete_own" on public.monthly_meta
  for delete using (auth.uid() = user_id);
