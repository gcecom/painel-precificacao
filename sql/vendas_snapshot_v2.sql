-- Histórico de Vendas congelado (snapshot v2) + perfis por anúncio (Clássico/Premium)
-- Rodar UMA VEZ no SQL Editor do Supabase (Dashboard → SQL Editor → New query → Run)
--
-- PROBLEMA
--   A Precificação é uma SIMULAÇÃO do momento. Até aqui, a aba Vendas recalculava um mês
--   já salvo com a configuração de HOJE: mudar a taxa de 11% para 16% reescrevia o lucro
--   de julho. Além disso, a unicidade (user, marketplace, produto, mês) impedia lançar o
--   MESMO SKU duas vezes no mesmo mês (ex.: Clássico e Premium calculam diferente).
--
-- SOLUÇÃO
--   1) `variant`: discriminador do perfil do anúncio dentro do mês ('' = padrão).
--   2) `snapshot` (JSONB, já existente) passa a guardar TODAS as taxas do fechamento:
--      custo, tipo de anúncio, comissão % e R$, tarifa fixa/adicional, frete, imposto
--      (alíquota + base), embalagem/outros, preço, quantidade, marketplace, mês e a data
--      do snapshot. Depois de salvo, mudar Produtos/Precificação NÃO move o passado.
--
-- SEGURANÇA / NÃO DESTRUTIVO
--   * Nenhuma linha é apagada ou reescrita: só uma coluna nova (default '') e índices.
--   * Linhas antigas continuam válidas com variant='' e seguem funcionando.
--   * Linha sem snapshot continua calculando pelo cadastro atual — o painel a exibe como
--     "estimada" e NUNCA a sobrescreve sozinha (só com o botão de recálculo explícito).
--   * O passo 1 faz uma cópia de segurança antes de qualquer alteração.
--   * RLS não é afetado: as policies de monthly_sales continuam as mesmas (auth.uid()).

-- 1) BACKUP (cópia integral; só some se você mandar apagar)
create table if not exists public.monthly_sales_backup_snapshot_v2 as
  select * from public.monthly_sales;

-- 2) Coluna do perfil do anúncio. '' = padrão (todo o histórico atual entra aqui).
alter table public.monthly_sales
  add column if not exists variant text not null default '';

comment on column public.monthly_sales.variant is
  'Perfil do anúncio dentro do mês: '''' = padrão, ''classic'', ''premium'', ou rótulo livre. Permite o MESMO SKU com condições diferentes no mesmo mês.';

-- 3) Garante a coluna do snapshot (idempotente — pode já existir de historico_congelado.sql)
alter table public.monthly_sales
  add column if not exists snapshot jsonb;

comment on column public.monthly_sales.snapshot is
  'Taxas CONGELADAS no fechamento (v2): {v,at,platform,month,variant,source,price,units,cost,commissionPct,commissionRs,fixedFee,servicePct,serviceRs,unitFee,freight,packaging,returnsPct,returnsRs,taxPct,taxBase,taxRs,feeMode,fields,ch}. NULL = linha legada "estimada" (calcula pelo cadastro atual).';

-- 4) Nova unicidade INCLUINDO o perfil: é o que permite Clássico e Premium do mesmo SKU
--    no mesmo mês sem duplicar. Criada ANTES de remover a antiga.
create unique index if not exists monthly_sales_user_plat_prod_month_variant
  on public.monthly_sales (user_id, platform, product_id, month, variant);

-- 5) Remove a unicidade antiga (sem variant), que bloquearia o 2º perfil do mesmo SKU.
--    Não apaga dados — só deixa de impedir a segunda linha.
drop index if exists public.monthly_sales_user_plat_prod_month;
alter table public.monthly_sales
  drop constraint if exists monthly_sales_user_plat_prod_month;

-- 6) Busca por mês continua indexada (a unicidade nova já cobre, este é só de apoio)
create index if not exists monthly_sales_user_month
  on public.monthly_sales (user_id, month);

-- 7) CONFERÊNCIA (opcional — rode para ver o estado)
-- select
--   count(*)                                              as linhas,
--   count(*) filter (where snapshot is null)              as estimadas_sem_snapshot,
--   count(*) filter (where snapshot->>'v' = '2')          as congeladas_v2,
--   count(*) filter (where snapshot is not null
--                      and coalesce(snapshot->>'v','1') <> '2') as congeladas_v1_legado,
--   count(*) filter (where variant <> '')                 as com_perfil
-- from public.monthly_sales;

-- Conferir um mês específico (ex.: julho/2026) e a alíquota congelada em cada linha:
-- select product_id, variant, units, price,
--        snapshot->>'commissionPct' as comissao_pct,
--        snapshot->>'taxPct'        as imposto_pct,
--        snapshot->>'at'            as congelado_em
--   from public.monthly_sales
--  where month = '2026-07'
--  order by product_id, variant;

-- PARA DESFAZER (não destrutivo):
--   -- volta a unicidade antiga (só funciona se não houver 2 perfis do mesmo SKU/mês):
--   create unique index if not exists monthly_sales_user_plat_prod_month
--     on public.monthly_sales (user_id, platform, product_id, month);
--   drop index if exists public.monthly_sales_user_plat_prod_month_variant;
--   -- e, se quiser, remover a coluna nova:
--   alter table public.monthly_sales drop column if exists variant;
