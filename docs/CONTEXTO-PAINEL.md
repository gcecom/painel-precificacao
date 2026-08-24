# Contexto do Painel FULL Ecommerce

Documento único de referência do sistema. Consulte **apenas a seção necessária**; ao
concluir uma alteração, atualize **apenas a seção afetada**.

Última atualização: 2026-08-24 · commit `974536e`.

---

## 1. Stack e deploy

- **Frontend:** HTML/CSS/JS puro. Sem framework, sem bundler, **sem build step**.
  SPA de arquivo único (`index.html`) que mostra/esconde views; navegação client-side,
  sem roteamento por URL.
- **Banco/Auth:** Supabase (Postgres + Auth REST via `fetch` direto, sem SDK).
- **Deploy:** GitHub `gcecom/painel-precificacao` → Vercel, automático a cada push na `main`.
- **URL:** https://painel-precificacao-e2pj.vercel.app
- **Assistente:** interno, 100% no navegador, somente leitura, sem API externa.

### Cache busting

Todo `<script>`/`<link>` no `index.html` tem `?v=N`. **Ao editar qualquer `.js`/`.css`,
incremente N em todos.** Versão atual: **`v=84`**.

---

## 2. Páginas e arquivos principais

10 módulos no menu lateral. O seletor **Canal** só aparece onde depende de marketplace.

| Módulo | View | Canal? |
|---|---|---|
| Início | `inicioView` | Não |
| Dashboard Geral | `dashboardView` | Não (consolida tudo) |
| Produtos | `produtosView` | Não |
| Estoque | `estoqueView` | Não |
| Vendas (Resultado mensal) | `monthlyView` | **Sim** |
| Precificação | `pricingView` | **Sim** |
| Anúncios | `performanceView` | **Sim** |
| Financeiro | `financeiroView` | Não |
| Despesas | `despesasView` | Não |
| Configurações | `configView` | Não |

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura de todas as views + ordem dos scripts. |
| `styles.css` | Todo o CSS. Temas claro/escuro via `data-theme`. |
| `supabase.js` | Cliente REST minimalista: auth + todos os métodos de dados. |
| `app.js` | Núcleo: `PLATFORMS`, motor (`calcAt`, `effCost`, `channelDefaults`), auth, tema, aba Precificação. |
| `nav.js` | Navegação por módulos, seletor de Canal. Expõe `window.navigateTo`. |
| `produtos.js` | Cadastro central + links de anúncio por marketplace. |
| `estoque.js` | Estoque por local. Expõe `window.stockSnapshot`. |
| `performance.js` | Abas **Anúncios** e **Vendas**; motor `unitCosts`; snapshots. Expõe `PainelShared`, `PainelVendas`. ~1.400 linhas — leia por faixa. |
| `consolida.js` | Consolidação única + despesas por competência. Expõe `PainelConsolida`. |
| `dashboard.js` | Dashboard Geral (cards, gráficos SVG, tabelas). |
| `inicio.js` | Página Início. |
| `financeiro.js` | DRE simplificada. |
| `despesas.js` | Lançamentos detalhados (`expense_entries`). |
| `daterange.js` | Seletores de período e de mês. |
| `planilha.js` | Modelo e importação de planilha de vendas. |
| `tiny.js` | Importação de inventário padrão Tiny/Olist. |
| `assistente.js` | Assistente interno, somente leitura. |
| `sql/` | Migrations, coladas à mão no SQL Editor do Supabase. |
| `tests/` | Testes rodados no navegador. |

**Ordem de carregamento:** `supabase.js` → `app.js` → `performance.js` → `nav.js` →
`produtos.js` → `estoque.js` → `consolida.js` → `dashboard.js` → `financeiro.js` →
`daterange.js` → `inicio.js` → `planilha.js` → `tiny.js` → `despesas.js` → `assistente.js`.
Também carrega `xlsx.full.min.js` (CDN SheetJS).

---

## 3. Tabelas Supabase

Todas com **RLS** (`auth.uid() = user_id`) para select/insert/update/delete. Cada
requisição manda o **JWT do usuário** como Bearer — é o que permite ao RLS filtrar.
`month` é sempre texto `"YYYY-MM"`.

| Tabela | Chave | Guarda |
|---|---|---|
| `products` | `id` (uuid) | nome, SKU, categoria, `cost`, `default_price`, `image_url`, `active`, `channels` (JSONB por marketplace: preço, comissão, taxas, `ad_url`, `ad_id`…) |
| `stock` | `(user_id, product_id)` | `qty`, `min_qty` |
| `stock_balances` | `(user_id, product_id, location)` | `qty` por local |
| `monthly_sales` | `(user_id, platform, product_id, month, variant)` | `units`, `price`, `ads_unit`, `variant`, `snapshot` (JSONB congelado) |
| `monthly_expenses` | `(user_id, month)` | `amount` (gastos gerais), `das` (DAS pago) |
| `monthly_ads_summary` | `(user_id, platform, month)` | `ads_spend`, `revenue_total`, `revenue_ads` |
| `expense_entries` | `id` (uuid) | `description`, `category`, `amount`, `due_date`, `status`, `paid_at`, `recurrence`, `notes` |

### Migrations em `sql/` — rodar uma vez cada

`rls_isolamento_por_usuario.sql` · `resultado_mensal_por_mes.sql` · `monthly_ads_summary.sql` ·
`cadastro_central_e_estoque.sql` · `das_mensal.sql` · `despesas_detalhadas.sql` ·
`estoque_locais.sql` · **`vendas_snapshot_v2.sql`**.

> `historico_congelado.sql` ficou **obsoleto**: nunca chegou a rodar em produção e o
> `vendas_snapshot_v2.sql` já cria a coluna `snapshot` (`if not exists`). Não é preciso
> rodá-lo.

Estado verificado em 2026-08-24: todas aplicadas.

---

## 4. Regras financeiras

### Por venda — `calcAt` (`app.js`) e `unitCosts` (`performance.js`)

De preço, custo e taxas do canal saem comissão, tarifas, imposto, frete, devoluções e o
lucro **antes dos Ads** (`beforeAds`). O custo é `effCost`: custo do canal → custo central
de Produtos → 0. `unitCosts` zera o custo do canal, então **Vendas e Dashboard usam sempre
o custo central**.

### Consolidação mensal — `PainelConsolida.consolidar` (`consolida.js`)

Fonte única de Dashboard, Início e Financeiro. Garante num só lugar:

- período exato; sem registro duplicado por `user|marketplace|produto|mês|perfil`;
- **Ads:** 1 valor por `marketplace|mês`, rateado por faturamento e descontado **uma vez**;
- **gastos gerais:** 1 valor por mês, nunca por marketplace; com filtro ativo ficam fora do
  líquido do recorte (continuam exibidos);
- produto excluído do cadastro **não** apaga a venda antiga (usa o snapshot).

### Fórmula

```
Lucro operacional = receita − comissões − tarifas − frete − imposto − custo
Lucro após Ads    = operacional − Ads do mês
Lucro líquido     = operacional − Ads − gastos gerais   (Dashboard/Início/Financeiro)
Margem líquida    = líquido ÷ faturamento
TACOS             = Ads ÷ faturamento total
```

Denominador zero → exibe `—`, nunca `NaN`/`Infinity`.

---

## 5. Despesas e recorrências

Fonte: `expense_entries` (não usa `monthly_expenses`). `despesasPorCompetencia` em
`consolida.js` aplica **regime de competência**:

- `recurrence='none'` → conta só no mês do `due_date`;
- `recurrence='monthly'` → conta no mês do 1º vencimento e em **todos** os seguintes, uma
  vez por competência;
- inclui qualquer `status` (`pending` ou `paid`; "vencida" é derivada de `pending`);
- respeita término/cancelamento se houver (`end_date`/`ends_at`/`canceled_at`);
- nunca cria registros futuros: soma apenas dentro dos meses pedidos.

`status='paid'` exige `paid_at` (constraint no banco). A aba tem filtro por **mês de
competência** (MM/AAAA).

---

## 6. Impostos

- O imposto por venda (`taxPct` sobre `taxBase`: `gross` ou `net`) **já está dentro do
  lucro operacional**.
- **DAS calculado** = faturamento × taxa, somado por venda (`total.tax`).
- **DAS pago** (`monthly_expenses.das`) é o valor oficial informado no Dashboard. É
  **exibido, nunca descontado de novo** — evita dupla contagem.
- Salvar o mês em Vendas **omite** a coluna `das` do upsert, preservando o valor informado.

---

## 7. Snapshots históricos de vendas

**Precificação é simulação do momento.** Ao salvar ou importar, cada linha de
`monthly_sales` grava um `snapshot` JSONB (`v:2`) com: custo, tipo de anúncio, comissão
(% e R$), tarifa fixa e adicional, frete, imposto (alíquota + base), embalagem,
devoluções, preço, quantidade, marketplace, mês e `at` (data do congelamento).

### Imutabilidade

- Linha que **já tem** snapshot tem a coluna **omitida** do upsert; com
  `merge-duplicates` o PostgREST só grava o que é enviado, então o original fica intacto.
- `unitCosts(p, price, plat, snap)` com `snap.v >= 2` calcula **só** pelo snapshot — não
  consulta cadastro nem regra atual do marketplace.
- Se o preço da linha for editado, as **alíquotas congeladas** são reaplicadas ao novo
  preço; preço inalterado usa os valores em R$ exatos.

### Perfis por anúncio (`variant`)

`''` = padrão, `classic`, `premium` ou rótulo livre. Permite o mesmo SKU com condições
diferentes no mesmo mês, calculados separadamente. O upsert usa a chave com `variant`, então
reimportar **atualiza sem duplicar**.

### Importação (`planilha.js`)

O modelo traz colunas opcionais de custos reais (comissão R$ ou %, tarifa fixa, taxa
adicional, frete, embalagem, imposto, custo unitário) e "Tipo de anúncio". Valor preenchido
**vence campo a campo**; vazio congela a configuração atual. `snapshot.fields` registra a
origem de cada campo (`planilha` ou `config`) e a revisão mostra isso antes de confirmar.

### Linhas legadas

Sem snapshot, continuam funcionando pelo cadastro atual e aparecem marcadas como
**estimado**. **Nunca** são congeladas em silêncio — só pelo botão **Recalcular mês**, que
exige confirmação e informa quantas linhas serão afetadas.

---

## 8. Estoque por local

`stock_balances` guarda a quantidade por local; `stock.min_qty` continua sendo o mínimo.
Quatro locais fixos (constraint no banco):

| Valor | Significado |
|---|---|
| `general` | Estoque físico |
| `ml_full` | Full Mercado Livre |
| `amazon_full` | Full Amazon |
| `magalu_full` | Full Magalu |

Custo e preço vêm de Produtos (read-only). Gravação em lote: 1 requisição por salvamento.
`tiny.js` importa inventário no padrão Tiny/Olist.

---

## 9. Funcionalidades existentes

- **Produtos** — fonte única de nome, SKU, categoria, custo e preço padrão. SKU duplicado
  avisa, não bloqueia. Excluir produto não apaga histórico de vendas.
- **Precificação** — simulação por canal; nome/SKU/custo são read-only. Regras oficiais por
  marketplace (faixas da Shopee, tarifa fixa do ML, categorias Amazon), preço mínimo
  recomendado, cenários de ROAS, ROAS mínimo para a meta.
- **Vendas** — lançamento por mês/marketplace, importação de planilha, comparação com o mês
  anterior, ordenação por coluna, rascunho local (7 dias), "Salvar mês" e "Recalcular mês".
- **Anúncios** — leitura de relatórios Shopee/ML (CSV/XLSX), ACOS/TACOS, simulador.
- **Dashboard/Início/Financeiro** — somente consulta, sempre via `PainelConsolida`.
- **Despesas** — CRUD com categorias, status, recorrência e filtro por competência.
- **Assistente** — perguntas em linguagem natural sobre os próprios dados, somente leitura.
- **Backup** — exportar/importar produtos em JSON (import força `user_id` do logado).

---

## 10. Problemas conhecidos

- **Meses antigos estão como "estimado".** Até 2026-08-24 a coluna `snapshot` não existia
  em produção, então todo o histórico anterior foi sempre recalculado pela configuração
  atual. Congelar exige **Recalcular mês**, um mês por vez.
- **Recalcular usa a configuração de hoje**, não a taxa que vigorava no mês — esse dado não
  existe. Para fidelidade: ajustar a Precificação às taxas da época → recalcular → voltar.
- **Sem `variant` no banco**, o painel cai no modo antigo (1 linha por produto/mês).
  Já aplicado, mas a degradação existe se a migration for revertida.
- **`SETUP_GUIDE.md` e `CHECKLIST_DEPLOYMENT.md` estão desatualizados** (citam variáveis
  `REACT_APP_*` que não são usadas). Servem só como histórico do setup inicial.
- **Ads por venda (`ads_unit`)** é gravado como 0; o rateio real vem de
  `monthly_ads_summary`.

---

## 11. Últimas decisões

- **2026-08-24 — Histórico de vendas congelado (`974536e`).** Snapshot v2 por linha,
  imutabilidade por omissão da coluna no upsert, perfis Clássico/Premium via `variant`,
  importação com custos reais e revisão prévia, botão "Recalcular mês" explícito, linhas
  legadas rotuladas como estimado. Migration `vendas_snapshot_v2.sql` (aditiva: backup,
  coluna com default, nova unicidade criada antes de remover a antiga). 49 asserções em
  `tests/vendas-snapshot.test.js`, todas passando. Corrigido bug no mapeamento de colunas:
  o alias `das` casava como substring com "uni**das**des vendi**das**" e o imposto lia a
  coluna de unidades.
- **2026-08-21 — Despesas por competência** e filtro de mês de competência.
- **Estoque por 4 locais** (`general`, `ml_full`, `amazon_full`, `magalu_full`).
- **Assistente sem API externa** — removidos OpenAI e `/api/chat`; roda no navegador.
- **DAS no Dashboard** + auto-preenchimento de taxas por marketplace na Precificação.

---

## 12. Como rodar localmente

```bash
cd painel-precificacao && python3 -m http.server 8080
```

Abre em `http://localhost:8080/index.html`. Sem build step. Deploy: `git push origin main`.

**Testes:** com o servidor no ar, abra o painel e carregue `tests/vendas-snapshot.test.js`
pelo console — o resultado sai formatado, com total de aprovados e falhas.
