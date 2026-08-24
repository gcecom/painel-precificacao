# Regras de trabalho — Painel FULL Ecommerce

Site estático (HTML/CSS/JS puro, sem build) + Supabase + deploy automático na Vercel.
Contexto completo: **`docs/CONTEXTO-PAINEL.md`** — leia **só a seção necessária**.

## Como trabalhar aqui

1. **Economize tokens.** Respostas e diffs diretos, sem repetir o que já foi estabelecido.
2. **Nunca leia o projeto inteiro.** Localize o alvo por `grep`/busca e abra apenas os
   trechos necessários. `performance.js` tem ~1.400 linhas — leia por faixa, não inteiro.
3. **Altere só os arquivos necessários.** Nada de refatorar de passagem, renomear ou
   "melhorar" o que não foi pedido.
4. **Preserve dados existentes e o RLS.** Toda tabela é isolada por `auth.uid() = user_id`
   e toda requisição vai com o JWT do usuário. Nunca desabilite RLS, nunca sobrescreva
   histórico já salvo, nunca relacione dados por nome (use `product_id` ou SKU).
5. **Migrations apenas aditivas e não destrutivas.** Coluna nova nasce com default e
   `if not exists`; backup antes de mexer em tabela com dados; nada de `drop column`,
   `delete` ou `update` em massa. O SQL é colado à mão pelo usuário no Supabase — a anon
   key não faz DDL.
6. **Valide antes de entregar.** Rode os testes (`tests/`) ou exercite o código real no
   navegador. Se não deu para validar, diga isso explicitamente.
7. **Ao terminar, atualize `docs/CONTEXTO-PAINEL.md`** — apenas a seção afetada, sem
   reescrever o arquivo todo.

## Ao editar `.js` ou `.css`

Incremente o `?v=N` de **todos** os assets em `index.html` (é o cache busting; sem isso o
navegador do usuário continua na versão velha):

```bash
sed -i '' 's/?v=84/?v=85/g' index.html
```

## Nunca commitar

Senhas, tokens ou chaves privadas — o repositório é **público**. A anon key do Supabase em
`supabase.js` é pública por design (a defesa real é o RLS); qualquer outro segredo fica só
nas variáveis de ambiente da Vercel.
