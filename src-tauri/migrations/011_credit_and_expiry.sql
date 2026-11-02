CREATE TABLE customer_ledger (
 id TEXT PRIMARY KEY, customer_id TEXT NOT NULL REFERENCES customers(id),
 kind TEXT NOT NULL CHECK(kind IN ('opening','credit_sale','payment','void_payment','credit_return')),
 source_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
 occurred_at TEXT NOT NULL, recorded_by TEXT REFERENCES users(id), description TEXT NOT NULL,
 UNIQUE(kind,source_id)
);
INSERT INTO customer_ledger(id,customer_id,kind,source_id,amount_cents,occurred_at,description)
SELECT lower(hex(randomblob(16))),id,'opening',id,CAST(ROUND(current_balance*100) AS INTEGER),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Opening balance; historical age unknown'
FROM customers WHERE ROUND(current_balance*100)<>0;
CREATE TRIGGER ledger_customer_opening AFTER INSERT ON customers WHEN ROUND(NEW.current_balance*100)<>0
BEGIN INSERT INTO customer_ledger(id,customer_id,kind,source_id,amount_cents,occurred_at,description)
VALUES(lower(hex(randomblob(16))),NEW.id,'opening',NEW.id,CAST(ROUND(NEW.current_balance*100) AS INTEGER),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Opening balance; historical age unknown'); END;
CREATE INDEX idx_customer_ledger_date ON customer_ledger(customer_id,occurred_at);
CREATE TABLE batch_holds (
 id TEXT PRIMARY KEY, batch_id TEXT NOT NULL REFERENCES product_batches(id), quantity INTEGER NOT NULL CHECK(quantity>0),
 open_units INTEGER NOT NULL DEFAULT 0 CHECK(open_units>=0 AND open_units<=quantity), reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'held' CHECK(status IN ('held','released','written_off','returned')),
 created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
 resolved_by TEXT REFERENCES users(id), resolved_at TEXT, resolution_notes TEXT
);
CREATE INDEX idx_batch_holds_status ON batch_holds(batch_id,status);
ALTER TABLE sales_invoices ADD COLUMN customer_name_snapshot TEXT;
ALTER TABLE sales_invoices ADD COLUMN customer_phone_snapshot TEXT;
ALTER TABLE sales_invoices ADD COLUMN cashier_name_snapshot TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN product_name_snapshot TEXT;
ALTER TABLE sales_invoice_items ADD COLUMN batch_number_snapshot TEXT;
UPDATE sales_invoices SET customer_name_snapshot=COALESCE((SELECT first_name||' '||last_name FROM customers WHERE id=customer_id),'Walk-in'),
customer_phone_snapshot=(SELECT phone_number FROM customers WHERE id=customer_id),cashier_name_snapshot=(SELECT full_name FROM users WHERE id=cashier_id);
UPDATE sales_invoice_items SET product_name_snapshot=(SELECT name FROM products WHERE id=product_id),batch_number_snapshot=(SELECT batch_number FROM product_batches WHERE id=batch_id);
