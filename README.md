# Painel FULL Ecommerce — Precificação & Gestão

Painel web para vendedor **multiplataforma** (Mercado Livre, Shopee, Amazon, Magalu):
precificar produtos, analisar anúncios, lançar o resultado mensal, controlar estoque e
despesas e consolidar tudo num dashboard — cada usuário vê **só os próprios dados**.

- **URL:** https://painel-precificacao-e2pj.vercel.app
- **Repo:** github.com/gcecom/painel-precificacao
- **Login:** gcecommercecontato@gmail.com (a senha **não** fica no repo)

---

## Stack

- **Frontend:** HTML/CSS/JS puro — **sem framework, sem bundler, sem build step**. Um `index.html` (SPA de arquivo único) mostra/esconde as views; a navegação é client-side (sem roteamento por URL).
- **Banco/Auth:** **Supabase** (Postgres + Auth REST, via `fetch` direto — sem SDK). A `anon key` é pública por design; a segurança real vem do **RLS**.
- **Deploy:** GitHub → **Vercel** (deploy automático a cada `git push` na `main`).
- **Assistente:** interno, roda 100% no navegador (sem API externa).

### Cache busting (IMPORTANTE ao editar)

Todo `<script>`/`<link>` no `index.html` tem `?v=N`. **Ao editar qualquer `.js`/`.css`,
incremente esse N em todos** (`sed -i '' 's/?v=77/?v=78/g' index.html`). É o que faz o
navegador do usuário buscar a versão nova sem hard refresh. **Versão atual: `v=77`.**

---

## Estrutura de arquivos

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura de todas as views + carrega os scripts na ordem certa + widget do assistente. |
| `styles.css` | Todo o CSS (um arquivo, sem pré-processador). Temas claro/escuro via `data-theme`. |
| `supabase.js` | Cliente Supabase minimalista (REST). Auth + todos os métodos de dados. Expõe `window.supabaseClient`. |
| `app.js` | Núcleo: `PLATFORMS`, motor de precificação (`calcAt`, `effCost`, `channelDefaults`), auth (`initAuth`), tema, aba **Precificação**. |
| `nav.js` | Navegação por módulos (menu lateral + gaveta mobile), seletor de Canal, acordeões da Precificação no mobile. Expõe `window.navigateTo`. |
| `produtos.js` | Módulo **Produtos** (cadastro central) + links de anúncio por marketplace. |
| `estoque.js` | Módulo **Estoque**. Expõe `window.stockSnapshot`, `window.stockEnsureLoaded`. |
| `performance.js` | Abas **Anúncios** (relatórios/simulador) **e Vendas** (Resultado Mensal). Expõe `window.PainelShared` (helpers + `unitCosts`) e `window.PainelVendas`. |
| `consolida.js` | **Consolidação única** dos resultados mensais. Fonte de verdade de Dashboard, Início e Financeiro. Expõe `window.PainelConsolida.consolidar()`. |
| `dashboard.js` | Módulo **Dashboard Geral** (cards, gráficos SVG, tabelas, olho de ocultar lucro). Expõe `window.PainelCharts`, `window.PainelOlhoLucro`. |
| `inicio.js` | Página **Início** (saudação, cards do mês, gráfico 12 meses, atalhos, alertas). |
| `financeiro.js` | Módulo **Financeiro** (DRE simplificada). Usa `PainelConsolida`. |
| `despesas.js` | Módulo **Despesas** (lançamentos detalhados, `expense_entries`). |
| `daterange.js` | Seletor compacto de período (Dashboard/Financeiro) e de mês (Vendas). |
| `planilha.js` | Baixar modelo / importar planilha de vendas (XLSX/CSV) na aba Vendas. |
| `tiny.js` | Importar inventário no padrão **Tiny/Olist** na aba Estoque. |
| `assistente.js` | **Assistente interno** (somente leitura, sem API externa). |
| `sql/` | Migrations (rodar manualmente no SQL Editor do Supabase — a anon key não faz DDL). |

**Ordem de carregamento dos scripts** (em `index.html`):
`supabase.js` → `app.js` → `performance.js` → `nav.js` → `produtos.js` → `estoque.js` →
`consolida.js` → `dashboard.js` → `financeiro.js` → `daterange.js` → `inicio.js` →
`planilha.js` → `tiny.js` → `despesas.js` → `assistente.js`.
Também carrega `xlsx.full.min.js` (CDN SheetJS) para ler relatórios.

---

## Módulos (menu lateral)

Menu recolhível (desktop) / gaveta com scrim (mobile ≤900px). O seletor **Canal** só
aparece nas telas que dependem de marketplace.

| Módulo | View | Canal? |
|---|---|---|
| **Início** | `inicioView` | Não |
| **Dashboard Geral** | `dashboardView` | Não (consolida tudo) |
| **Produtos** | `produtosView` | Não |
| **Estoque** | `estoqueView` | Não |
| **Vendas** (Resultado mensal) | `monthlyView` | **Sim** |
| **Precificação** | `pricingView` | **Sim** |
| **Anúncios** | `performanceView` | **Sim** |
| **Financeiro** | `financeiroView` | Não |
| **Despesas** | `despesasView` | Não |
| **Configurações** | `configView` | Não |

O símbolo do raio (cabeçalho e barra lateral) volta para o **Início**.

---

## Modelo de dados (Supabase)

Todas as tabelas têm **RLS** com policies `auth.uid() = user_id`. Cada requisição manda o
**JWT do usuário logado** como Bearer (não a anon key) — é o que permite ao RLS filtrar.

| Tabela | Chave | Guarda |
|---|---|---|
| `products` | `id` (uuid) | nome, SKU, categoria, custo, preço padrão, imagem, `active`, `channels` (JSONB por marketplace: preço, comissão, taxa, frete, `ad_url`, `ad_id`, etc.) |
| `stock` | `(user_id, product_id)` | `qty`, `min_qty` |
| `monthly_sales` | `(user_id, platform, product_id, month)` | `units`, `price`, `ads_unit`, `snapshot` (custo/taxas congelados no fechamento) |
| `monthly_expenses` | `(user_id, month)` | `amount` (gastos gerais), `das` (DAS pago) |
| `monthly_ads_summary` | `(user_id, platform, month)` | `ads_spend`, `revenue_total`, `revenue_ads` |
| `expense_entries` | `id` (uuid) | despesa detalhada: descrição, categoria, valor, vencimento, status, pagamento, recorrência |

`month` é texto `"YYYY-MM"`.

### Migrations (`sql/`) — rodar uma vez cada no SQL Editor

`rls_isolamento_por_usuario.sql` · `resultado_mensal_por_mes.sql` · `monthly_ads_summary.sql` ·
`cadastro_central_e_estoque.sql` · `das_mensal.sql` · `historico_congelado.sql` (backup +
coluna `snapshot`) · **`despesas_detalhadas.sql`** (tabela `expense_entries` + RLS).

> ⚠️ `despesas_detalhadas.sql` e `historico_congelado.sql` precisam ser executados no
> Supabase para a aba **Despesas** e o congelamento de histórico funcionarem.

---

## Motor de cálculo

### Por venda (`calcAt` em `app.js`, `unitCosts` em `performance.js`)
A partir de preço, custo e taxas do canal calcula comissão, tarifas, imposto, frete,
devoluções e o lucro **antes dos Ads** (`beforeAds`). O custo usado é `effCost` (custo
específico salvo na Precificação → custo central de Produtos → 0). `unitCosts` zera esse
campo, então Vendas/Dashboard usam **sempre** o custo central.

### Consolidação mensal (`consolida.js` → `PainelConsolida.consolidar`)
Fonte única para Dashboard, Início e Financeiro. Garante, num só lugar:
- período exato; sem registro duplicado por `user|marketplace|produto|mês`;
- **Ads**: 1 valor por `marketplace|mês`, rateado por faturamento e descontado **uma vez**;
- **gastos gerais**: 1 valor por mês (nunca por marketplace); com filtro, ficam de fora do líquido do recorte;
- **imposto** pelo mesmo `unitCosts` (`dasCalc` = faturamento × taxa);
- produto excluído do cadastro **não** apaga a venda antiga (usa o `snapshot`).

### Fórmula (explícita)
```
Lucro operacional = receita − comissões − tarifas − frete − imposto − custo
Lucro após Ads    = operacional − Ads do mês
Lucro líquido     = operacional − Ads − gastos gerais   (só Dashboard/Início/Financeiro)
```
O imposto/DAS estimado já está dentro do operacional — é exibido, **nunca descontado 2×**.

---

## Assistente interno

Botão de chat flutuante em todas as páginas (`assistente.js`). **Somente leitura, sem API
externa** (sem OpenAI, sem `/api/chat`): interpreta a pergunta localmente (palavras-chave,
produto, marketplace, período) e responde com a **consolidação oficial** sobre os dados do
próprio usuário (RLS pelo JWT). Responde em texto e tabelas, informa período/filtros/origem
e nunca inventa números. Perguntas: produto mais rentável, lucro por marketplace, mais
vendidos, marketplace com maior faturamento/lucro/margem, comparação mensal, Ads, impostos,
despesas, estoque, produtos com prejuízo ou estoque baixo. Não entendeu → lista as opções.

---

## Rodar localmente

```bash
cd painel-precificacao
python3 -m http.server 8080      # http://localhost:8080/index.html
```
Sem build step. Deploy: `git push origin main` → a Vercel publica sozinho.

---

## Convenções ao editar

1. Alterou `.js`/`.css`? **Incremente `?v=N`** em todos os assets no `index.html`.
2. Cálculo consolidado → mexer **só** em `consolida.js` (Dashboard/Início/Financeiro herdam).
3. Nova tabela/coluna → migration mínima em `sql/`, rodar manual no Supabase (com RLS).
4. Não relacionar dados por nome — sempre `product_id` ou SKU.
5. Não sobrescrever meses históricos já salvos.
6. Responsivo: validar 360/390/430/desktop; sem rolagem horizontal; tabelas com scroll próprio.
7. Temas claro e escuro devem continuar funcionando (variáveis CSS + `data-theme`).
8. **Somente leitura** onde o requisito pedir (ex.: assistente): nunca criar/editar/excluir.

---

## Segurança

- **RLS é a defesa real**; a anon key hardcoded é pública por design (app client-only).
- Isolamento em 3 camadas: RLS no banco; JWT do usuário em toda requisição; reset do estado em memória no logout.
- **Nunca** commitar senha ou `OPENAI_API_KEY` (repo público). Segredos ficam só na Vercel.
