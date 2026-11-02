"""Build an isolated pre-inventory pharmacy database for a desktop upgrade check."""

from pathlib import Path
import sqlite3


root = Path(__file__).resolve().parents[1]
target = root / "tests" / "upgrade-old.db"
if target.exists():
    raise SystemExit(f"Refusing to replace existing fixture: {target}")

schema = (root / "src-tauri" / "migrations" / "001_app_schema.sql").read_text(encoding="utf-8")
schema = schema.replace("    sale_quantity INTEGER,\n", "")

connection = sqlite3.connect(target)
try:
    connection.executescript(schema)
    connection.execute(
        "INSERT INTO customers (id, customer_code, first_name, last_name, customer_type, created_at, updated_at) "
        "VALUES ('upgrade-customer', 'UPGRADE-CUST', 'Upgrade', 'Test', 'retail', '2025-01-01', '2025-01-01')"
    )
    connection.execute(
        "INSERT INTO products (id, sku, name, unit_price, cost_price, created_at, updated_at) "
        "VALUES ('upgrade-product', 'UPGRADE-001', 'Upgrade Test Product', 25, 15, '2025-01-01', '2025-01-01')"
    )
    connection.commit()
finally:
    connection.close()

print(target)
