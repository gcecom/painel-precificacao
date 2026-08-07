-- Estoque por LOCAL — 4 locais: general (físico), ml_full, amazon_full, magalu_full
-- Rodar UMA VEZ no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query -> Run).
--
-- NÃO DESTRUTIVO:
--   * a tabela `stock` (qty legado + min_qty) é PRESERVADA; o `min_qty` continua vindo dela;
--   * o estoque físico atual (`stock.qty`) é COPIADO para location='general';
--   * re-executar é seguro: `create table if not exists` + `on conflict do nothing`
--     (não sobrescreve quantidades já editadas por local).

create table if not exists public.stock_balances (
  user_id    uuid not null default auth.uid(),
  product_id uuid not null,
  location   text not null default 'general'
    check (location in ('general','ml_full','amazon_full','magalu_full')),
  qty        numeric not null default 0,
  updated_at timestamptz not null default now(),
  -- chave única por usuário + produto + local
  primary key (user_id, product_id, location)
);

create index if not exists stock_balances_user_idx      on public.stock_balances (user_id);
create index if not exists stock_balances_user_prod_idx on public.stock_balances (user_id, product_id);

-- updated_at automático (dispara também no UPDATE do upsert com merge-duplicates)
create or replace function public.touch_stock_balances()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists stock_balances_touch on public.stock_balances;
create trigger stock_balances_touch
  before update on public.stock_balances
  for each row execute function public.touch_stock_balances();

-- ---------- RLS: cada usuário só enxerga/edita o que é dele ----------
alter table public.stock_balances enable row level security;

drop policy if exists "stock_balances_select_own" on public.stock_balances;
drop policy if exists "stock_balances_insert_own" on public.stock_balances;
drop policy if exists "stock_balances_update_own" on public.stock_balances;
drop policy if exists "stock_balances_delete_own" on public.stock_balances;

create policy "stock_balances_select_own" on public.stock_balances
  for select using (auth.uid() = user_id);
create policy "stock_balances_insert_own" on public.stock_balances
  for insert with check (auth.uid() = user_id);
create policy "stock_balances_update_own" on public.stock_balances
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "stock_balances_delete_own" on public.stock_balances
  for delete using (auth.uid() = user_id);

-- ---------- Copia o estoque físico atual para 'general' (idempotente) ----------
-- `on conflict do nothing`: se a linha 'general' já existir (re-execução ou edição
-- posterior), NÃO é sobrescrita. min_qty permanece em `stock` (não é tocado aqui).
insert into public.stock_balances (user_id, product_id, location, qty, updated_at)
  select user_id, product_id, qty, 'general', coalesce(updated_at, now())
    from public.stock
  on conflict (user_id, product_id, location) do nothing;
