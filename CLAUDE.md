# Painel de Precificação — GCEcommerce

Painel web de precificação e performance para e-commerce multiplataforma (Mercado Livre, Shopee, Magalu, Amazon). Site estático (HTML/CSS/JS puro, sem build step) hospedado na Vercel, com dados no Supabase.

## Stack e deploy

- **Frontend:** HTML/CSS/JS vanilla, sem framework, sem bundler.
- **Banco/Auth:** Supabase (Postgres + Auth REST). Chave pública (anon key) hardcoded em `supabase.js` — normal para apps client-only, a segurança real vem do RLS (Row Level Security) no Postgres, não do segredo da chave.
- **Deploy:** GitHub (`gcecom/painel-precificacao`) → Vercel (deploy automático a cada `git push` na `main`). URL: https://painel-precificacao-e2pj.vercel.app
- **Cache busting:** todos os `<script>`/`<link>` no `index.html` têm `?v=N`. **Ao editar `styles.css`, `app.js`, `performance.js` ou `supabase.js`, incrementar esse N** — é o que faz o navegador do usuário buscar a versão nova sem precisar de hard refresh manual.
- **Login de teste:** gcecommercecontato@gmail.com / Painel@2026

## Arquivos principais

- `index.html` — estrutura das 3 abas: Precificação, Avaliar Anúncio e Produto (Performance), Resultado Mensal.
- `app.js` — CRUD de produtos, cálculo de precificação (`calcAt`, `currentChannel`), autenticação (`initAuth`), auto-save com debounce.
- `performance.js` — aba de Performance (leitura de relatórios Shopee/ML em CSV/XLSX, simulador de cenários em tabela comparativa, "Simulação de uma venda") e aba Resultado Mensal (fechamento por marketplace). Roda dentro de uma IIFE, depende de globais expostos por `app.js` (`products`, `platform`, `calcAt`, `currentChannel`, `PLATFORMS`, `channelDefaults`, `$`/`el`).
- `supabase.js` — cliente Supabase minimalista (fetch direto na REST API, sem SDK oficial). Contém auth (login/signup/refresh de token) e métodos de dados (produtos, resultado mensal).
- `styles.css` — todo o CSS do site, um arquivo só, sem pré-processador.

## Modelo de segurança (importante)

**Cada usuário só pode ver/editar os próprios dados — nem mesmo o nome de um produto de outro login deve vazar.** Isso é garantido em duas camadas:

1. **Cliente:** `supabase.js` sempre manda o **token JWT do usuário logado** (não a anon key) no header `Authorization` de toda requisição de dados. Sem isso, o Postgres não sabe quem está perguntando e o RLS não tem como filtrar.
2. **Banco (RLS):** toda tabela de dados do usuário tem Row Level Security ativado com policies `auth.uid() = user_id` para select/insert/update/delete. **Isso só pode ser configurado via SQL Editor do Supabase** (a anon key não tem permissão de DDL) — não há como uma sessão de código rodar isso sozinha; sempre que uma tabela nova for criada, o SQL de RLS precisa ser colado manualmente pelo usuário no dashboard do Supabase.

Tabelas atuais: `products` (contém `channels` como JSONB embutido — não existe tabela `product_channels` separada, apesar de código morto antigo sugerir isso), `monthly_sales`, `monthly_meta`.

**Cuidado ao reusar padrões antigos deste projeto:** em versões anteriores, o RLS já foi desabilitado temporariamente para destravar uma importação em massa de CSV (contornando a lentidão de policies em insert). Se isso for necessário de novo, **desabilitar → importar → reabilitar com o mesmo script de policies**, nunca deixar desabilitado.

## Onde cada dado mora

| Dado | Local |
|---|---|
| Produtos, custos, canais/comissões | Supabase (`products`) |
| Resultado Mensal (unidades vendidas, preço médio) | Supabase (`monthly_sales`, `monthly_meta`) |
| Tema (claro/escuro) | localStorage (`painel_tema_2026`) — não sensível |
| Token de sessão | localStorage (`supabase_token`, `supabase_refresh_token`) |

Backup manual disponível via botão "Exportar dados" (baixa JSON dos produtos) / "Importar dados".
