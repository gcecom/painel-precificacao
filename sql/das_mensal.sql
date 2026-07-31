-- DAS pago no mês — valor OFICIAL informado pelo usuário, único por usuário+mês.
-- Reaproveita monthly_expenses (já é 1 linha por user+mês, não por marketplace).
-- Rodar UMA VEZ no SQL Editor do Supabase. Registros antigos assumem 0.
alter table public.monthly_expenses
  add column if not exists das numeric not null default 0;
