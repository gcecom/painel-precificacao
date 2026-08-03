-- Módulo Despesas — lançamentos detalhados (tabela NOVA, independente)
-- Rodar UMA VEZ no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query -> Run)
--
-- IMPORTANTE: esta tabela NÃO substitui nem altera `monthly_expenses`.
--   * `monthly_expenses` (user_id, month) continua sendo a fonte do valor agregado de
--     "gastos gerais do mês" usado por consolida.js -> Dashboard e Financeiro.
--   * `expense_entries` guarda cada despesa individual (descrição, categoria, vencimento,
--     status, pagamento). Nesta etapa os dois convivem SEM se somar: o Financeiro segue
--     lendo só `monthly_expenses`, então não existe dupla contagem.
--   * Migração futura (ver comentário no fim do arquivo) poderá alimentar
--     `monthly_expenses.amount` a partir da soma daqui — mas isso é uma etapa separada
--     e deliberada, porque somar os dois hoje contaria a mesma despesa duas vezes.

create table if not exists public.expense_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  description text not null,
  category text not null,
  amount numeric not null check (amount > 0),
  due_date date not null,
  status text not null default 'pending' check (status in ('pending','paid')),
  paid_at date,
  recurrence text not null default 'none' check (recurrence in ('none','monthly')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- despesa paga precisa da data de pagamento (mesma regra validada no cliente)
  constraint expense_paid_needs_date check (status <> 'paid' or paid_at is not null)
);

-- Índices: a listagem filtra por usuário + período (due_date) e por usuário + status
create index if not exists expense_entries_user_idx        on public.expense_entries (user_id);
create index if not exists expense_entries_due_idx         on public.expense_entries (due_date);
create index if not exists expense_entries_user_due_idx    on public.expense_entries (user_id, due_date);
create index if not exists expense_entries_user_status_idx on public.expense_entries (user_id, status);

-- updated_at automático
create or replace function public.touch_expense_entries()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists expense_entries_touch on public.expense_entries;
create trigger expense_entries_touch
  before update on public.expense_entries
  for each row execute function public.touch_expense_entries();

-- ---------- RLS: cada usuário só enxerga o que é dele ----------
alter table public.expense_entries enable row level security;

drop policy if exists "expense_entries_select_own" on public.expense_entries;
drop policy if exists "expense_entries_insert_own" on public.expense_entries;
drop policy if exists "expense_entries_update_own" on public.expense_entries;
drop policy if exists "expense_entries_delete_own" on public.expense_entries;

create policy "expense_entries_select_own" on public.expense_entries
  for select using (auth.uid() = user_id);
create policy "expense_entries_insert_own" on public.expense_entries
  for insert with check (auth.uid() = user_id);
create policy "expense_entries_update_own" on public.expense_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "expense_entries_delete_own" on public.expense_entries
  for delete using (auth.uid() = user_id);

-- ---------- Passo futuro (NÃO executar agora) ----------
-- Quando quiser que as despesas detalhadas passem a alimentar o Financeiro/Dashboard,
-- o total por competência sai desta consulta:
--
--   select to_char(due_date,'YYYY-MM') as month, sum(amount) as amount
--     from public.expense_entries
--    where user_id = auth.uid()
--    group by 1;
--
-- A partir daí, escolher UMA única fonte para "gastos gerais" — ou o valor digitado em
-- Vendas (`monthly_expenses.amount`), ou a soma acima — e ajustar consolida.js para ler
-- só ela. Enquanto as duas existirem, somar as duas seria dupla contagem.
