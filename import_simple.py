#!/usr/bin/env python3
"""
Script simples para importar produtos sem precisar de autenticação
"""

import csv
import requests
import json

# Configurações
SUPABASE_URL = "https://novcfkmcliquuvmnqwoe.supabase.co"
SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vdmNma21jbGlxdXV2bW5xd29lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4Mjk1MjUsImV4cCI6MjEwMDQwNTUyNX0.wQYbOfomZcd_o1RNyQKue62gfJ5z9R4exfuFygNr6NU"
USER_ID = "374ad9c6-cf47-4650-a7c4-a3037d692ea1"  # ID da sua conta
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
        price_str = str(price_str).strip().replace(',', '.')
        return float(price_str)
    except:
        return 0

def import_products():
    """Importar produtos do CSV"""

    url = f"{SUPABASE_URL}/rest/v1/products"
    headers = {
        "Content-Type": "application/json",
        "apikey": SUPABASE_ANON_KEY,
    }

    imported = 0
    errors = 0

    print(f"\n{'='*80}")
    print(f"IMPORTANDO PRODUTOS PARA O SUPABASE")
    print(f"{'='*80}\n")

    with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f, delimiter=';')

        for idx, row in enumerate(reader, start=2):
            name = row.get('Produto', '').strip()
            sku = row.get('Código (SKU)', '').strip()
            cost = clean_price(row.get('Preço Compra', 0))

            if not name:
                continue

            category = categoryOf(name)

            # Preparar dados do produto
            product_data = {
                "name": name,
                "sku": sku or "",
                "cost": cost,
                "category": category,
                "user_id": USER_ID,
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
                errors += 1
                print(f"❌ Erro: {name} - {response.status_code}")
                if response.status_code != 409:  # Ignore duplicate key errors
                    print(f"   Resposta: {response.text[:100]}")

    print(f"\n{'='*80}")
    print(f"IMPORTAÇÃO CONCLUÍDA!")
    print(f"✅ Produtos importados: {imported}")
    print(f"❌ Erros: {errors}")
    print(f"{'='*80}\n")

if __name__ == "__main__":
    import_products()
