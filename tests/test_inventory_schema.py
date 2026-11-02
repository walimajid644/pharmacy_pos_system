"""Exercise current SQLite migrations and inventory triggers on an in-memory fixture."""

import pathlib
import sqlite3

ROOT = pathlib.Path(__file__).resolve().parents[1]
db = sqlite3.connect(":memory:")
for name in (
    "001_app_schema.sql",
    "002_app_sample.sql",  # Fixture data for this test only.
    "004_phase5_inventory.sql",
    "006_inventory_triggers.sql",
    "005_approval_guards.sql",
):
    db.executescript((ROOT / "src-tauri/migrations" / name).read_text(encoding="utf-8"))
admin = "00000000-0000-0000-0000-000000000001"
db.execute(
    """INSERT INTO stock_adjustments
    (id, adjustment_number, adjustment_date, adjustment_type, reason, total_value,
     status, created_by, created_at, updated_at)
    VALUES ('adj-test', 'ADJ-TEST', '2026-10-25', 'decrease', 'damaged', 9,
            'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
    (admin,),
)
db.execute(
    """INSERT INTO stock_adjustment_items
    (id, adjustment_id, product_id, batch_id, quantity_adjusted, unit_cost,
     line_value, created_at)
    VALUES ('item-test', 'adj-test', 'prod-1', 'batch-1', 5, 1.8, 9, CURRENT_TIMESTAMP)"""
)
db.execute("UPDATE stock_adjustments SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = 'adj-test'", (admin,))
assert db.execute("SELECT quantity_in_stock FROM product_batches WHERE id = 'batch-1'").fetchone()[0] == 495
assert db.execute("SELECT COUNT(*) FROM stock_movements WHERE reference_id = 'adj-test'").fetchone()[0] == 1

db.execute(
    """INSERT INTO stock_adjustments
    (id, adjustment_number, adjustment_date, adjustment_type, reason, total_value,
     status, created_by, created_at, updated_at)
    VALUES ('adj-too-many', 'ADJ-TOO-MANY', '2026-10-25', 'decrease', 'damaged', 900,
            'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
    (admin,),
)
db.execute(
    """INSERT INTO stock_adjustment_items
    (id, adjustment_id, product_id, batch_id, quantity_adjusted, unit_cost,
     line_value, created_at)
    VALUES ('item-too-many', 'adj-too-many', 'prod-1', 'batch-1', 500, 1.8, 900, CURRENT_TIMESTAMP)"""
)
try:
    db.execute("UPDATE stock_adjustments SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = 'adj-too-many'", (admin,))
    raise AssertionError("Excessive stock adjustment was accepted")
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT quantity_in_stock FROM product_batches WHERE id = 'batch-1'").fetchone()[0] == 495

db.execute(
    """INSERT INTO sales_invoices
    (id, invoice_number, cashier_id, invoice_date, total_amount, tax_amount,
     discount_amount, net_amount, payment_method, status, created_at, updated_at)
    VALUES ('inv-test', 'INV-TEST', ?, CURRENT_TIMESTAMP, 10, 0, 0, 10, 'cash',
            'completed', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
    (admin,),
)
db.execute(
    """INSERT INTO sales_invoice_items
    (id, invoice_id, product_id, batch_id, quantity, unit_price, line_total, created_at)
    VALUES ('sale-line', 'inv-test', 'prod-1', 'batch-1', 4, 2.5, 10, CURRENT_TIMESTAMP)"""
)


def add_return(return_id, quantity):
    db.execute(
        """INSERT INTO sales_returns
        (id, return_number, original_invoice_id, return_date, return_reason,
         subtotal, tax_amount, refund_amount, refund_method, status,
         processed_by, created_at, updated_at)
        VALUES (?, ?, 'inv-test', '2026-10-25', 'wrong_item', 5, 0, 5,
                'cash', 'pending', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""",
        (return_id, return_id, admin),
    )
    db.execute(
        """INSERT INTO sales_return_items
        (id, return_id, invoice_item_id, product_id, batch_id,
         quantity_returned, unit_price, line_total, restock, created_at)
        VALUES (?, ?, 'sale-line', 'prod-1', 'batch-1', ?, 2.5, 5, 1,
                CURRENT_TIMESTAMP)""",
        (return_id + "-line", return_id, quantity),
    )


add_return("ret-ok", 2)
db.execute("UPDATE sales_returns SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = 'ret-ok'", (admin,))
db.execute("UPDATE sales_returns SET status = 'refunded' WHERE id = 'ret-ok'")
assert db.execute("SELECT quantity_in_stock FROM product_batches WHERE id = 'batch-1'").fetchone()[0] == 497
assert db.execute("SELECT COUNT(*) FROM stock_movements WHERE reference_id = 'ret-ok'").fetchone()[0] == 1
add_return("ret-too-many", 3)
db.execute("UPDATE sales_returns SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP WHERE id = 'ret-too-many'", (admin,))
try:
    db.execute("UPDATE sales_returns SET status = 'refunded' WHERE id = 'ret-too-many'")
    raise AssertionError("Excessive return was accepted")
except sqlite3.IntegrityError:
    pass
assert db.execute("SELECT quantity_in_stock FROM product_batches WHERE id = 'batch-1'").fetchone()[0] == 497
print("Inventory schema and triggers passed")

