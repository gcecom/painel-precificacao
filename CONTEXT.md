# Painel FULL Ecommerce — Contexto Completo

Documento único de referência do sistema. Descreve arquitetura, módulos, modelo de
dados, regras de negócio e fluxos. Serve para retomar o projeto sem reler todo o código.

> **Stack:** HTML/CSS/JS puro (sem framework, sem build step) • Supabase (Postgres + Auth REST) • Deploy automático na Vercel a cada `git push` na `main`.
> **URL:** https://painel-precificacao-e2pj.vercel.app • **Repo:** github.com/gcecom/painel-precificacao
> **Login:** gcecommercecontato@gmail.com (segunda conta: matheusvicentepn@gmail.com). Senha **não** fica no repo.

---

## 1. Visão geral

Painel web para vendedor multiplataforma (Mercado Livre, Shopee, Amazon, Magalu) precificar
produtos, analisar anúncios, lançar o resultado mensal e consolidar o negócio num dashboard.
Cada usuário só vê os próprios dados (isolamento por RLS no Postgres).

O app é uma **SPA de arquivo único** (`index.html`) com várias "views" (seções) que o
menu lateral mostra/esconde. Não há roteamento por URL; a navegação é client-side.

---

## 2. Cache busting (IMPORTANTE ao editar)

Todos os `<script>`/`<link>` no `index.html` têm `?v=N`. **Ao editar qualquer `.js` ou
`styles.css`, incrementar esse N em todos** (`sed -i '' 's/?v=44/?v=45/g' index.html`).
É o que faz o navegador do usuário buscar a versão nova sem hard refresh. **Versão atual: v=44.**

---

## 3. Arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura de todas as views + carrega os scripts na ordem certa. |
| `styles.css` | Todo o CSS (um arquivo, sem pré-processador). Temas claro/escuro via `data-theme`. |
| `supabase.js` | Cliente Supabase minimalista (fetch direto na REST API). Auth + todos os métodos de dados. Expõe `window.supabaseClient`. |
| `app.js` | Núcleo: constantes `PLATFORMS`, motor de precificação (`calcAt`, `channelDefaults`), auth (`initAuth`), tema (`setTheme`), aba **Precificação** e catálogo. Expõe globais: `products`, `platform`, `currentUser`, `calcAt`, `currentChannel`, `PLATFORMS`, `channelDefaults`. |
| `nav.js` | Navegação por módulos (menu lateral + gaveta mobile), seletor de Canal, dispara o render de cada view. Expõe `window.navigateTo`. |
| `produtos.js` | Módulo **Produtos** (cadastro central). Expõe `window.renderProdutos`. |
| `estoque.js` | Módulo **Estoque**. Expõe `window.renderEstoque`, `window.stockSnapshot`. |
| `performance.js` | Abas **Anúncios** (leitura de relatórios/simulador) **e Vendas/Resultado Mensal**. IIFE. Expõe `window.PainelShared` (helpers + `unitCosts`), `window.resetMonthlyCache`, `AdsSummary`. |
| `consolida.js` | **Consolidação única** dos resultados mensais. Expõe `window.PainelConsolida.consolidar()`. Fonte de verdade de Dashboard e Financeiro. |
| `dashboard.js` | Módulo **Dashboard Geral** (cards, gráficos SVG, tabelas, insights, alertas, CSV). Expõe `window.renderDashboard`, `window.resetDashboard`, `window.PainelCharts`. |
| `financeiro.js` | Módulo **Financeiro** (DRE simplificada). Usa `PainelConsolida`. Expõe `window.renderFinanceiro`. |
| `assets/` | `full-ecommerce-logo.jpg` (logo do login), `favicon-32.png`, `apple-touch-icon.png`. `favicon.ico` na raiz. |
| `sql/` | Migrations (rodar manualmente no SQL Editor do Supabase — a anon key não faz DDL). |

**Ordem de carregamento dos scripts** (em `index.html`): `supabase.js` → `app.js` →
`performance.js` → `nav.js` → `produtos.js` → `estoque.js` → `consolida.js` → `dashboard.js`
→ `financeiro.js`. Também carrega `xlsx.full.min.js` (CDN SheetJS) para ler relatórios.

---

## 4. Navegação (nav.js)

Menu lateral recolhível (desktop) / gaveta com scrim (mobile ≤900px). Cabeçalho enxuto:
raio + nome da página + seletor **Canal** + tema + usuário + Sair.

**8 módulos** → cada um aponta para uma `view`:

| Módulo | View | Depende de canal? |
|---|---|---|
| Dashboard Geral | `dashboardView` | Não (sempre consolida tudo) |
| Produtos | `produtosView` | Não |
| Estoque | `estoqueView` | Não |
| Vendas | `monthlyView` (Resultado Mensal) | Sim |
| Precificação | `pricingView` | Sim |
| Anúncios | `performanceView` | Sim |
| Financeiro | `financeiroView` | Não |
| Configurações | `configView` | Não |

- `NEEDS_CHANNEL = {vendas, precificacao, anuncios}` → seletor "Todos" desabilitado (exige um canal).
- `NO_CHANNEL = {dash, produtos, estoque, config}` → seletor Canal **oculto**; trocar canal não recarrega essas telas.
- O seletor "Canal" aciona os botões ocultos `.platform-btn[data-platform]` (preserva handlers antigos de `app.js`/`performance.js`).

---

## 5. Modelo de dados (Supabase)

Todas as tabelas têm **RLS** com policies `auth.uid() = user_id` (select/insert/update/delete).
Cada requisição de dados manda o **JWT do usuário logado** como Bearer (não a anon key) — é o que permite ao RLS filtrar.

| Tabela | Chave | Colunas principais | Fonte oficial de |
|---|---|---|---|
| `products` | `id` (uuid) | `user_id`, `name`, `sku`, `category`, `cost`, `default_price`, `image_url`, `active`, `channels` (JSONB por marketplace) | **Produtos**: nome, SKU, categoria, custo, preço padrão |
| `stock` | `(user_id, product_id)` | `qty`, `min_qty` | **Estoque**: quantidade e mínimo |
| `monthly_sales` | `(user_id, platform, product_id, month)` | `units`, `price`, `ads_unit` | **Vendas**: unidades e preço médio por produto/mês |
| `monthly_expenses` | `(user_id, month)` | `amount` (gastos gerais), `das` (DAS pago) | **Vendas**: valores únicos do negócio por mês |
| `monthly_ads_summary` | `(user_id, platform, month)` | `ads_spend`, `revenue_total`, `revenue_ads` | Gasto real de Ads / ACOS / TACOS por marketplace-mês |

`month` é texto `"YYYY-MM"`. `channels` guarda, por marketplace, os campos de precificação
(price, discount, commission, tax, feeMode, adsMode, adsValue, etc.) — ver `channelDefaults` em `app.js`.

**Migrations em `sql/`** (rodar uma vez cada, no SQL Editor):
`rls_isolamento_por_usuario.sql`, `resultado_mensal_por_mes.sql`, `monthly_ads_summary.sql`,
`cadastro_central_e_estoque.sql`, `das_mensal.sql`. Todas já foram aplicadas em produção.

---

## 6. Papéis das telas (fonte única — sem duplicar cadastro)

- **Produtos** = fonte única de nome, SKU, categoria, custo e preço padrão. Cria/edita/ativa/exclui produto. Relaciona por `id` interno; SKU é identificador comercial (duplicidade avisa, não bloqueia).
- **Estoque** = fonte única de quantidade e estoque mínimo. Custo e preço **vêm de Produtos** (read-only). Salva em lote (1 requisição).
- **Vendas (Resultado Mensal)** = fonte oficial de unidades, preço médio, gasto real de Ads, gastos gerais e DAS por mês. Botão explícito "Salvar mês".
- **Precificação** = **só simulação por canal**. Nome/SKU/categoria/custo são read-only (editar em Produtos); sem Novo/Duplicar/Excluir. Salva apenas a precificação do canal.
- **Anúncios** = leitura de relatórios (CSV/XLSX Shopee/ML), métricas e simulador. Vincula o relatório ao produto por **SKU/ID primeiro**, nome só como sugestão.
- **Dashboard/Financeiro** = **somente consulta**; usam a consolidação única.

Preço inicial nas telas segue a prioridade: **1)** valor salvo do mês/canal → **2)** preço padrão do cadastro (Produtos) → **3)** R$ 0,00. **Meses históricos nunca são sobrescritos.**

---

## 7. Motor de cálculo

### 7.1 Por venda (`calcAt` em `app.js`, `unitCosts` em `performance.js`)
A partir de preço, custo e taxas do canal, calcula comissão, tarifas, imposto, frete, e o
lucro **antes dos Ads** (`beforeAds`/`profit`). `unitCosts(p, price, plat)` devolve
`{comm, frete, tax, cost, profit}` por unidade — é o mesmo motor usado no fechamento mensal.

### 7.2 Consolidação mensal (`consolida.js` → `PainelConsolida.consolidar`)
Fonte única para Dashboard e Financeiro. Recebe `(raw, products, months, {fPlat,fProd,fCat,unitCosts})`.
Garante, num só lugar:
- **período exato** (só os meses pedidos);
- **sem registro duplicado** por `user|marketplace|produto|mês`;
- **Ads**: 1 valor por `marketplace|mês`, rateado por faturamento e **descontado uma vez**;
- **gastos gerais e DAS**: 1 valor por mês (nunca por marketplace);
- custos/imposto pelo mesmo `unitCosts`.

Devolve `total`, `byPlat`, `byProd`, `byMonth`, `expByMonth`, `dasByMonth`, `gerais`,
`dasOficial`, `adsTotal`, `liquido`, `margemLiquida`, `tacos`.

### 7.3 Fórmula do lucro (explícita)
```
Lucro operacional = receita − comissões − tarifas − frete − IMPOSTO_sobre_vendas − custo
                    (o imposto/DAS estimado por venda JÁ ESTÁ DENTRO do operacional)
Lucro líquido     = Lucro operacional − Ads do mês − gastos gerais
Margem líquida    = Lucro líquido ÷ faturamento
TACOS             = Ads ÷ faturamento total
```
- **DAS pago no mês** (`monthly_expenses.das`) é o valor **oficial informado** em Vendas. É exibido no Dashboard/CSV/DRE **mas NÃO é descontado de novo** do lucro (o imposto já está no operacional). Evita dupla contagem.
- Denominador zero → mostra "—" (nunca `NaN`/`Infinity`).

---

## 8. Dashboard Geral

- **Filtros:** período (De/Até mês), categoria, produto. **Sem** filtro de marketplace — sempre consolida todos. Padrão: mês mais recente salvo.
- **Ordem da página:** cards → gráficos/rankings → tabelas (marketplace, produto, mensal) → Insights → **Atenção necessária** (no fim).
- **Cards:** faturamento, lucro operacional, lucro líquido, margem, unidades, Ads, TACOS, gastos gerais, custo (CMV), **DAS pago no mês**, valor/potencial de estoque, produtos com estoque baixo. Cards principais mostram variação vs. período anterior.
- **Gráficos (SVG puro, sem lib externa):** faturamento por mês, lucro líquido por mês, Ads×faturamento, faturamento por marketplace, participação (rosca), rankings de produto (faturamento/lucro/unidades, top 10), valor financeiro do estoque.
- **Cores oficiais fixas por marketplace:** ML `#FFE600`, Shopee `#EE4D2D`, Amazon `#FF9900`, Magalu `#0086FF`, consolidado `#3483fa`.
- **Atenção necessária:** lista compacta, só críticos, máx. 5, 1 linha + ação curta ("Repor estoque", "Revisar margem", etc.).
- **CSV:** botão exporta o resumo filtrado (marketplace, produto, mês, totais, DAS).

---

## 9. Segurança

- **RLS é a defesa real**; a anon key hardcoded em `supabase.js` é pública por design (app client-only).
- Isolamento entre contas em 3 camadas: RLS no banco; token JWT do usuário em toda requisição; reset de todo estado em memória no logout (produtos, cache mensal, relatórios de Anúncios).
- Import de backup JSON força `user_id` do logado e id novo (não dá pra importar dados de outra conta).
- **Nunca** commitar senha real (o repo é público). Senha vazada já foi rotacionada; existe fluxo "Esqueci minha senha" no próprio painel (não depende do Dashboard do Supabase).

---

## 10. Como rodar/testar localmente

```bash
cd painel-precificacao
python3 -m http.server 8080      # abre http://localhost:8080/index.html
```
Sem build step. Para testar sem login real, dá para simular `currentUser`/`products` e
os métodos `supabaseClient.*` no console. Deploy: `git push origin main` → Vercel publica sozinho.

---

## 11. Convenções ao editar

1. Alterou `.js`/`.css`? **Incremente `?v=N`** em todos os assets no `index.html`.
2. Cálculo consolidado → mexer **só** em `consolida.js` (Dashboard e Financeiro herdam).
3. Nova tabela/coluna → criar migration mínima em `sql/` e rodar manual no Supabase (RLS junto).
4. Não relacionar dados por nome — sempre `product_id` ou SKU.
5. Não sobrescrever meses históricos já salvos.
6. Responsivo: validar 360/390/768/desktop; sem rolagem horizontal na página; tabelas com scroll próprio.
7. Temas claro e escuro devem continuar funcionando (variáveis CSS + `data-theme`).
