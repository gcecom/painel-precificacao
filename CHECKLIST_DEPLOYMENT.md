# ✅ Checklist de Deployment

Complete este checklist para colocar seu painel online em minutos.

## 📦 Arquivos Criados

```
✅ index.html          - Interface do painel
✅ styles.css          - Estilos e tema claro/escuro
✅ app.js              - Lógica principal (800+ linhas)
✅ supabase.js         - Integração com Supabase
✅ .env.example        - Template de variáveis
✅ .gitignore          - Proteção de arquivos sensíveis
✅ package.json        - Metadados do projeto
✅ vercel.json         - Configuração Vercel
✅ README.md           - Documentação
✅ SETUP_GUIDE.md      - Guia passo a passo
```

**Status:** ✅ Todos os arquivos prontos!

---

## 🔧 PASSO 1: Supabase (5 minutos)

Faça isso AGORA no seu navegador:

### 1️⃣ Acessar Supabase
```
🔗 https://supabase.com/dashboard
```

### 2️⃣ Criar Novo Projeto
- Clique em **+ New Project**
- **Project Name**: `painel-precificacao`
- **Region**: Brazil (São Paulo)
- Clique em **Create new project**
- ⏳ Aguarde ~2 minutos

### 3️⃣ Executar SQL para Criar Tabelas
1. Vá para **SQL Editor** (menu esquerdo)
2. Clique em **+ New Query**
3. Cole o SQL do arquivo `SETUP_GUIDE.md` (PASSO 1.2)
4. Clique em **Run** (ícone ▶️)
5. ✅ Você deve ver "Success"

### 4️⃣ Copiar Credenciais
```
Settings → API

COPIE ESTES VALORES (você vai usar em 5 minutos):

📌 REACT_APP_SUPABASE_URL = https://_____.supabase.co
📌 REACT_APP_SUPABASE_ANON_KEY = eyJhbG...
```

**Status ao completar:** ☐

---

## 🐙 PASSO 2: GitHub (3 minutos)

### 1️⃣ Criar Repositório
```
🔗 https://github.com/new
```

Preencha:
- **Repository name**: `painel-precificacao`
- **Public** ✅
- Clique em **Create repository**

### 2️⃣ Fazer Upload dos Arquivos (no seu terminal)

```bash
# Abra o Terminal/PowerShell

# Clonar o repositório (substitua seu-usuario)
git clone https://github.com/seu-usuario/painel-precificacao.git
cd painel-precificacao

# Copiar arquivos (os arquivos já estão em ~/Downloads/painel-precificacao/)
# Você pode arrastar e soltar ou usar:
cp -r ~/Downloads/painel-precificacao/* .

# Fazer commit e push
git add .
git commit -m "Adicionar painel de precificação"
git push origin main
```

**Status ao completar:** ☐

---

## 🚀 PASSO 3: Vercel (5 minutos)

### 1️⃣ Fazer Login
```
🔗 https://vercel.com/dashboard
```

### 2️⃣ Importar Projeto
1. Clique em **Add New...** → **Project**
2. Selecione **Import Git Repository**
3. Procure por `painel-precificacao`
4. Clique em **Import**

### 3️⃣ Adicionar Variáveis de Ambiente
Na tela do Vercel, procure por **Environment Variables**

Adicione essas 2 variáveis (use os valores copiados do Supabase):

```
Nome: REACT_APP_SUPABASE_URL
Valor: https://_____.supabase.co

Nome: REACT_APP_SUPABASE_ANON_KEY
Valor: eyJhbG...
```

### 4️⃣ Deploy
1. Clique em **Deploy**
2. ⏳ Aguarde 1-2 minutos
3. ✅ Você receberá um link como: `https://painel-precificacao-xyz.vercel.app`

**Status ao completar:** ☐

---

## 🧪 PASSO 4: Testar (2 minutos)

### 1️⃣ Acessar seu painel
```
🔗 https://painel-precificacao-xyz.vercel.app
```
(substitua `xyz` pelo seu domínio Vercel)

### 2️⃣ Fazer Signup
- Clique em **Criar conta**
- Email: seu-email@gmail.com
- Senha: (crie uma forte)
- Clique em **Entrar**

### 3️⃣ Criar Produto de Teste
- Clique em **Novo**
- Nome: "Teste"
- Custo: 100
- Preço: 299.99
- Clique em **Salvar produto**

### 4️⃣ Verificar Cálculos
- Veja se os valores aparecem em tempo real
- Teste o tema claro/escuro (☀ e ☾)
- Teste mudar de plataforma (Shopee, Magalu, etc)

✅ **Se tudo funcionou, você está online!**

**Status ao completar:** ☐

---

## 📊 Resumo Rápido

| Etapa | Tempo | Status |
|-------|-------|--------|
| 1. Supabase | 5 min | ☐ |
| 2. GitHub | 3 min | ☐ |
| 3. Vercel | 5 min | ☐ |
| 4. Testar | 2 min | ☐ |
| **TOTAL** | **15 min** | ☐ |

---

## 🆘 Se Algo Deu Errado

### Erro: "Falha ao fazer login"
```
✅ Solução:
1. Verifique as variáveis no Vercel (Deploy settings)
2. Confirme que o Supabase Project está ativo
3. Limpe cache (Ctrl+Shift+Delete)
```

### Erro: "Não consegue salvar produto"
```
✅ Solução:
1. Abra Console (F12 → Console)
2. Verifique mensagens de erro
3. Confirme RLS no Supabase
```

### Link do Vercel não funciona
```
✅ Solução:
1. Aguarde 2-3 minutos (propagação DNS)
2. Verifique no Vercel Dashboard se o deploy foi bem-sucedido
3. Se falhou, clique em "Redeploy"
```

---

## 🎉 Pronto!

Agora você tem:

✅ Painel online com autenticação real  
✅ Banco de dados Supabase  
✅ Deploy automático no Vercel  
✅ Dados sincronizados em tempo real  
✅ Tema claro/escuro  
✅ Múltiplas plataformas suportadas  

---

## 🔐 Próximas Melhorias (Opcional)

- [ ] Adicionar seu domínio customizado
- [ ] Configurar backups automáticos
- [ ] Adicionar mais usuários
- [ ] Ativar 2FA no Supabase
- [ ] Integrar com APIs das plataformas

---

**Dúvidas? Consulte o arquivo `SETUP_GUIDE.md` para detalhes completos.**
