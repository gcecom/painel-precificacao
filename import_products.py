#!/usr/bin/env python3
"""
Script para importar produtos do CSV para o Supabase
Uso: python3 import_products.py <email> <password>
"""

import csv
import requests
import sys
import json

# Configurações
SUPABASE_URL = "https://novcfkmcliquuvmnqwoe.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdmNma21jbGlxdXV2bW5xd29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Mjk1MjUsImV4cCI6MjEwMDQwNTUyNX0.wQYbOfomZcd_o1RNyQKue62gfJ5z9R4exfuFygNr6NU"
CSV_FILE = "inventario_23-07-2026-17-12-26.csv"

def categoryOf(name):
    """Categorizar produto por nome"""
    s = name.lower()
    if 'eletr' in s or 'cerca' in s or 'voltimetro' in s:
        return 'Eletrificadores e cerca'
    if 'esterilizador' in s:
        return 'Esterilizadores de ar'
    if 'ionizador' in s or 'ozônio' in s:
        return 'Tratamento de piscina e ar'
    if 'purificador' in s:
        return 'Purificadores de ar'
    if 'fio' in s:
        return 'Fios para cerca'
    if 'suporte' in s:
        return 'Suportes'
    if 'repelente' in s:
        return 'Repelentes'
    return 'Componentes e outros'

def clean_price(price_str):
    """Limpar e converter preço para número"""
    if not price_str or price_str == '0' or price_str == '':
        return 0
    try:
        # Remover espaços e trocar vírgula por ponto
        price_str = str(price_str).strip().replace(',', '.')
        return float(price_str)
    except:
        return 0

def sign_up(email, password):
    """Criar conta no Supabase"""
    url = f"{SUPABASE_URL}/auth/v1/signup"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
    }
    data = {"email": email, "password": password}

    response = requests.post(url, json=data, headers=headers)
    result = response.json()

    if "user" in result:
        user_id = result["user"]["id"]
        # Tentar pegar token da session, se não existir, usar a chave anon
        if "session" in result and result["session"]:
            token = result["session"]["access_token"]
        else:
            token = SUPABASE_ANON_KEY
        print(f"✅ Conta criada: {email} (ID: {user_id})")
        return user_id, token
    else:
        print(f"⚠️  Conta já existe")
        # Se a conta já existe, tentar pegar o ID
        if "id" in result:
            return result["id"], SUPABASE_ANON_KEY
        return None, None

def sign_in(email, password):
    """Fazer login no Supabase"""
    url = f"{SUPABASE_URL}/auth/v1/token?grant_type=password"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
    }
    data = {"email": email, "password": password}

    response = requests.post(url, json=data, headers=headers)
    result = response.json()

    if "access_token" in result:
        print(f"✅ Login bem-sucedido: {email}")
        return result["user"]["id"], result["access_token"]
    else:
        print(f"❌ Erro ao fazer login: {result}")
        return None, None

def import_products(user_id, token):
    """Importar produtos do CSV para o Supabase"""

    url = f"{SUPABASE_URL}/rest/v1/products"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}",
        "apikey": SUPABASE_ANON_KEY,
        "Prefer": "return=minimal"
    }

    imported = 0
    skipped = 0

    with open(CSV_FILE, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f, delimiter=';')

        for idx, row in enumerate(reader, start=2):
            name = row.get('Produto', '').strip()
            sku = row.get('Código (SKU)', '').strip()
            cost = clean_price(row.get('Preço Compra', 0))

            if not name:
                skipped += 1
                continue

            category = categoryOf(name)

            # Preparar dados do produto
            product_data = {
                "name": name,
                "sku": sku or "",
                "cost": cost,
                "category": category,
                "user_id": user_id,
                "channels": {
                    "mercadolivre": {
                        "price": 0,
                        "discount": 0,
                        "packaging": 0,
                        "freight": 0,
                        "returns": 0,
                        "feeMode": "classic",
                        "commission": 12.5,
                        "fixedFee": 0,
                        "service": 0,
                        "tax": 8,
                        "taxBase": "gross",
                        "unitFee": 0,
                        "adsMode": "roas",
                        "adsValue": 10,
                        "roasBase": "gross",
                        "targetMargin": 10,
                        "purchaseMode": "amount",
                        "investment": 10000,
                        "quantity": 100,
                        "monthlySales": 0,
                        "adsShare": 100,
                        "monthlyFixed": 0
                    },
                    "shopee": {
                        "price": 0,
                        "discount": 0,
                        "packaging": 0,
                        "freight": 0,
                        "returns": 0,
                        "feeMode": "manual",
                        "commission": 14,
                        "fixedFee": 0,
                        "service": 0,
                        "tax": 8,
                        "taxBase": "gross",
                        "unitFee": 0,
                        "adsMode": "roas",
                        "adsValue": 10,
                        "roasBase": "gross",
                        "targetMargin": 10,
                        "purchaseMode": "amount",
                        "investment": 10000,
                        "quantity": 100,
                        "monthlySales": 0,
                        "adsShare": 100,
                        "monthlyFixed": 0
                    },
                    "magalu": {
                        "price": 0,
                        "discount": 0,
                        "packaging": 0,
                        "freight": 0,
                        "returns": 0,
                        "feeMode": "manual",
                        "commission": 16,
                        "fixedFee": 0,
                        "service": 0,
                        "tax": 8,
                        "taxBase": "gross",
                        "unitFee": 0,
                        "adsMode": "roas",
                        "adsValue": 10,
                        "roasBase": "gross",
                        "targetMargin": 10,
                        "purchaseMode": "amount",
                        "investment": 10000,
                        "quantity": 100,
                        "monthlySales": 0,
                        "adsShare": 100,
                        "monthlyFixed": 0
                    },
                    "amazon": {
                        "price": 0,
                        "discount": 0,
                        "packaging": 0,
                        "freight": 0,
                        "returns": 0,
                        "feeMode": "manual",
                        "commission": 15,
                        "fixedFee": 0,
                        "service": 0,
                        "tax": 8,
                        "taxBase": "gross",
                        "unitFee": 0,
                        "adsMode": "roas",
                        "adsValue": 10,
                        "roasBase": "gross",
                        "targetMargin": 10,
                        "purchaseMode": "amount",
                        "investment": 10000,
                        "quantity": 100,
                        "monthlySales": 0,
                        "adsShare": 100,
                        "monthlyFixed": 0
                    }
                }
            }

            # Inserir no Supabase
            response = requests.post(url, json=product_data, headers=headers)

            if response.status_code in [200, 201]:
                imported += 1
                print(f"✅ [{imported}] {name[:50]}... (Custo: R${cost})")
            else:
                print(f"❌ Erro ao inserir {name}: {response.text}")

    print(f"\n" + "="*80)
    print(f"IMPORTAÇÃO CONCLUÍDA!")
    print(f"✅ Produtos importados: {imported}")
    print(f"⏭️  Linhas puladas: {skipped}")
    print("="*80)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Uso: python3 import_products.py <email> <password>")
        print("\nExemplo:")
        print("  python3 import_products.py seu-email@gmail.com sua-senha")
        sys.exit(1)

    email = sys.argv[1]
    password = sys.argv[2]

    print(f"\n{'='*80}")
    print(f"IMPORTANDO PRODUTOS PARA O SUPABASE")
    print(f"{'='*80}\n")

    # Tentar login primeiro
    user_id, token = sign_in(email, password)

    # Se falhar, criar conta
    if not user_id:
        print("\n🔄 Tentando criar nova conta...")
        user_id, token = sign_up(email, password)

    if user_id and token:
        import_products(user_id, token)
    else:
        print("❌ Erro: Não foi possível autenticar")
        sys.exit(1)
