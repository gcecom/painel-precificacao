#!/bin/bash

echo ""
echo "================================================================================"
echo "IMPORTANDO PRODUTOS - PROCESSO COMPLETO"
echo "================================================================================"
echo ""

cd /Users/guilhermecruz/Downloads/painel-precificacao

# Etapa 1: Desabilitar RLS
echo "📋 Etapa 1: Preparando Supabase..."
echo "⚠️  Você precisa desabilitar RLS manualmente:"
echo ""
echo "1. Acesse: https://supabase.com/dashboard"
echo "2. Vá para SQL Editor → New Query"
echo "3. Cole e execute:"
echo "   ALTER TABLE products DISABLE ROW LEVEL SECURITY;"
echo ""
read -p "Pressione ENTER quando terminar..."

# Etapa 2: Importar produtos
echo ""
echo "🚀 Etapa 2: Importando 35 produtos..."
echo ""
python3 import_simple.py

# Etapa 3: Reabilitar RLS
echo ""
echo "📋 Etapa 3: Protegendo dados..."
echo "⚠️  Agora você precisa REABILITAR RLS:"
echo ""
echo "1. Vá para SQL Editor → New Query"
echo "2. Cole e execute:"
echo "   ALTER TABLE products ENABLE ROW LEVEL SECURITY;"
echo ""
read -p "Pressione ENTER quando terminar..."

echo ""
echo "================================================================================"
echo "✅ PROCESSO COMPLETO!"
echo "================================================================================"
echo ""
echo "Agora faça login no painel:"
echo "🌐 https://painel-precificacao-e2pj.vercel.app/"
echo ""
echo "Email:    gcecommercecontato@gmail.com"
echo "Senha:    Painel@2026"
echo ""
echo "Você verá os 35 produtos no catálogo! 🎉"
echo ""
