"""Read-only verification of the snapshot exported by native acceptance."""
import json
import os
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
output = root / 'test-results' / 'native-acceptance'
manifest = json.loads((output / 'latest.json').read_text(encoding='utf-8'))
assert manifest['status'] == 'passed'
assert manifest['identifier'].startswith('com.pharmacypos.codex.acceptance')
# Normalize Windows extended path spelling without changing the destination.
snapshot = Path(os.path.realpath(manifest['backup']).removeprefix('\\\\?\\'))
canonical_output = Path(os.path.realpath(output).removeprefix('\\\\?\\'))
assert os.path.normcase(os.path.commonpath([snapshot, canonical_output])) == os.path.normcase(str(canonical_output))
expected = manifest['expected']
with sqlite3.connect(snapshot.as_uri() + '?mode=ro', uri=True) as db:
    assert db.execute('PRAGMA integrity_check').fetchone()[0] == 'ok'
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    assert db.execute('SELECT COUNT(*) FROM sales_invoices').fetchone()[0] == expected['invoiceCount']
    assert db.execute('SELECT quantity_in_stock FROM product_batches WHERE id=?', (expected['batchId'],)).fetchone()[0] == 7
    assert db.execute('SELECT current_balance FROM customers WHERE id=?', (expected['customerId'],)).fetchone()[0] == 0
    assert db.execute("SELECT COUNT(*) FROM schema_migrations WHERE version='013_catalog_and_controlled'").fetchone()[0] == 1
print('Exported native snapshot: SQLite integrity, foreign keys, invoices, stock7, settled credit and migration marker passed')
