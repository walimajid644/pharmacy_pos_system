ALTER TABLE supplier_payments ADD COLUMN shift_id TEXT REFERENCES cashier_shifts(id);
CREATE INDEX IF NOT EXISTS idx_supplier_payments_shift ON supplier_payments(shift_id);
