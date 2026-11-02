"""Run the actual UI register/search SQL against a migrated SQLite database."""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
for name in ['001_initial_schema', '004_phase5_inventory', '007_desktop_operations', '008_supplier_drawer', '009_pos_sale_details', '010_commercial_operations', '011_credit_and_expiry', '012_pricing_and_audit', '013_catalog_and_controlled']:
    db.executescript((root / 'src-tauri/migrations' / (name + '.sql')).read_text(encoding='utf-8'))
finance = (root / 'src/views/FinanceView.vue').read_text(encoding='utf-8')
query = re.search(r'entries.value=await executeQuery<Entry>\(`(.*?)`\)', finance, re.S).group(1)
assert db.execute(query).fetchall() == []
db.execute("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('p','P','Medicine',12,5,'now','now')")
db.execute("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('b','p','Batch1','2099-12-31',25,5,'now','now','now')")
db.execute("INSERT INTO product_batches(id,product_id,batch_number,expiry_date,quantity_in_stock,cost_price_at_batch,received_date,created_at,updated_at) VALUES('expired','p','Batch2','2000-01-01',7,5,'now','now','now')")
search = (root / 'src/views/AdvancedItemSearchView.vue').read_text(encoding='utf-8')
base = re.search(r'const base=`(.*?)`', search, re.S).group(1).replace('${where}', 'p.deleted_at IS NULL')
row = db.execute(base).fetchone()
assert row['stock'] == 25 and row['expired_stock'] == 7 and row['next_expiry'] == '2099-12-31'
assert db.execute('SELECT COUNT(*) FROM (' + base + ') WHERE stock>0').fetchone()[0] == 1
assert db.execute('SELECT COUNT(*) FROM (' + base + ') WHERE stock=0').fetchone()[0] == 0
actor = db.execute('SELECT id FROM users LIMIT 1').fetchone()[0]
db.execute("INSERT INTO account_entries(id,number,kind,category,description,amount_cents,method,entry_date,recorded_by,created_at) VALUES('ex','EX1','expense','Rent','Shop rent',25000,'bank','2026-10-31',?,'now')", [actor])
row = db.execute(query).fetchone()
assert row['kind'] == 'expense' and row['amount_cents'] == 25000 and row['status'] == 'posted'
print('Commercial SQL smoke passed: migrated schema, unified ledger, available/expired stock and stock filters.')

# Quarantine changes sellability, not physical valuation; disposal changes both.
reports = (root / 'src/views/ReportsView.vue').read_text(encoding='utf-8')
section = reports.split('async function generateStockValuationReport()', 1)[1]
valuation = re.search(r'executeQuery<any>\(\s*`(.*?)`', section, re.S).group(1)
db.execute("UPDATE product_batches SET quantity_in_stock=quantity_in_stock-3 WHERE id='b'")
db.execute("INSERT INTO batch_holds(id,batch_id,quantity,reason,created_by,created_at) VALUES('hold','b',3,'Inspection',?,'now')", [actor])
row = db.execute(valuation).fetchone()
assert row['total_stock'] == 32 and row['quarantined_stock'] == 3 and row['cost_value'] == 160
db.execute("UPDATE batch_holds SET status='written_off',resolved_at='2026-10-31T12:00:00Z',resolved_by=? WHERE id='hold'", [actor])
row = db.execute(valuation).fetchone()
assert row['total_stock'] == 29 and row['quarantined_stock'] == 0 and row['cost_value'] == 145
print('Quarantine physical valuation and disposal checks passed.')

# Upgrade populated Phase 2 data; preserve retail values and mark imported audit facts.
legacy = sqlite3.connect(':memory:')
for name in ['001_initial_schema', '004_phase5_inventory', '007_desktop_operations', '008_supplier_drawer', '009_pos_sale_details', '010_commercial_operations', '011_credit_and_expiry']:
    legacy.executescript((root / 'src-tauri/migrations' / (name + '.sql')).read_text(encoding='utf-8'))
legacy.execute("INSERT INTO products(id,sku,name,unit_price,cost_price,created_at,updated_at) VALUES('old','OLD','Old product',12.34,5,'now','now')")
legacy.execute("INSERT INTO cashier_shifts(id,cashier_id,opened_at,opening_cash_cents,status) VALUES('oldshift',?,'2026-10-30T10:00:00Z',5000,'open')", [actor])
legacy.executescript((root / 'src-tauri/migrations/012_pricing_and_audit.sql').read_text(encoding='utf-8'))
assert legacy.execute("SELECT unit_price,wholesale_price FROM products WHERE id='old'").fetchone() == (12.34, None)
assert legacy.execute("SELECT event_type,actor_id,historical FROM audit_events WHERE entity_id='oldshift'").fetchone() == ('shift_open', actor, 1)
for sql in ["UPDATE audit_events SET details='changed'", "DELETE FROM audit_events"]:
    try:
        legacy.execute(sql)
        raise AssertionError('Audit history mutation accepted')
    except sqlite3.IntegrityError:
        pass
print('Populated Phase 2 upgrade preserves retail prices and imports immutable audit facts.')

# The near-expiry report retains held-only batches and uses local calendar days.
section = reports.split('async function generateNearExpiryReport()', 1)[1]
near_query = re.search(r'executeQuery<any>\(\s*`(.*?)`', section, re.S).group(1)
db.execute("UPDATE product_batches SET quantity_in_stock=0,expiry_date=date('now','localtime','-1 day') WHERE id='expired'")
db.execute("INSERT INTO batch_holds(id,batch_id,quantity,reason,created_by,created_at) VALUES('held-expired','expired',7,'Inspection',?,'now')", [actor])
rows = db.execute(near_query, [db.execute("SELECT date('now','localtime','+14 day')").fetchone()[0]]).fetchall()
assert len(rows) == 1
assert (rows[0]['batch_id'], rows[0]['quantity_in_stock'], rows[0]['quarantined_stock'], rows[0]['batch_value'], rows[0]['days_until_expiry']) == ('expired', 0, 7, 84, -1)
db.execute("UPDATE product_batches SET expiry_date=date('now','localtime','+14 day') WHERE id='b'")
rows = db.execute(near_query, [db.execute("SELECT date('now','localtime','+14 day')").fetchone()[0]]).fetchall()
assert {row['batch_id'] for row in rows} == {'expired', 'b'}
db.execute("UPDATE batch_holds SET status='written_off',resolved_at='2026-11-01T12:00:00Z',resolved_by=? WHERE id='held-expired'", [actor])
assert [row['batch_id'] for row in db.execute(near_query, ['2099-12-31'])] == ['b']
print('Expiry report: held-only batches, physical valuation, local dates, inclusive threshold and resolved hold exclusion passed.')
