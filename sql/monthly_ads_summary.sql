-- Resumo de Ads por marketplace + mês (ACOS e TACOS)
-- Rodar UMA VEZ no SQL Editor do Supabase
-- (Dashboard → SQL Editor → New query → colar tudo → Run)
--
-- Guarda três valores por (usuário, marketplace, mês):
--   * ads_spend      — gasto total com Ads no mês
--   * revenue_total  — faturamento total do mês (orgânico + Ads)
--   * revenue_ads    — faturamento atribuído aos Ads
--
-- É a fonte única desses três números — a aba "Avaliar Anúncio e Produto"
-- e a aba "Resultado mensal" leem e escrevem aqui, então ACOS e TACOS
-- ficam iguais nas duas telas.

create table if not exists public.monthly_ads_summary (
  user_id uuid not null default auth.uid(),
  platform text not null,
  month text not null,
  ads_spend numeric not null default 0,
  revenue_total numeric not null default 0,
  revenue_ads numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, platform, month)
);

alter table public.monthly_ads_summary enable row level security;

drop policy if exists "ads_summary_select_own" on public.monthly_ads_summary;
drop policy if exists "ads_summary_insert_own" on public.monthly_ads_summary;
drop policy if exists "ads_summary_update_own" on public.monthly_ads_summary;
drop policy if exists "ads_summary_delete_own" on public.monthly_ads_summary;

create policy "ads_summary_select_own" on public.monthly_ads_summary
  for select using (auth.uid() = user_id);
create policy "ads_summary_insert_own" on public.monthly_ads_summary
  for insert with check (auth.uid() = user_id);
create policy "ads_summary_update_own" on public.monthly_ads_summary
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "ads_summary_delete_own" on public.monthly_ads_summary
  for delete using (auth.uid() = user_id);
