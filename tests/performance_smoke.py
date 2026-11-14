"""Synthetic SQL baseline using the actual POS search queries and migrations.

Measures Python SQLite on this host, not WebView IPC or a production checkout.
The one-second ceiling catches severe regressions; timings remain informational.
"""
from pathlib import Path
import json
import platform
import re
import sqlite3
import statistics
import time

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
for name in ['001_initial_schema', '004_phase5_inventory', '007_desktop_operations', '008_supplier_drawer', '009_pos_sale_details', '010_commercial_operations', '011_credit_and_expiry', '012_pricing_and_audit', '013_catalog_and_controlled']:
    db.executescript((root / 'src-tauri/migrations' / (name + '.sql')).read_text(encoding='utf-8'))
size = 20000
db.executemany("INSERT INTO products(id,sku,name,generic_name,barcode,unit_price,cost_price,created_at,updated_at) VALUES(?,?,?,?,?,10,5,'now','now')",
               ((f'p{i}', f'SKU{i:06}', f'Medicine {i:06}', f'Generic {i % 100}', f'990{i:09}') for i in range(size)))
db.executemany("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES(?,?,?,'2099-12-31',100,5,'2026-01-01','now','now')",
               ((f'b{i}-{j}', f'p{i}', f'B{j}') for i in range(size) for j in range(2)))
db.commit()
source = (root / 'src/composables/usePosProductSearch.ts').read_text(encoding='utf-8')
search = re.search(r'`(SELECT \* FROM products.*?)`', source, re.S).group(1)
batches = re.search(r'`(SELECT \* FROM product_batches.*?)`', source, re.S).group(1)
results = []
for term in ['990000019999', 'Medicine 019', 'Generic 42', 'missing product']:
    params = [f'%{term}%'] * 3 + [term, term]
    def lookup():
        products = db.execute(search, params).fetchall()
        assert len(products) <= 20
        if products:
            query = re.sub(r'\$\{.*?\}', ','.join('?' for _ in products), batches)
            rows = db.execute(query, [product[0] for product in products]).fetchall()
            assert len(rows) == len(products) * 2
        return products
    for _ in range(3):
        lookup()
    timings = []
    for _ in range(30):
        start = time.perf_counter()
        products = lookup()
        timings.append((time.perf_counter() - start) * 1000)
    p95 = sorted(timings)[28]
    assert p95 < 1000, f'Severe search regression: {p95:.1f} ms'
    if term.startswith('990'):
        assert products[0][4] == term  # Exact barcode remains first.
    results.append({'term': term, 'median_ms': round(statistics.median(timings), 2), 'p95_ms': round(p95, 2), 'rows': len(products)})
output = root / 'test-results/performance'
output.mkdir(parents=True, exist_ok=True)
report = {'products': size, 'batches': size * 2, 'sqlite': sqlite3.sqlite_version, 'python': platform.python_version(), 'platform': platform.system(), 'scope': 'Actual POS SQL, in-memory synthetic data; excludes native IPC and rendering', 'results': results}
(output / 'results.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
print(json.dumps(report, indent=2))
