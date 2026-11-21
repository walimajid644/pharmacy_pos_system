-- Migration: Enhanced Purchase Receipt Fields
-- Date: 2024-11-21
-- Description: Add fields for detailed purchase receiving matching Inspire POS

-- Add new columns to purchase_receipts table
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS supplier_bill_number TEXT;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS invoice_number TEXT;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS invoice_discount_percent REAL DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS invoice_discount_amount REAL DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS invoice_advance_tax_percent REAL DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS invoice_advance_tax_amount REAL DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS payment_amount REAL DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS balance REAL DEFAULT 0;
ALTER TABLE purchase_receipts ADD COLUMN IF NOT EXISTS net_payable REAL DEFAULT 0;

-- Add new columns to purchase_receipt_items table
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS bonus_quantity INTEGER DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS discount_percent REAL DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS discount_amount REAL DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS advance_tax_percent REAL DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS advance_tax_amount REAL DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS sale_price REAL DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS margin_percent REAL DEFAULT 0;
ALTER TABLE purchase_receipt_items ADD COLUMN IF NOT EXISTS line_total REAL DEFAULT 0;

-- Create index for faster invoice number lookups
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_invoice_number 
ON purchase_receipts(invoice_number);

-- Create index for supplier bill number lookups
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_supplier_bill 
ON purchase_receipts(supplier_bill_number);

-- Update existing records to have default values
UPDATE purchase_receipts 
SET 
  payment_method = COALESCE(payment_method, 'cash'),
  invoice_discount_percent = COALESCE(invoice_discount_percent, 0),
  invoice_discount_amount = COALESCE(invoice_discount_amount, 0),
  invoice_advance_tax_percent = COALESCE(invoice_advance_tax_percent, 0),
  invoice_advance_tax_amount = COALESCE(invoice_advance_tax_amount, 0),
  payment_amount = COALESCE(payment_amount, 0),
  balance = COALESCE(balance, 0),
  net_payable = COALESCE(net_payable, total_amount)
WHERE 1=1;

UPDATE purchase_receipt_items 
SET 
  bonus_quantity = COALESCE(bonus_quantity, 0),
  discount_percent = COALESCE(discount_percent, 0),
  discount_amount = COALESCE(discount_amount, 0),
  advance_tax_percent = COALESCE(advance_tax_percent, 0),
  advance_tax_amount = COALESCE(advance_tax_amount, 0),
  sale_price = COALESCE(sale_price, 0),
  margin_percent = COALESCE(margin_percent, 0),
  line_total = COALESCE(line_total, quantity * unit_cost)
WHERE 1=1;
