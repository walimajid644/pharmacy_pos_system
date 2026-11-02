"""Inspect the isolated desktop upgrade database after a test run."""

import os
from pathlib import Path
import sqlite3


database = Path(os.environ["APPDATA"]) / "com.pharmacypos.codex.upgrade" / "pharmacy.db"
connection = sqlite3.connect(database.as_uri() + "?mode=ro", uri=True)
try:
    integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
    customer = connection.execute(
        "SELECT first_name, last_name FROM customers WHERE id = 'upgrade-customer'"
    ).fetchone()
    product = connection.execute(
        "SELECT name, unit_price FROM products WHERE id = 'upgrade-product'"
    ).fetchone()
    migrations = connection.execute(
        "SELECT version, COUNT(*) FROM schema_migrations GROUP BY version"
    ).fetchall()
    inventory_table = connection.execute(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'purchase_orders'"
    ).fetchone()[0]
    invoice_columns = {row[1] for row in connection.execute("PRAGMA table_info(sales_invoice_items)")}
    return_columns = {row[1] for row in connection.execute("PRAGMA table_info(sales_returns)")}
finally:
    connection.close()

print("integrity:", integrity)
print("seed customer:", customer)
print("seed product:", product)
print("migrations:", migrations)
print("inventory table:", inventory_table)
print("sale_quantity:", "sale_quantity" in invoice_columns)
print("refund_reference:", "refund_reference" in return_columns)

assert integrity == "ok"
assert customer == ("Upgrade", "Test")
assert product == ("Upgrade Test Product", 25.0)
assert migrations == [("004_phase5_inventory", 1)]
assert inventory_table == 1
assert "sale_quantity" in invoice_columns
assert "refund_reference" in return_columns
