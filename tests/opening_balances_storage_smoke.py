"""Upgrade existing free-text shelves and exercise their product references."""
from pathlib import Path
import sqlite3

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.execute('PRAGMA foreign_keys=ON')
for name in ['001_initial_schema', '004_phase5_inventory', '007_desktop_operations',
             '008_supplier_drawer', '009_pos_sale_details', '010_commercial_operations',
             '011_credit_and_expiry', '012_pricing_and_audit', '013_catalog_and_controlled',
             '015_product_registration_details']:
    db.executescript((root / 'src-tauri/migrations' / (name+'.sql')).read_text(encoding='utf-8'))

db.execute("INSERT INTO users(id,username,password_hash,full_name,role,created_at,updated_at) VALUES('opening-admin','opening-admin','x','Admin','admin','now','now')")
db.execute("INSERT INTO customers(id,customer_code,first_name,last_name,customer_type,current_balance,created_at,updated_at) VALUES('legacy','LEG','Legacy','Customer','retail',123.45,'2020-01-01','now')")
db.execute("INSERT INTO suppliers(id,supplier_code,name,current_balance,created_at,updated_at) VALUES('legacy-supplier','LEG-S','Legacy Supplier',456.78,'2020-01-01','now')")
db.execute("INSERT INTO account_entries(id,number,kind,category,description,amount_cents,method,entry_date,recorded_by,created_at) VALUES('old-expense','EX-OLD','expense',' Old head ','Legacy expense',100,'bank','2020-01-01','opening-admin','now')")
db.executescript((root/'src-tauri/migrations/016_catalog_registers.sql').read_text(encoding='utf-8'))
db.executescript((root/'src-tauri/migrations/018_register_openings.sql').read_text(encoding='utf-8'))
assert db.execute("SELECT current_balance FROM customers WHERE id='legacy'").fetchone()[0] == 123.45
assert db.execute("SELECT kind,amount_cents FROM opening_balances ORDER BY kind").fetchall() == [('customer',12345),('supplier',45678)]
head_id=db.execute("SELECT expense_head_id FROM account_entries WHERE id='old-expense'").fetchone()[0]
assert head_id
assert db.execute("SELECT name FROM expense_heads WHERE id=?",(head_id,)).fetchone()[0]=='Old head'
db.execute("UPDATE expense_heads SET name='Renamed head',is_active=0 WHERE id=?",(head_id,))
assert db.execute("SELECT category,expense_head_id FROM account_entries WHERE id='old-expense'").fetchone()==(' Old head ',head_id)
# Validate the actual UI SQL against SQLite, not a mocked query parser.
import re
for source in ['src/composables/useSuppliers.ts','src/composables/useSupplierLedger.ts','src/composables/useFinance.ts','src/views/OpeningBalancesView.vue','src/views/BatchStickersView.vue']:
    text=(root/source).read_text(encoding='utf-8')
    for query in re.findall(r'`(SELECT[^`]+)`', text):
        query=query.replace('\\\\','\\')
        db.execute(query, ['%']*query.count('?')).fetchall()
# All three opening account pickers must be executable against the upgraded schema.
text=(root/'src/views/OpeningBalancesView.vue').read_text(encoding='utf-8')
for query in re.findall(r'"(SELECT[^"\n]+)"',text):
    db.execute(query).fetchall()
for statement in ["UPDATE opening_balances SET amount_cents=0", "DELETE FROM opening_balances"]:
    try: db.execute(statement)
    except sqlite3.IntegrityError: pass
    else: raise AssertionError('Immutable opening accepted mutation')
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Step 3 upgrade: legacy balances, expense-head snapshots, immutable openings and real UI/label queries passed')
