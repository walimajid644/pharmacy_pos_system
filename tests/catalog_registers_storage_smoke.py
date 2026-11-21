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
for ident, shelf in [('one', ' Shelf A '), ('two', 'shelf a'), ('three', '')]:
    db.execute('INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,shelf_location,created_at,updated_at) VALUES(?,?,?,10,5,1,?,\'now\',\'now\')', (ident,ident,ident,shelf))
db.executescript((root / 'src-tauri/migrations/016_catalog_registers.sql').read_text(encoding='utf-8'))
assert db.execute('SELECT COUNT(*) FROM shelf_locations').fetchone()[0] == 1
shelf_id, name = db.execute('SELECT id,name FROM shelf_locations').fetchone()
assert db.execute('SELECT COUNT(*) FROM products WHERE shelf_location_id=?', (shelf_id,)).fetchone()[0] == 2
assert db.execute('SELECT shelf_location_id FROM products WHERE id=\'three\'').fetchone()[0] is None
db.execute('UPDATE shelf_locations SET name=\'Shelf B\' WHERE id=?', (shelf_id,))
db.execute('UPDATE products SET shelf_location=\'Shelf B\' WHERE shelf_location_id=?', (shelf_id,))
db.execute('UPDATE shelf_locations SET is_active=0 WHERE id=?', (shelf_id,))
db.execute('UPDATE products SET shelf_location=\'Shelf B\',remarks=\'Kept\' WHERE id=\'one\'')
for query in ["UPDATE products SET shelf_location='Shelf B' WHERE id='three'",
              "UPDATE products SET shelf_location='Unknown' WHERE id='one'",
              "DELETE FROM shelf_locations"]:
    try:
        db.execute(query)
        raise AssertionError('Invalid location change accepted: '+query)
    except sqlite3.IntegrityError:
        pass
db.execute("UPDATE products SET shelf_location='' WHERE id='one'")
assert db.execute("SELECT shelf_location_id FROM products WHERE id='one'").fetchone()[0] is None
print('Catalog registers: legacy shelf migration, links, rename, deactivation and clearing passed')
