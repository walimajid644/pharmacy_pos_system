"""Exercise the real product INSERT/UPDATE SQL against the migrated SQLite schema."""
from pathlib import Path
import re
import sqlite3

root = Path(__file__).resolve().parents[1]
db = sqlite3.connect(':memory:')
db.row_factory = sqlite3.Row
db.execute('PRAGMA foreign_keys=ON')
for migration in ['001_initial_schema', '004_phase5_inventory', '007_desktop_operations',
                  '008_supplier_drawer', '009_pos_sale_details', '010_commercial_operations',
                  '011_credit_and_expiry', '012_pricing_and_audit', '013_catalog_and_controlled']:
    db.executescript((root / 'src-tauri/migrations' / (migration + '.sql')).read_text(encoding='utf-8'))
db.execute("INSERT INTO products(id,sku,name,unit_price,cost_price,pack_size,created_at,updated_at) VALUES('legacy','OLD','Legacy',10,5,10,'now','now')")
db.executescript((root / 'src-tauri/migrations/015_product_registration_details.sql').read_text(encoding='utf-8'))
old = db.execute("SELECT * FROM products WHERE id='legacy'").fetchone()
assert (old['unit_price'], old['cost_price'], old['uom'], old['maintain_batch']) == (10, 5, 'box', 0)
source = (root / 'src/composables/useProductCatalog.ts').read_text(encoding='utf-8')
insert = re.search(r'`(INSERT INTO products \([\s\S]*?)`', source).group(1)
update = re.search(r'`(UPDATE products SET[\s\S]*?)`', source).group(1)
values = dict(id='saved', sku='SAVE-1', name='Saved medicine', generic_name=None, barcode=None,
              category_id=None, manufacturer_id=None, unit_price=10, wholesale_price=None,
              cost_price=5, pack_size=10, sell_by_loose_unit=1, drap_registration_number=None,
              controlled_substance=0, reorder_level=10, is_active=1, created_at='now', updated_at='now',
              shelf_location='Shelf A', remarks='Keep chilled', uom='bottle', pack_type='100 ml',
              ext_disc_percent=7.25, stm_level=12, maintain_batch=1, fridge_item=1,
              registration_date='2026-11-21')
columns = [column.strip() for column in re.search(r'products\s*\(([\s\S]*?)\)', insert).group(1).split(',')]
assert len(columns) == insert.count('?') == 27
db.execute(insert, [values[column] for column in columns])
saved = dict(db.execute("SELECT * FROM products WHERE id='saved'").fetchone())
assert all(saved[key] == value for key, value in values.items())
assignments = [part.split('=')[0].strip() for part in re.search(r'SET([\s\S]*?)WHERE', update).group(1).split(',')]
values.update(shelf_location='', remarks='', pack_type='', ext_disc_percent=0, stm_level=0,
              maintain_batch=0, fridge_item=0, registration_date=None)
assert len(assignments) + 1 == update.count('?')
db.execute(update, [values[column] for column in assignments] + [values['id']])
saved = dict(db.execute("SELECT * FROM products WHERE id='saved'").fetchone())
assert all(saved[key] == value for key, value in values.items())
for assignment in ["ext_disc_percent=101", "stm_level=1.5", "stm_level=-1", "fridge_item=2",
                   "uom='bad'", "registration_date='2026-02-30'", "registration_date='2026-99-99'"]:
    try:
        db.execute(f"UPDATE products SET {assignment} WHERE id='saved'")
        raise AssertionError(f'Invalid metadata accepted: {assignment}')
    except sqlite3.IntegrityError:
        pass
print('SQLite product registration: legacy upgrade, real create/update queries, clearing and constraints passed')
