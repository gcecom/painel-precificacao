-- Resultado Mensal por MÊS + gasto de Ads por venda + gastos gerais do negócio
-- Rodar UMA VEZ no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New query → colar tudo → Run)
--
-- O que muda:
--   * cada lançamento passa a ficar guardado por mês (dá para consultar meses anteriores)
--   * cada produto ganha o campo "Ads por venda" (quanto foi gasto de anúncio por venda)
--   * novo lugar para os gastos gerais do mês (valor único do negócio, não por marketplace)
--
-- Os lançamentos que já existem hoje são preservados e ficam atribuídos ao mês atual.

-- 1) monthly_sales: um lançamento por produto POR MÊS, com o gasto de Ads por venda
alter table public.monthly_sales
  add column if not exists month text not null default to_char(now(), 'YYYY-MM'),
  add column if not exists ads_unit numeric not null default 0;

-- A unicidade antiga (sem o mês) impediria lançar o mesmo produto em meses diferentes
alter table public.monthly_sales
  drop constraint if exists monthly_sales_user_id_platform_product_id_key;

create unique index if not exists monthly_sales_user_plat_prod_month
  on public.monthly_sales (user_id, platform, product_id, month);

-- 2) Gastos gerais do mês — valor ÚNICO do negócio (vale para todos os marketplaces)
create table if not exists public.monthly_expenses (
  user_id uuid not null default auth.uid(),
  month text not null,
  amount numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.monthly_expenses enable row level security;

drop policy if exists "expenses_select_own" on public.monthly_expenses;
drop policy if exists "expenses_insert_own" on public.monthly_expenses;
drop policy if exists "expenses_update_own" on public.monthly_expenses;
drop policy if exists "expenses_delete_own" on public.monthly_expenses;

create policy "expenses_select_own" on public.monthly_expenses
  for select using (auth.uid() = user_id);
create policy "expenses_insert_own" on public.monthly_expenses
  for insert with check (auth.uid() = user_id);
create policy "expenses_update_own" on public.monthly_expenses
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expenses_delete_own" on public.monthly_expenses
  for delete using (auth.uid() = user_id);
