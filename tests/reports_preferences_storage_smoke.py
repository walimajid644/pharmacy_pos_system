"""Compile every report against the real schema and check dated bank accounting and upgrade defaults."""
from pathlib import Path
import runpy
import re
import sqlite3

root = Path(__file__).resolve().parents[1]
context = runpy.run_path(str(root/'tests/banking_income_storage_smoke.py'))
db = context['db']
db.executescript((root/'src-tauri/migrations/021_purchase_preferences.sql').read_text(encoding='utf-8'))
if not db.execute('SELECT 1 FROM app_settings').fetchone():
    db.execute("INSERT INTO app_settings(id,company_name,created_at,updated_at) VALUES('settings','Test','now','now')")
assert db.execute('SELECT purchase_default_quantity,purchase_default_tax,purchase_default_discount,purchase_show_tax,purchase_show_discount,purchase_fill_remaining FROM app_settings').fetchone() == (1,17,0,1,1,1)
for field,value in [('purchase_default_quantity',0),('purchase_default_quantity',1.5),('purchase_default_tax',101),('purchase_default_discount',-1),('purchase_show_tax',2)]:
    try:
        db.execute(f'UPDATE app_settings SET {field}=?',[value])
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError(f'Invalid preference accepted: {field}={value}')
queries=re.findall(r'query: `([^`]+)`',(root/'src/lib/reportCatalog.ts').read_text(encoding='utf-8'))
for query in queries:
    for kind in (['expense','income'] if '${kind}' in query else ['expense']):
        query=query.replace('${kind}',kind)
        db.execute('EXPLAIN '+query,['2020-01-02']*query.count('?')).fetchall()
bank=next(q for q in queries if 'LEFT JOIN bank_ledger' in q)
# Existing fixture has one expense and both transfer legs. A transfer never creates system income.
rows=db.execute(bank,['2020-01-02','2020-01-02','2020-01-02','2020-01-02']).fetchall()
assert rows == [('a',0,-15,-15),('b',0,10,10)],rows
rows=db.execute(bank,['2020-01-03','2020-01-03','2020-01-31','2020-01-31']).fetchall()
assert rows == [('a',-15,0,-15),('b',10,0,10)],rows
expenses=next(q for q in queries if "kind='expense'" in q)
assert db.execute(expenses,['2020-01-01','2020-01-31']).fetchall()==[('General',1,5)]
assert db.execute(expenses,['2020-02-01','2020-02-28']).fetchall()==[]
print('Reports: all production queries compile, bank opening + movement = closing, date filters and purchase preference migration guards pass')
