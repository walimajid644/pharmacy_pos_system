ALTER TABLE sales_invoices ADD COLUMN received_amount REAL;
ALTER TABLE sales_invoices ADD COLUMN change_amount REAL;
ALTER TABLE sales_invoices ADD COLUMN previous_balance REAL;
ALTER TABLE sales_invoice_items ADD COLUMN bonus_quantity INTEGER NOT NULL DEFAULT 0 CHECK (bonus_quantity >= 0);
ALTER TABLE sales_invoice_items ADD COLUMN bonus_units INTEGER NOT NULL DEFAULT 0 CHECK (bonus_units >= 0);
ALTER TABLE sales_invoice_items ADD COLUMN cost_price REAL;
