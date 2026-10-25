#!/usr/bin/env python3
"""Gera a migração com a tabela food_shelf_life a partir do USDA FSIS FoodKeeper (data/foodkeeper_PT.json).
Os prazos NÃO são escritos à mão: tudo vem do ficheiro oficial (licença CC0). Uso:
    python3 supabase/scripts/foodkeeper_to_sql.py > supabase/migrations/20261121090000_food_shelf_life.sql
Só se usam as colunas «DOP_*» (a contar da data de COMPRA), porque a app só sabe a data de compra."""
import json
import math
import sys

d = json.load(open('data/foodkeeper_PT.json', encoding='utf-8'))
sheets = {s['name']: [{k: v for c in r for k, v in c.items()} for r in s['data']] for s in d['sheets']}
categories = {int(c['ID']): c for c in sheets['Category']}
versions = sheets['Version']
last = [v for v in versions if v.get('Modified_Date')][-1]

DAYS = {'Horas': 1 / 24, 'Dias': 1, 'Semanas': 7, 'Meses': 30, 'Mês': 30, 'Anos': 365, 'Ano': 365}
SPECIAL = {'Indefinidamente': 'indefinite', 'Maduro': 'ripe', 'Não recomendado': 'not_recommended', 'Prazo de validade da embalagem': 'package_date'}


def q(v):
    if v is None:
        return 'null'
    return "'" + str(v).strip().replace("'", "''") + "'"


def storage(p, prefix):
    metric = p.get(f'{prefix}_Metric')
    lo, hi = p.get(f'{prefix}_Min'), p.get(f'{prefix}_Max')
    if metric in SPECIAL:
        return SPECIAL[metric], None, None
    if metric in DAYS and lo is not None:
        hi = lo if hi is None else hi
        f = DAYS[metric]
        return 'days', max(1, math.ceil(lo * f)), max(1, math.ceil(hi * f))
    return None, None, None


out = [
    '-- Prazos de conservação por alimento: USDA FSIS «FoodKeeper» (dados abertos, licença CC0), versão em português.',
    f'-- Ficheiro: {d["fileName"]} · última alteração {last["Modified_Date"]}. GERADO por supabase/scripts/foodkeeper_to_sql.py: não editar à mão.',
    '-- Só os prazos a contar da data de compra («DOP»). Estado: days = intervalo em dias; indefinite = sem limite; ripe = até amadurecer;',
    '-- not_recommended = não recomendado; package_date = vale a data da embalagem.',
    'create table food_shelf_life (',
    '  id integer primary key,',
    '  category text,',
    '  name text not null,',
    '  detail text,',
    '  keywords text,',
    "  pantry_status text check (pantry_status in ('days', 'indefinite', 'ripe', 'not_recommended', 'package_date')),",
    '  pantry_min_days integer, pantry_max_days integer, pantry_tips text,',
    "  fridge_status text check (fridge_status in ('days', 'indefinite', 'ripe', 'not_recommended', 'package_date')),",
    '  fridge_min_days integer, fridge_max_days integer, fridge_tips text,',
    "  freezer_status text check (freezer_status in ('days', 'indefinite', 'ripe', 'not_recommended', 'package_date')),",
    '  freezer_min_days integer, freezer_max_days integer, freezer_tips text',
    ');',
    'alter table food_shelf_life enable row level security;',
    '-- Tabela de referência: qualquer pessoa com sessão lê; ninguém escreve pela app',
    'create policy food_shelf_life_read on food_shelf_life for select to authenticated using (true);',
    'grant select on food_shelf_life to authenticated;',
    '',
]
rows = []
for p in sheets['Product']:
    if not p.get('Name') or p.get('ID') is None:
        continue
    cat = categories.get(int(p['Category_ID'])) if p.get('Category_ID') else None
    cat_name = None
    if cat:
        cat_name = cat['Category_Name'] if not cat.get('Subcategory_Name') or cat['Subcategory_Name'] == cat['Category_Name'] else f"{cat['Category_Name']} · {cat['Subcategory_Name'].strip()}"
    ps, pl, ph = storage(p, 'DOP_Pantry')
    rs, rl, rh = storage(p, 'DOP_Refrigerate')
    fs, fl, fh = storage(p, 'DOP_Freeze')
    if not (ps or rs or fs):
        continue  # sem prazo a contar da compra: não serve para sugerir datas
    vals = [int(p['ID']), q(cat_name), q(p['Name']), q(p.get('Name_subtitle')), q(p.get('Keywords')),
            q(ps), pl if pl else 'null', ph if ph else 'null', q(p.get('DOP_Pantry_tips')),
            q(rs), rl if rl else 'null', rh if rh else 'null', q(p.get('DOP_Refrigerate_tips')),
            q(fs), fl if fl else 'null', fh if fh else 'null', q(p.get('DOP_Freeze_Tips'))]
    rows.append('  (' + ', '.join(str(v) for v in vals) + ')')
out.append('insert into food_shelf_life (id, category, name, detail, keywords, pantry_status, pantry_min_days, pantry_max_days, pantry_tips, '
           'fridge_status, fridge_min_days, fridge_max_days, fridge_tips, freezer_status, freezer_min_days, freezer_max_days, freezer_tips) values')
out.append(',\n'.join(rows) + ';')
sys.stdout.write('\n'.join(out) + '\n')
print(f'{len(rows)} alimentos', file=sys.stderr)
