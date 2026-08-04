-- Congela o histórico do Resultado Mensal (itens 1 e 2 da auditoria)
-- Rodar UMA VEZ no SQL Editor do Supabase (Dashboard -> SQL Editor -> New query -> Run)
--
-- PROBLEMA
--   monthly_sales guarda só unidades e preço. Custo, imposto e comissão eram lidos do
--   cadastro ATUAL na hora de montar o relatório, então:
--     1) mudar o custo/taxa de um produto hoje reescrevia o lucro de meses já fechados;
--     2) excluir um produto fazia as vendas antigas dele sumirem dos relatórios.
--
-- SOLUÇÃO
--   Uma coluna JSONB `snapshot` grava, no momento em que o mês é salvo, o custo e as
--   taxas usados naquele fechamento. O relatório passa a ler o snapshot quando existe.
--
-- SEGURANÇA
--   * Nada é apagado nem alterado: só uma coluna nova, que nasce NULL.
--   * Linha sem snapshot continua funcionando como hoje (cai no cadastro atual).
--   * O passo 1 cria uma cópia de segurança da tabela antes de qualquer coisa.

-- 1) BACKUP (cópia integral; some só se você mandar apagar)
create table if not exists public.monthly_sales_backup_2026_08 as
  select * from public.monthly_sales;

-- 2) Coluna nova, opcional
alter table public.monthly_sales
  add column if not exists snapshot jsonb;

comment on column public.monthly_sales.snapshot is
  'Custo e taxas congelados no fechamento: {"cost":n,"ch":{tax,taxBase,commission,feeMode,fixedFee,service,unitFee,freight,packaging,returns}}. NULL = usar cadastro atual (comportamento antigo).';

-- 3) Backfill dos meses JÁ salvos com os valores de HOJE.
--    É a melhor aproximação disponível — o valor histórico real não existe em lugar
--    nenhum. A partir daqui o histórico para de se mover.
--    Rode só se quiser congelar o passado agora; pode ser executado depois.
update public.monthly_sales ms
   set snapshot = jsonb_build_object(
         'cost', coalesce(p.cost,0),
         'ch',   coalesce(p.channels -> ms.platform, '{}'::jsonb)
       )
  from public.products p
 where p.id = ms.product_id
   and ms.snapshot is null;

-- 4) Conferência
-- select count(*) filter (where snapshot is null) as sem_snapshot,
--        count(*) filter (where snapshot is not null) as congeladas
--   from public.monthly_sales;

-- Para desfazer (não destrutivo):
--   update public.monthly_sales set snapshot = null;
--   -- e, se quiser remover a coluna:  alter table public.monthly_sales drop column snapshot;
