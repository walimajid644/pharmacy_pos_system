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


db.executescript((root/'src-tauri/migrations/016_catalog_registers.sql').read_text(encoding='utf-8'))
db.executescript((root/'src-tauri/migrations/018_register_openings.sql').read_text(encoding='utf-8'))
actor=db.execute('SELECT id FROM users LIMIT 1').fetchone()[0]
db.execute("INSERT INTO account_entries(id,number,kind,category,description,amount_cents,method,entry_date,recorded_by,created_at) VALUES('old','EX-OLD','expense','General','Legacy bank expense',500,'bank','2020-01-02',?,'now')",[actor])
db.executescript((root/'src-tauri/migrations/019_banking_income.sql').read_text(encoding='utf-8'))
assert db.execute('SELECT COUNT(*) FROM bank_accounts').fetchone()[0]==0
assert db.execute('SELECT amount_cents FROM unassigned_bank_entries').fetchone()[0]==-500
for bank in ['a','b']:
    db.execute("INSERT INTO bank_accounts(id,name,created_at,updated_at) VALUES(?,?, 'now','now')",[bank,bank])
db.execute("UPDATE account_entries SET bank_account_id='a' WHERE id='old'")
db.execute("INSERT INTO bank_transactions(id,number,kind,account_id,to_account_id,amount_cents,entry_date,reference,notes,recorded_by,created_at) VALUES('transfer','BT','transfer','a','b',1000,'2020-01-02','T','',?,'now')",[actor])
assert db.execute("SELECT SUM(amount_cents) FROM bank_ledger WHERE source='bank'").fetchone()[0]==0
assert db.execute("SELECT SUM(amount_cents) FROM bank_ledger WHERE account_id='a'").fetchone()[0]==-1500
# Compile actual production SELECTs against the full schema, including empty paths.
import re
for file in ['src-tauri/src/banking.rs','src/views/IncomeView.vue']:
    text=(root/file).read_text(encoding='utf-8')
    queries=re.findall(r'"(SELECT[^"\n]+)"',text)+re.findall(r'`(SELECT[^`]+)`',text)
    for query in queries:
        query=query.replace('{table}','account_entries')
        db.execute('EXPLAIN '+query,[None]*query.count('?')).fetchall()
db.execute("INSERT INTO bank_reconciliations(id,account_id,statement_date,statement_balance_cents,book_balance_cents,reference,recorded_by,created_at) VALUES('rec','a','2020-01-31',-1500,-1500,'Statement',?,'now')",[actor])
db.execute("INSERT INTO bank_clearances(entry_key,reconciliation_id,account_id,amount_cents) VALUES('bank:transfer:from','rec','a',-1000)")
for query in ["UPDATE bank_transactions SET status='void' WHERE id='transfer'","DELETE FROM bank_reconciliations","UPDATE bank_clearances SET amount_cents=0"]:
    try:db.execute(query)
    except sqlite3.IntegrityError:pass
    else:raise AssertionError('Reconciled bank data was changed: '+query)
assert db.execute('PRAGMA foreign_key_check').fetchall()==[]
print('Banking upgrade: unmapped legacy payments preserved, transfer legs balanced, real SELECTs valid and reconciliation history protected')
