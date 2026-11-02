CREATE TABLE IF NOT EXISTS cashier_shifts (
    id TEXT PRIMARY KEY,
    cashier_id TEXT NOT NULL REFERENCES users(id),
    opened_at TEXT NOT NULL,
    opening_cash_cents INTEGER NOT NULL CHECK(opening_cash_cents >= 0),
    closed_at TEXT,
    closed_by TEXT REFERENCES users(id),
    counted_cash_cents INTEGER CHECK(counted_cash_cents >= 0),
    expected_cash_cents INTEGER,
    variance_cents INTEGER,
    status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
    notes TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_shift_per_cashier ON cashier_shifts(cashier_id) WHERE status = 'open';
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_drawer ON cashier_shifts(status) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_cashier_shifts_opened ON cashier_shifts(opened_at);

ALTER TABLE sales_invoices ADD COLUMN shift_id TEXT REFERENCES cashier_shifts(id);
ALTER TABLE sales_invoices ADD COLUMN patient_name TEXT;
ALTER TABLE sales_invoices ADD COLUMN doctor_name TEXT;
ALTER TABLE sales_returns ADD COLUMN refund_shift_id TEXT REFERENCES cashier_shifts(id);
ALTER TABLE product_batches ADD COLUMN loose_open_remaining INTEGER NOT NULL DEFAULT 0 CHECK(loose_open_remaining >= 0);

CREATE TABLE IF NOT EXISTS loose_break_events (
    id TEXT PRIMARY KEY,
    invoice_id TEXT NOT NULL REFERENCES sales_invoices(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    batch_id TEXT NOT NULL REFERENCES product_batches(id),
    cashier_id TEXT NOT NULL REFERENCES users(id),
    strips_opened INTEGER NOT NULL CHECK(strips_opened > 0),
    pack_size INTEGER NOT NULL CHECK(pack_size > 1),
    units_requested INTEGER NOT NULL CHECK(units_requested > 0),
    recorded_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_loose_break_invoice ON loose_break_events(invoice_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
    id TEXT PRIMARY KEY,
    voucher_number TEXT NOT NULL UNIQUE,
    supplier_id TEXT NOT NULL REFERENCES suppliers(id),
    po_id TEXT NOT NULL REFERENCES purchase_orders(id),
    amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
    method TEXT NOT NULL CHECK(method IN ('cash', 'bank', 'mobile')),
    reference TEXT,
    notes TEXT,
    paid_at TEXT NOT NULL,
    recorded_by TEXT NOT NULL REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_po ON supplier_payments(po_id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_supplier ON supplier_payments(supplier_id);
