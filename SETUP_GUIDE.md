# 📚 Guia Completo de Setup

Siga estes passos para colocar seu painel online em 15 minutos.

## PASSO 1: Configurar Supabase (5 min)

### 1.1 Criar Projeto Supabase
1. Acesse [supabase.com/dashboard](https://supabase.com/dashboard)
2. Clique em **+ New Project**
3. Preencha:
   - **Project Name**: `painel-precificacao`
   - **Database Password**: (crie uma senha forte)
   - **Region**: Brazil (São Paulo)
4. Clique em **Create new project** e aguarde (~2 min)

### 1.2 Criar Tabelas
1. Quando o projeto estiver pronto, clique em **SQL Editor** (menu esquerdo)
2. Clique em **+ New Query**
3. Cole este SQL:

```sql
-- Tabela de produtos
CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text DEFAULT '',
  cost numeric DEFAULT 0,
  category text DEFAULT 'Outros',
  channels jsonb DEFAULT '{}'::jsonb,
  created_at timestamp WITH TIME ZONE DEFAULT now(),
  updated_at timestamp WITH TIME ZONE DEFAULT now()
);

-- Índices para performance
CREATE INDEX products_user_id ON products(user_id);
CREATE INDEX products_created_at ON products(created_at DESC);

-- Habilitar RLS (segurança)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso
CREATE POLICY "Usuários podem ver seus próprios produtos"
  ON products FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem inserir produtos"
  ON products FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Usuários podem atualizar seus produtos"
  ON products FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Usuários podem deletar seus produtos"
  ON products FOR DELETE
  USING (auth.uid() = user_id);
```

4. Clique em **Run** (ícone ▶️)
5. Você deve ver "Success" 

### 1.3 Copiar Credenciais
1. Clique em **Settings** (engrenagem, canto inferior esquerdo)
2. Vá para **API** → copie:
   - **Project URL** (ex: https://xyzabc.supabase.co)
   - **anon public** key
3. Salve esses valores temporariamente

---

## PASSO 2: Preparar o Repositório GitHub (3 min)

### 2.1 Criar Repositório
1. Acesse [github.com/new](https://github.com/new)
2. Preencha:
   - **Repository name**: `painel-precificacao`
   - **Description**: `Painel de precificação multiplataforma`
   - **Public** (deixe público)
   - ☑️ Add a README file
3. Clique em **Create repository**

### 2.2 Clonar e Fazer Upload dos Arquivos
```bash
# Clonar (substitua seu-usuario)
git clone https://github.com/seu-usuario/painel-precificacao.git
cd painel-precificacao

# Copiar os arquivos do projeto (feito anteriormente)
# Os arquivos já estão em /Users/guilhermecruz/Downloads/painel-precificacao/

# Fazer commit
git add .
git commit -m "Adicionar arquivos do painel de precificação"
git push origin main
```

---

## PASSO 3: Deploy no Vercel (5 min)

### 3.1 Conectar Vercel ao GitHub
1. Acesse [vercel.com/new](https://vercel.com/new)
2. Clique em **Import Project**
3. Selecione **GitHub** como fonte
4. Procure por `painel-precificacao` e clique em **Import**

### 3.2 Configurar Variáveis de Ambiente
Na tela do Vercel, em **Environment Variables**, adicione:

| Nome | Valor |
|------|-------|
| `REACT_APP_SUPABASE_URL` | `https://seu-projeto.supabase.co` |
| `REACT_APP_SUPABASE_ANON_KEY` | (sua chave anon copiada) |

### 3.3 Deploy
1. Clique em **Deploy**
2. Aguarde (leva ~1-2 min)
3. Você receberá um link como: `https://painel-precificacao-xyz.vercel.app`

✅ **Pronto! Seu painel está online!**

---

## PASSO 4: Testar (2 min)

1. Acesse sua URL do Vercel
2. Clique em **Criar conta** (se não tiver conta Supabase)
3. Preencha email e senha
4. Faça login
5. Clique em **Novo** para criar seu primeiro produto
6. Teste as funcionalidades

---

## 🔗 Links Úteis

- **Seu Painel**: https://painel-precificacao-xyz.vercel.app (substitua pelo seu)
- **Supabase Dashboard**: https://supabase.com/dashboard
- **GitHub Repo**: https://github.com/seu-usuario/painel-precificacao
- **Vercel Dashboard**: https://vercel.com/dashboard

---

## ⚙️ Troubleshooting

### ❌ "Erro ao fazer login"
**Solução:**
- Verifique se as credenciais no Vercel estão corretas
- Vá para Supabase → Settings → Auth → Providers → Habilitar Email

### ❌ "Produto não salva"
**Solução:**
- Confirme que o RLS está habilitado no Supabase
- Verifique Console (F12) para mensagens de erro

### ❌ "Página em branco"
**Solução:**
- Limpe cache (Ctrl+Shift+Delete)
- Verifique console (F12) para erros de JavaScript

---

## 🔐 Segurança Importante

⚠️ **Nunca commite credenciais!**
- Arquivo `.gitignore` já protege `.env.local`
- Use apenas variáveis de ambiente no Vercel
- Regenere chaves periodicamente no Supabase

---

## 📞 Próximas Passos

Depois do deployment:

1. **Backup automático**: Configure backups no Supabase
2. **Custom Domain**: Adicione seu domínio no Vercel
3. **Analytics**: Monitore uso em Supabase Dashboard
4. **Melhorias**: Considere adicionar mais funcionalidades

**Parabéns! 🎉**
