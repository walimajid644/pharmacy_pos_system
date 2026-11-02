CREATE TABLE catalog_operations (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('import','bulk')),
 actor_id TEXT NOT NULL REFERENCES users(id), payload_json TEXT NOT NULL,
 result_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TRIGGER catalog_operations_no_update BEFORE UPDATE ON catalog_operations BEGIN SELECT RAISE(ABORT,'Catalog operation history is immutable'); END;
CREATE TRIGGER catalog_operations_no_delete BEFORE DELETE ON catalog_operations BEGIN SELECT RAISE(ABORT,'Catalog operation history is immutable'); END;
ALTER TABLE sales_invoices ADD COLUMN prescription_note TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN controlled_snapshot INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sales_invoice_items ADD COLUMN drap_snapshot TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN regulatory_snapshot INTEGER NOT NULL DEFAULT 0;
UPDATE sales_invoice_items SET controlled_snapshot=COALESCE((SELECT controlled_substance FROM products WHERE id=product_id),0),
 drap_snapshot=(SELECT drap_registration_number FROM products WHERE id=product_id);
CREATE INDEX idx_controlled_invoice_items ON sales_invoice_items(controlled_snapshot,invoice_id);
-- Cashier dashboard/commercial references do not expose prescription evidence.
CREATE VIEW sales_dashboard AS SELECT id,invoice_number,invoice_date,net_amount,payment_method,status,customer_id FROM sales_invoices;
