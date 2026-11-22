-- Migration: Enhanced Purchase Receipt Tables
-- Date: 2024-11-21
-- Description: Create purchase_receipts and purchase_receipt_items tables
--              with all enhanced fields for detailed purchase receiving.

CREATE TABLE IF NOT EXISTS purchase_receipts (
    id TEXT PRIMARY KEY,
    po_id TEXT NOT NULL REFERENCES purchase_orders(id),
    received_by TEXT NOT NULL REFERENCES users(id),
    received_date TEXT NOT NULL,
    supplier_bill_number TEXT,
    invoice_number TEXT,
    payment_method TEXT DEFAULT 'cash',
    invoice_discount_percent REAL DEFAULT 0,
    invoice_discount_amount REAL DEFAULT 0,
    invoice_advance_tax_percent REAL DEFAULT 0,
    invoice_advance_tax_amount REAL DEFAULT 0,
    payment_amount REAL DEFAULT 0,
    balance REAL DEFAULT 0,
    net_payable REAL DEFAULT 0,
    total_amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_receipt_items (
    id TEXT PRIMARY KEY,
    receipt_id TEXT NOT NULL REFERENCES purchase_receipts(id),
    po_item_id TEXT REFERENCES purchase_order_items(id),
    product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    bonus_quantity INTEGER DEFAULT 0,
    unit_cost REAL NOT NULL DEFAULT 0,
    discount_percent REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    advance_tax_percent REAL DEFAULT 0,
    advance_tax_amount REAL DEFAULT 0,
    sale_price REAL DEFAULT 0,
    margin_percent REAL DEFAULT 0,
    line_total REAL DEFAULT 0,
    batch_number TEXT,
    expiry_date TEXT,
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_po ON purchase_receipts(po_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_invoice_number ON purchase_receipts(invoice_number);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier_bill ON purchase_receipts(supplier_bill_number);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_receipt ON purchase_receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipt_items_product ON purchase_receipt_items(product_id);
